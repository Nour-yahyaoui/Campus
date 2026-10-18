import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  DeleteObjectCommand,
  GetBucketCorsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Object storage for uploaded images.
 *
 * The production driver is S3-compatible; Neon Object Storage is the reference
 * deployment (branch endpoint + `storage:read`/`storage:write` credentials).
 * Any S3 provider works by changing the endpoint and bucket.
 *
 * A local filesystem driver exists for development, tests and previews where
 * no credentials are available. It writes inside the repository's `.data/`
 * directory (git-ignored) and is refused in production — a container
 * filesystem is ephemeral, so silently accepting uploads there would lose every
 * image on the next deploy.
 */

export type StorageDriver = "s3" | "local";

export interface StorageInfo {
  driver: StorageDriver;
  bucket: string;
  /** Public base URL for a `public_read` bucket, without a trailing slash. */
  publicBaseUrl: string | null;
  configured: boolean;
}

const DEFAULT_BUCKET = "campus";
const MAX_OBJECT_BYTES = 8 * 1024 * 1024;

let cachedClient: S3Client | null = null;

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

function endpoint(): string | undefined {
  return env("AWS_ENDPOINT_URL_S3") ?? env("S3_ENDPOINT");
}

function hasCredentials(): boolean {
  return Boolean(env("AWS_ACCESS_KEY_ID") && env("AWS_SECRET_ACCESS_KEY") && endpoint());
}

export function storageDriver(): StorageDriver {
  const requested = env("STORAGE_DRIVER");
  if (requested === "local" || requested === "s3") return requested;
  // auto
  return hasCredentials() ? "s3" : "local";
}

export function storageInfo(): StorageInfo {
  const driver = storageDriver();
  return {
    driver,
    bucket: env("STORAGE_BUCKET") ?? DEFAULT_BUCKET,
    publicBaseUrl: (env("STORAGE_PUBLIC_BASE_URL") ?? "").replace(/\/+$/, "") || null,
    configured: driver === "s3" && hasCredentials(),
  };
}

export function maxObjectBytes(): number {
  return MAX_OBJECT_BYTES;
}

function s3(): S3Client {
  if (!hasCredentials()) {
    throw new Error(
      "Object storage is not configured: set AWS_ENDPOINT_URL_S3, AWS_REGION, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.",
    );
  }
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: env("AWS_REGION") ?? "us-east-2",
      endpoint: endpoint(),
      credentials: {
        accessKeyId: env("AWS_ACCESS_KEY_ID")!,
        secretAccessKey: env("AWS_SECRET_ACCESS_KEY")!,
      },
      // Required for non-AWS S3 endpoints such as Neon's storage host.
      forcePathStyle: env("S3_FORCE_PATH_STYLE") !== "false",
      requestHandler: { requestTimeout: 15_000, connectionTimeout: 5_000 },
    });
  }
  return cachedClient;
}

function bucket(): string {
  return storageInfo().bucket;
}

/* ------------------------------------------------------------------ */
/* Keys                                                                */
/* ------------------------------------------------------------------ */

/**
 * Keys are generated server-side only, and validated again before any
 * filesystem access so a compromised row cannot escape the local storage
 * directory (`../`), address another bucket prefix, or contain control bytes.
 */
const KEY_PATTERN = /^[a-z0-9][a-z0-9/_.-]{0,200}$/;

export function isValidObjectKey(key: string): boolean {
  return KEY_PATTERN.test(key) && !key.includes("..") && !key.includes("//");
}

export function buildObjectKey(kind: string, scope: string, extension: string): string {
  const prefix = kind.replace(/_/g, "-");
  const safeScope = scope.replace(/[^a-zA-Z0-9-]/g, "");
  if (!safeScope) throw new Error("An object key needs a scope");
  const safeExtension = extension.replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
  const id = randomUUID();
  const key = `${prefix}/${safeScope}/${id}.${safeExtension}`;
  if (!isValidObjectKey(key)) throw new Error("Generated object key is invalid");
  return key;
}

export function publicUrlFor(key: string): string | null {
  const base = storageInfo().publicBaseUrl;
  if (!base) return null;
  return `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/* ------------------------------------------------------------------ */
/* Local driver                                                        */
/* ------------------------------------------------------------------ */

export function localStorageRoot(): string {
  const configured = env("STORAGE_LOCAL_DIR");
  if (configured) return configured;
  return path.join(process.cwd(), ".data", "uploads");
}

async function localPath(key: string): Promise<string> {
  if (!isValidObjectKey(key)) throw new Error("Invalid object key");
  const root = localStorageRoot();
  const full = path.resolve(/*turbopackIgnore: true*/ root, key);
  if (!full.startsWith(path.resolve(/*turbopackIgnore: true*/ root) + path.sep)) {
    throw new Error("Invalid object key");
  }
  return full;
}

export async function putLocalObject(key: string, bytes: Uint8Array): Promise<void> {
  const full = await localPath(key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, bytes, { mode: 0o600 });
}

export async function readLocalObject(key: string): Promise<Uint8Array | null> {
  try {
    const full = await localPath(key);
    const buffer = await fs.readFile(/*turbopackIgnore: true*/ full);
    return new Uint8Array(buffer);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Driver-agnostic operations                                          */
/* ------------------------------------------------------------------ */

export interface PresignedUpload {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresIn: number;
}

export async function presignUpload(
  key: string,
  contentType: string,
  expiresIn = 300,
): Promise<PresignedUpload> {
  if (storageDriver() === "local") {
    // The local driver has no out-of-process endpoint: the browser uploads to
    // our own route handler, which writes the file. Same two-step flow.
    return {
      url: `/api/uploads/body?key=${encodeURIComponent(key)}`,
      method: "PUT",
      headers: { "content-type": contentType },
      expiresIn,
    };
  }
  const url = await getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    { expiresIn },
  );
  return { url, method: "PUT", headers: { "content-type": contentType }, expiresIn };
}

export async function presignDownload(key: string, expiresIn = 300): Promise<string | null> {
  if (storageDriver() === "local") return null;
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn });
}

export async function statObject(key: string): Promise<{ size: number; contentType: string | null } | null> {
  if (storageDriver() === "local") {
    try {
      const full = await localPath(key);
      const stat = await fs.stat(/*turbopackIgnore: true*/ full);
      return { size: stat.size, contentType: null };
    } catch {
      return null;
    }
  }
  try {
    const head = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return { size: Number(head.ContentLength ?? 0), contentType: head.ContentType ?? null };
  } catch {
    return null;
  }
}

/** First bytes of the object, used to verify the file really is the image it claims to be. */
export async function readObjectHead(key: string, bytes = 64): Promise<Uint8Array | null> {
  const length = Math.max(16, Math.min(256, bytes));
  if (storageDriver() === "local") {
    try {
      const full = await localPath(key);
      const handle = await fs.open(/*turbopackIgnore: true*/ full, "r");
      try {
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await handle.read(buffer, 0, length, 0);
        return new Uint8Array(buffer.subarray(0, bytesRead));
      } finally {
        await handle.close();
      }
    } catch {
      return null;
    }
  }
  try {
    const response = await s3().send(
      new GetObjectCommand({ Bucket: bucket(), Key: key, Range: `bytes=0-${length - 1}` }),
    );
    const body = await response.Body?.transformToByteArray();
    return body ? new Uint8Array(body) : null;
  } catch {
    return null;
  }
}

export async function deleteObject(key: string): Promise<void> {
  if (storageDriver() === "local") {
    try {
      await fs.rm(await localPath(key), { force: true });
    } catch {
      /* already gone */
    }
    return;
  }
  try {
    await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  } catch (error) {
    // Deleting is best-effort: a stale object costs storage, a failed request
    // must not fail the user's action.
    console.error("[storage] delete failed", error instanceof Error ? error.message : error);
  }
}

/* ------------------------------------------------------------------ */
/* Content sniffing                                                    */
/* ------------------------------------------------------------------ */

const SIGNATURES: Array<{ type: string; extension: string; matches: (bytes: Uint8Array) => boolean }> = [
  {
    type: "image/jpeg",
    extension: "jpg",
    matches: (b) => b.length > 2 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    type: "image/png",
    extension: "png",
    matches: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    type: "image/webp",
    extension: "webp",
    // RIFF....WEBP
    matches: (b) =>
      b.length >= 12 &&
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
  },
  {
    type: "image/avif",
    extension: "avif",
    // ISO-BMFF: ....ftyp[avif|avis]
    matches: (b) =>
      b.length >= 12 &&
      b[4] === 0x66 &&
      b[5] === 0x74 &&
      b[6] === 0x79 &&
      b[7] === 0x70 &&
      ((b[8] === 0x61 && b[9] === 0x76 && b[10] === 0x69 && b[11] === 0x66) ||
        (b[8] === 0x61 && b[9] === 0x76 && b[10] === 0x69 && b[11] === 0x73)),
  },
];

export const ALLOWED_IMAGE_TYPES = SIGNATURES.map((signature) => signature.type);

/** Returns the detected MIME type, or null when the bytes are not an allowed image. */
export function sniffImageType(bytes: Uint8Array): string | null {
  for (const signature of SIGNATURES) {
    if (signature.matches(bytes)) return signature.type;
  }
  return null;
}

export function extensionFor(contentType: string): string | null {
  return SIGNATURES.find((signature) => signature.type === contentType)?.extension ?? null;
}

export function checksumOf(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/* ------------------------------------------------------------------ */
/* CORS                                                                */
/* ------------------------------------------------------------------ */

/**
 * Browser uploads PUT directly to the storage host, which is a cross-origin
 * request. Without a CORS rule the browser blocks it *before* the request is
 * sent, and the only symptom is "the image did not reach storage" in the UI.
 * Neon Object Storage supports `PutBucketCors` (and answers preflights
 * automatically), so the rule can be applied from here instead of by hand.
 */
export async function configureBucketCors(origins: string[]): Promise<void> {
  const unique = [...new Set(origins.map((origin) => origin.replace(/\/+$/, "")).filter(Boolean))];
  if (unique.length === 0) throw new Error("At least one allowed origin is required.");
  await s3().send(
    new PutBucketCorsCommand({
      Bucket: bucket(),
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: unique,
            AllowedMethods: ["GET", "PUT", "HEAD"],
            AllowedHeaders: ["content-type", "x-amz-*"],
            ExposeHeaders: ["etag"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );
}

export interface BucketCorsRule {
  allowedOrigins: string[];
  allowedMethods: string[];
}

/** Reads the rule back so `npm run storage:cors` can prove what it applied. */
export async function getBucketCors(): Promise<BucketCorsRule[] | null> {
  try {
    const result = await s3().send(new GetBucketCorsCommand({ Bucket: bucket() }));
    return (result.CORSRules ?? []).map((rule) => ({
      allowedOrigins: rule.AllowedOrigins ?? [],
      allowedMethods: rule.AllowedMethods ?? [],
    }));
  } catch (error) {
    // No rule configured yet — not an error for a read-back after a write.
    if (error instanceof Error && /NoSuchCORSConfiguration/i.test(error.name + error.message)) return null;
    throw error;
  }
}
