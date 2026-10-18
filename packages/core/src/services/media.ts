import type { MediaKind } from "@campussphere/contracts";
import { MEDIA_KINDS } from "@campussphere/contracts";
import type { Me } from "../auth";
import { isSuperAdmin } from "../auth";
import { many, one, query } from "../db";
import { badRequest, conflict, forbidden, notFound } from "../errors";
import { writeAudit } from "../audit";
import {
  buildObjectKey,
  deleteObject,
  extensionFor,
  isValidObjectKey,
  maxObjectBytes,
  presignDownload,
  presignUpload,
  putLocalObject,
  publicUrlFor,
  readObjectHead,
  sniffImageType,
  statObject,
  storageDriver,
  storageInfo,
} from "../storage";
import { requireClubAccess } from "./clubs";
import { projectAccess } from "./projects";
import { canManageEvent } from "./events";

/**
 * Image uploads. The browser never sends bytes through the application in
 * production: the server authorizes the request, mints a short-lived presigned
 * PUT, and the browser uploads straight to object storage. Completion then
 * verifies the object really exists, really is the declared size, and really
 * starts with the bytes of an allowed image type before anything is attached
 * to a user, club, project or event.
 */

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const PENDING_PER_HOUR = 30;
const READY_PER_USER = 200;
const UPLOAD_EXPIRY_SECONDS = 300;

export interface RequestUploadInput {
  kind: MediaKind;
  scopeId?: string | null;
  contentType: string;
  byteSize: number;
}

export interface PendingUpload {
  mediaId: string;
  upload: { url: string; method: "PUT"; headers: Record<string, string> };
  expiresIn: number;
}

export interface CompletedUpload {
  id: string;
  url: string;
  kind: MediaKind;
  contentType: string;
  byteSize: number;
}

function assertKind(value: string): MediaKind {
  if (!(MEDIA_KINDS as readonly string[]).includes(value)) {
    throw badRequest("That image type is not supported.");
  }
  return value as MediaKind;
}

function normalizeScope(kind: MediaKind, scopeId: string | null | undefined): string | null {
  if (kind === "avatar") {
    if (scopeId) throw badRequest("An avatar is not attached to a page.");
    return null;
  }
  if (!scopeId || !/^[0-9a-f-]{36}$/i.test(scopeId)) {
    throw badRequest("Choose the page this image belongs to.");
  }
  return scopeId;
}

async function assertCanUpload(me: Me, kind: MediaKind, scopeId: string | null): Promise<void> {
  if (kind === "avatar") return;
  if (!scopeId) throw badRequest("Choose the page this image belongs to.");
  if (isSuperAdmin(me)) return;

  if (kind === "club_logo" || kind === "club_cover") {
    await requireClubAccess(scopeId, me, "content");
    return;
  }
  if (kind === "project_cover") {
    const access = await projectAccess(scopeId, me);
    if (!access.isLead) throw forbidden("Only the project lead can change the project image.");
    return;
  }
  if (kind === "event_cover") {
    if (!(await canManageEvent(scopeId, me))) {
      throw forbidden("Only the organizers can change the event image.");
    }
    return;
  }
}

export async function requestUpload(me: Me, input: RequestUploadInput): Promise<PendingUpload> {
  if (storageDriver() === "local" && process.env.NODE_ENV === "production") {
    throw conflict(
      "Image storage is not configured on this deployment. Set the object storage credentials before enabling uploads.",
    );
  }

  const kind = assertKind(input.kind);
  const scopeId = normalizeScope(kind, input.scopeId);
  const contentType = input.contentType.toLowerCase().split(";")[0]!.trim();
  const extension = extensionFor(contentType);
  if (!extension) throw badRequest("Upload a JPEG, PNG, WebP or AVIF image.");
  const byteSize = Math.floor(Number(input.byteSize));
  if (!Number.isFinite(byteSize) || byteSize <= 0) throw badRequest("That file is empty.");
  if (byteSize > MAX_IMAGE_BYTES || byteSize > maxObjectBytes()) {
    throw badRequest(`Images must be smaller than ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB.`);
  }

  await assertCanUpload(me, kind, scopeId);

  const recent = await one<{ n: number }>(
    `select count(*)::int as n from media_assets
      where owner_id = $1 and created_at > now() - interval '1 hour'`,
    [me.id],
  );
  if ((recent?.n ?? 0) >= PENDING_PER_HOUR) {
    throw conflict("Too many image uploads in the last hour. Try again later.");
  }
  const ready = await one<{ n: number }>(
    "select count(*)::int as n from media_assets where owner_id = $1 and status = 'ready'",
    [me.id],
  );
  if ((ready?.n ?? 0) >= READY_PER_USER) {
    throw conflict("You have reached the image limit for this account. Remove an older image first.");
  }

  const key = buildObjectKey(kind, scopeId ?? me.id, extension);
  const inserted = await one<{ id: string }>(
    `insert into media_assets (owner_id, kind, scope_id, object_key, content_type, byte_size)
     values ($1, $2::media_kind, $3::uuid, $4, $5, $6)
     returning id`,
    [me.id, kind, scopeId, key, contentType, byteSize],
  );
  const mediaId = inserted!.id;

  let upload;
  try {
    upload = await presignUpload(key, contentType, UPLOAD_EXPIRY_SECONDS);
  } catch (error) {
    // Do not leave a pending row behind if storage is misconfigured.
    await query("delete from media_assets where id = $1", [mediaId]);
    throw error;
  }

  await writeAudit({
    actorId: me.id,
    action: "media.upload_requested",
    entityType: "media",
    entityId: mediaId,
    metadata: { kind, scopeId, contentType, byteSize },
  });

  return {
    mediaId,
    upload: { url: upload.url, method: upload.method, headers: upload.headers },
    expiresIn: upload.expiresIn,
  };
}

/** Where a ready asset is referenced once attached. Stable even if the storage host changes. */
export function mediaUrl(mediaId: string): string {
  return `/media/${mediaId}`;
}

async function attachToEntity(kind: MediaKind, scopeId: string | null, ownerId: string, url: string): Promise<void> {
  if (kind === "avatar") {
    await query("update users set avatar_url = $2 where id = $1", [ownerId, url]);
    return;
  }
  if (kind === "club_logo") {
    await query("update clubs set logo_url = $2, updated_at = now() where id = $1", [scopeId, url]);
    return;
  }
  if (kind === "club_cover") {
    await query("update clubs set cover_url = $2, updated_at = now() where id = $1", [scopeId, url]);
    return;
  }
  if (kind === "project_cover") {
    await query("update projects set cover_url = $2, updated_at = now() where id = $1", [scopeId, url]);
    return;
  }
  if (kind === "event_cover") {
    await query("update events set cover_url = $2, updated_at = now() where id = $1", [scopeId, url]);
    return;
  }
}

async function detachFromEntity(kind: MediaKind, scopeId: string | null, url: string): Promise<void> {
  const column =
    kind === "avatar"
      ? { table: "users", field: "avatar_url" }
      : kind === "club_logo"
        ? { table: "clubs", field: "logo_url" }
        : kind === "club_cover"
          ? { table: "clubs", field: "cover_url" }
          : kind === "project_cover"
            ? { table: "projects", field: "cover_url" }
            : { table: "events", field: "cover_url" };
  if (kind === "avatar") {
    await query(`update users set ${column.field} = null where ${column.field} = $1`, [url]);
    return;
  }
  await query(`update ${column.table} set ${column.field} = null where id = $1 and ${column.field} = $2`, [
    scopeId,
    url,
  ]);
}

/** Supersedes any earlier ready image of the same kind for the same page. */
async function supersedePrevious(assetId: string, kind: MediaKind, scopeId: string | null): Promise<void> {
  const previous = await many<{ id: string; object_key: string }>(
    kind === "avatar"
      ? "select id, object_key from media_assets where kind = $1::media_kind and owner_id = (select owner_id from media_assets where id = $2) and status = 'ready' and id <> $2"
      : "select id, object_key from media_assets where kind = $1::media_kind and scope_id = $3 and status = 'ready' and id <> $2",
    kind === "avatar" ? [kind, assetId] : [kind, assetId, scopeId],
  );
  for (const row of previous) {
    await query("update media_assets set status = 'deleted', deleted_at = now() where id = $1", [row.id]);
    await deleteObject(row.object_key);
  }
}

export async function completeUpload(me: Me, mediaId: string): Promise<CompletedUpload> {
  if (!/^[0-9a-f-]{36}$/i.test(mediaId)) throw notFound("Upload not found");
  const asset = await one<{
    id: string;
    owner_id: string;
    kind: MediaKind;
    scope_id: string | null;
    object_key: string;
    content_type: string;
    byte_size: number;
    status: string;
    created_at: Date;
  }>("select * from media_assets where id = $1", [mediaId]);

  if (!asset || asset.owner_id !== me.id) throw notFound("Upload not found");
  if (asset.status === "ready") {
    return {
      id: asset.id,
      url: mediaUrl(asset.id),
      kind: asset.kind,
      contentType: asset.content_type,
      byteSize: asset.byte_size,
    };
  }
  if (asset.status !== "pending") throw notFound("Upload not found");
  if (Date.now() - asset.created_at.getTime() > 30 * 60 * 1000) {
    await query("update media_assets set status = 'deleted', deleted_at = now() where id = $1", [asset.id]);
    await deleteObject(asset.object_key);
    throw badRequest("That upload expired. Choose the image again.");
  }

  const fail = async (message: string): Promise<never> => {
    await query("update media_assets set status = 'deleted', deleted_at = now() where id = $1", [asset.id]);
    await deleteObject(asset.object_key);
    throw badRequest(message);
  };

  if (!isValidObjectKey(asset.object_key)) throw badRequest("Upload not found");
  const stat = await statObject(asset.object_key);
  if (!stat) throw badRequest("The upload did not reach storage. Try again.");
  if (stat.size !== asset.byte_size) {
    await fail("The uploaded file does not match the declared size. Try again.");
  }
  if (stat.size > maxObjectBytes()) {
    await fail("That image is too large.");
  }
  if (stat.contentType && stat.contentType.toLowerCase() !== asset.content_type) {
    await fail("The uploaded file type does not match. Try again.");
  }

  const head = await readObjectHead(asset.object_key);
  const sniffed = head ? sniffImageType(head) : null;
  if (!sniffed || sniffed !== asset.content_type) {
    await fail("That file is not a valid image. Upload a JPEG, PNG, WebP or AVIF.");
  }

  await query(
    "update media_assets set status = 'ready', completed_at = now() where id = $1 and status = 'pending'",
    [asset.id],
  );
  const url = mediaUrl(asset.id);
  await attachToEntity(asset.kind, asset.scope_id, asset.owner_id, url);
  await supersedePrevious(asset.id, asset.kind, asset.scope_id);

  await writeAudit({
    actorId: me.id,
    action: "media.upload_completed",
    entityType: "media",
    entityId: asset.id,
    metadata: { kind: asset.kind, scopeId: asset.scope_id, byteSize: asset.byte_size },
  });

  return {
    id: asset.id,
    url,
    kind: asset.kind,
    contentType: asset.content_type,
    byteSize: asset.byte_size,
  };
}

/** Called by the local-driver upload route; never reachable when S3 is configured. */
export async function receiveLocalUpload(me: Me, key: string, bytes: Uint8Array): Promise<void> {
  if (storageDriver() !== "local") throw notFound("Not found");
  const asset = await one<{ id: string; owner_id: string; object_key: string; status: string; byte_size: number }>(
    "select id, owner_id, object_key, status, byte_size from media_assets where object_key = $1",
    [key],
  );
  if (!asset || asset.owner_id !== me.id || asset.status !== "pending") throw notFound("Upload not found");
  if (bytes.byteLength === 0) throw badRequest("That file is empty.");
  if (bytes.byteLength > asset.byte_size) throw badRequest("That file is larger than declared.");
  await putLocalObject(asset.object_key, bytes);
}

export async function deleteMedia(me: Me, mediaId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(mediaId)) throw notFound("Image not found");
  const asset = await one<{
    id: string;
    owner_id: string;
    kind: MediaKind;
    scope_id: string | null;
    object_key: string;
    status: string;
  }>("select id, owner_id, kind, scope_id, object_key, status from media_assets where id = $1", [mediaId]);
  if (!asset || asset.status === "deleted") throw notFound("Image not found");
  if (asset.owner_id !== me.id && !isSuperAdmin(me)) {
    throw forbidden("Only the person who uploaded this image can remove it.");
  }
  await query("update media_assets set status = 'deleted', deleted_at = now() where id = $1", [asset.id]);
  await detachFromEntity(asset.kind, asset.scope_id, mediaUrl(asset.id));
  await deleteObject(asset.object_key);
  await writeAudit({
    actorId: me.id,
    action: "media.deleted",
    entityType: "media",
    entityId: asset.id,
    metadata: { kind: asset.kind, scopeId: asset.scope_id },
  });
}

export interface ServableMedia {
  id: string;
  objectKey: string;
  contentType: string;
  publicUrl: string | null;
  signedUrl: string | null;
  local: boolean;
}

/** Everything the `/media/:id` route needs, or null when the asset is not public. */
export async function getServableMedia(mediaId: string): Promise<ServableMedia | null> {
  if (!/^[0-9a-f-]{36}$/i.test(mediaId)) return null;
  const asset = await one<{ id: string; object_key: string; content_type: string }>(
    "select id, object_key, content_type from media_assets where id = $1 and status = 'ready'",
    [mediaId],
  );
  if (!asset) return null;
  const local = storageDriver() === "local";
  const publicUrl = publicUrlFor(asset.object_key);
  return {
    id: asset.id,
    objectKey: asset.object_key,
    contentType: asset.content_type,
    publicUrl,
    // A public object needs no signature; skipping it avoids a needless
    // signing round-trip on every image request.
    signedUrl: local || publicUrl ? null : await presignDownload(asset.object_key, 300),
    local,
  };
}

/** Reclaims abandoned presigned uploads. Called by the durable worker. */
export async function cleanupStaleMedia(): Promise<number> {
  const stale = await many<{ id: string; object_key: string }>(
    "select id, object_key from media_assets where status = 'pending' and created_at < now() - interval '1 hour' limit 200",
  );
  for (const row of stale) {
    await deleteObject(row.object_key);
  }
  if (stale.length > 0) {
    await query(
      "update media_assets set status = 'deleted', deleted_at = now() where id = any($1::uuid[])",
      [stale.map((row) => row.id)],
    );
  }
  return stale.length;
}

export function uploadLimits(): { maxBytes: number; driver: string; bucket: string; publicRead: boolean } {
  const info = storageInfo();
  return {
    maxBytes: MAX_IMAGE_BYTES,
    driver: info.driver,
    bucket: info.bucket,
    publicRead: Boolean(info.publicBaseUrl),
  };
}
