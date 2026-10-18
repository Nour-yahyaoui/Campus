import { describe, expect, it } from "vitest";
import { addClubMember, makeClub, makeUser, resetDb } from "./helpers";
import { one, query } from "../src/db";
import { completeUpload, deleteMedia, getServableMedia, requestUpload, uploadLimits } from "../src/services/media";
import { putLocalObject, readLocalObject, isValidObjectKey, buildObjectKey, storageInfo } from "../src/storage";
import { getClubBySlug } from "../src/services/clubs";

/** A real 1x1 PNG — the sniffer only accepts genuine image bytes. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** Stands in for the browser PUT to the local-driver upload route. */
async function uploadBytes(input: { url: string; bytes: Buffer }): Promise<void> {
  const key = new URL(input.url, "http://localhost").searchParams.get("key");
  if (!key) throw new Error("presigned URL has no key");
  await putLocalObject(key, new Uint8Array(input.bytes));
}

async function uploadImage(
  me: Parameters<typeof requestUpload>[0],
  kind: Parameters<typeof requestUpload>[1]["kind"],
  scopeId: string | null,
): Promise<{ id: string; url: string }> {
  const pending = await requestUpload(me, { kind, scopeId, contentType: "image/png", byteSize: PNG.byteLength });
  await uploadBytes({ url: pending.upload.url, bytes: PNG });
  const done = await completeUpload(me, pending.mediaId);
  return { id: done.id, url: done.url };
}

describe("image uploads", () => {
  it("issues a presigned upload and attaches the verified image to the club", async () => {
    await resetDb();
    const { club, admin } = await makeClub();
    const pending = await requestUpload(admin, {
      kind: "club_logo",
      scopeId: club.id,
      contentType: "image/png",
      byteSize: PNG.byteLength,
    });

    expect(pending.upload.method).toBe("PUT");
    expect(pending.upload.url).toContain("/api/uploads/body?key=");
    expect(pending.upload.headers["content-type"]).toBe("image/png");
    expect(pending.expiresIn).toBe(300);

    // Nothing is attached until the bytes have been verified.
    const before = await getClubBySlug(club.slug, admin);
    expect(before.logoUrl).toBeNull();

    await uploadBytes({ url: pending.upload.url, bytes: PNG });
    const done = await completeUpload(admin, pending.mediaId);
    expect(done.url).toBe(`/media/${pending.mediaId}`);

    const after = await getClubBySlug(club.slug, admin);
    expect(after.logoUrl).toBe(`/media/${pending.mediaId}`);

    const servable = await getServableMedia(pending.mediaId);
    expect(servable?.contentType).toBe("image/png");
    expect(servable?.objectKey).toMatch(/^club-logo\//);
    expect(await readLocalObject(servable!.objectKey)).toEqual(new Uint8Array(PNG));
  });

  it("rejects a file whose bytes are not an image, and leaves the page untouched", async () => {
    await resetDb();
    const { club, admin } = await makeClub();
    const fake = Buffer.from("this is definitely not a png");
    const pending = await requestUpload(admin, {
      kind: "club_cover",
      scopeId: club.id,
      contentType: "image/png",
      byteSize: fake.byteLength,
    });
    await uploadBytes({ url: pending.upload.url, bytes: fake });

    await expect(completeUpload(admin, pending.mediaId)).rejects.toMatchObject({ code: "invalid_request" });
    const clubAfter = await getClubBySlug(club.slug, admin);
    expect(clubAfter.coverUrl).toBeNull();
    expect(await getServableMedia(pending.mediaId)).toBeNull();
  });

  it("only lets club content editors upload a club logo", async () => {
    await resetDb();
    const { club } = await makeClub();
    const outsider = await makeUser();
    const member = await makeUser();
    await addClubMember(club.id, member.id, "member");

    for (const me of [outsider, member]) {
      await expect(
        requestUpload(me, { kind: "club_logo", scopeId: club.id, contentType: "image/png", byteSize: PNG.byteLength }),
      ).rejects.toMatchObject({ code: "forbidden" });
    }

    const officer = await makeUser();
    await addClubMember(club.id, officer.id, "officer");
    await expect(
      requestUpload(officer, { kind: "club_logo", scopeId: club.id, contentType: "image/png", byteSize: PNG.byteLength }),
    ).resolves.toBeTruthy();
  });

  it("replaces an earlier image of the same kind and deletes the old object", async () => {
    await resetDb();
    const { club, admin } = await makeClub();
    const first = await uploadImage(admin, "club_logo", club.id);
    const firstAsset = await one<{ object_key: string }>("select object_key from media_assets where id = $1", [first.id]);
    const second = await uploadImage(admin, "club_logo", club.id);

    const clubAfter = await getClubBySlug(club.slug, admin);
    expect(clubAfter.logoUrl).toBe(second.url);
    expect(await getServableMedia(first.id)).toBeNull();
    expect(await readLocalObject(firstAsset!.object_key)).toBeNull();
  });

  it("keeps avatars private to their owner and off the upload scope", async () => {
    await resetDb();
    const student = await makeUser();
    const other = await makeUser();
    const avatar = await uploadImage(student, "avatar", null);

    const stored = await one<{ avatar_url: string | null }>("select avatar_url from users where id = $1", [student.id]);
    expect(stored?.avatar_url).toBe(avatar.url);

    await expect(
      requestUpload(student, { kind: "avatar", scopeId: "not-a-page", contentType: "image/png", byteSize: 10 }),
    ).rejects.toMatchObject({ code: "invalid_request" });

    // Someone else cannot complete an upload they did not start.
    const pending = await requestUpload(student, {
      kind: "avatar",
      scopeId: null,
      contentType: "image/png",
      byteSize: PNG.byteLength,
    });
    await uploadBytes({ url: pending.upload.url, bytes: PNG });
    await expect(completeUpload(other, pending.mediaId)).rejects.toMatchObject({ code: "not_found" });
  });

  it("deletes the avatar object when an account is deleted", async () => {
    await resetDb();
    const student = await makeUser();
    const avatar = await uploadImage(student, "avatar", null);
    const asset = await one<{ object_key: string }>("select object_key from media_assets where id = $1", [avatar.id]);

    const { requestDeletion } = await import("../src/services/users");
    await requestDeletion(student);

    expect(await getServableMedia(avatar.id)).toBeNull();
    expect(await readLocalObject(asset!.object_key)).toBeNull();
    const row = await one<{ status: string }>("select status from media_assets where id = $1", [avatar.id]);
    expect(row?.status).toBe("deleted");
  });

  it("removes the attachment when an image is deleted", async () => {
    await resetDb();
    const { club, admin } = await makeClub();
    const logo = await uploadImage(admin, "club_logo", club.id);

    await deleteMedia(admin, logo.id);
    const clubAfter = await getClubBySlug(club.slug, admin);
    expect(clubAfter.logoUrl).toBeNull();
    expect(await getServableMedia(logo.id)).toBeNull();

    const outsider = await makeUser();
    const another = await uploadImage(admin, "club_logo", club.id);
    await expect(deleteMedia(outsider, another.id)).rejects.toMatchObject({ code: "forbidden" });
    // A super admin can remove an image that is not theirs (moderation path).
    const moderator = (await makeClub()).admin;
    await expect(deleteMedia(moderator, another.id)).resolves.toBeUndefined();
  });

  it("refuses content types outside the image allowlist and oversize declarations", async () => {
    await resetDb();
    const { club, admin } = await makeClub();
    await expect(
      requestUpload(admin, { kind: "club_logo", scopeId: club.id, contentType: "image/svg+xml" as never, byteSize: 10 }),
    ).rejects.toMatchObject({ code: "invalid_request" });
    await expect(
      requestUpload(admin, {
        kind: "club_logo",
        scopeId: club.id,
        contentType: "image/png",
        byteSize: uploadLimits().maxBytes + 1,
      }),
    ).rejects.toMatchObject({ code: "invalid_request" });
    await expect(
      requestUpload(admin, { kind: "club_logo", scopeId: club.id, contentType: "image/png", byteSize: 0 }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("validates generated object keys against traversal", () => {
    expect(isValidObjectKey(buildObjectKey("club_logo", "d747269a-c974-4a26-8fb6-057d006d34a5", "png"))).toBe(true);
    expect(isValidObjectKey("../../etc/passwd")).toBe(false);
    expect(isValidObjectKey("Club Logo/x.png")).toBe(false);
    expect(isValidObjectKey("a//b.png")).toBe(false);
    expect(isValidObjectKey("")).toBe(false);
    expect(() => buildObjectKey("club_logo", "", "png")).toThrow();
  });

  it("uses the local driver in tests rather than silently reaching for S3", () => {
    expect(storageInfo().driver).toBe("local");
    expect(storageInfo().bucket).toBe("campus");
    expect(uploadLimits().publicRead).toBe(false);
  });
});

describe("media cleanup", () => {
  it("reaps abandoned pending uploads", async () => {
    await resetDb();
    const { club, admin } = await makeClub();
    const pending = await requestUpload(admin, {
      kind: "club_cover",
      scopeId: club.id,
      contentType: "image/png",
      byteSize: PNG.byteLength,
    });
    await query("update media_assets set created_at = now() - interval '2 hours' where id = $1", [pending.mediaId]);

    const { cleanupStaleMedia } = await import("../src/services/media");
    const removed = await cleanupStaleMedia();
    expect(removed).toBeGreaterThanOrEqual(1);

    const row = await one<{ status: string }>("select status from media_assets where id = $1", [pending.mediaId]);
    expect(row?.status).toBe("deleted");
  });
});
