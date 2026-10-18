import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startS3Stub, type S3Stub } from "./s3-stub";
import { makeClub, makeUser, resetDb } from "./helpers";
import { configureBucketCors, getBucketCors, storageInfo } from "../src/storage";
import { completeUpload, deleteMedia, getServableMedia, requestUpload } from "../src/services/media";
import { getClubBySlug } from "../src/services/clubs";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * The production storage path, exercised against a local S3-compatible stub:
 * presigned PUT URL, browser upload, verified completion, presigned GET
 * redirect, delete and CORS configuration. Signature *verification* is the one
 * thing this cannot prove — that needs a real bucket.
 */
describe("object storage (S3 path)", () => {
  let stub: S3Stub;

  beforeAll(async () => {
    stub = await startS3Stub();
    process.env.STORAGE_DRIVER = "s3";
    process.env.STORAGE_BUCKET = "campus";
    process.env.AWS_ENDPOINT_URL_S3 = stub.endpoint;
    process.env.AWS_REGION = "eu-central-1";
    process.env.AWS_ACCESS_KEY_ID = "test-access-key";
    process.env.AWS_SECRET_ACCESS_KEY = "test-secret-key";
    process.env.S3_FORCE_PATH_STYLE = "true";
    delete process.env.STORAGE_PUBLIC_BASE_URL;
  });

  afterAll(async () => {
    await stub.close();
    process.env.STORAGE_DRIVER = "local";
    delete process.env.AWS_ENDPOINT_URL_S3;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
  });

  it("reports the S3 driver and the configured bucket", () => {
    const info = storageInfo();
    expect(info.driver).toBe("s3");
    expect(info.bucket).toBe("campus");
    expect(info.configured).toBe(true);
    expect(info.publicBaseUrl).toBeNull();
  });

  it("presigns a path-style PUT, uploads, verifies and serves with a presigned GET", async () => {
    await resetDb();
    const { club, admin } = await makeClub();
    const pending = await requestUpload(admin, {
      kind: "club_logo",
      scopeId: club.id,
      contentType: "image/png",
      byteSize: PNG.byteLength,
    });

    // Path-style addressing is mandatory for Neon; a virtual-host URL would be
    // signed against a hostname that does not exist.
    expect(pending.upload.url.startsWith(`${stub.endpoint}/campus/club-logo/`)).toBe(true);
    expect(pending.upload.url).toContain("X-Amz-Signature=");
    expect(pending.upload.url).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256");
    expect(pending.upload.headers["content-type"]).toBe("image/png");

    // What the browser does with the presigned URL — no credentials involved.
    const put = await fetch(pending.upload.url, {
      method: pending.upload.method,
      headers: pending.upload.headers,
      body: new Uint8Array(PNG),
    });
    expect(put.status).toBe(200);
    expect(stub.objects.size).toBeGreaterThan(0);

    const done = await completeUpload(admin, pending.mediaId);
    expect(done.url).toBe(`/media/${pending.mediaId}`);
    expect((await getClubBySlug(club.slug, admin)).logoUrl).toBe(done.url);

    const servable = await getServableMedia(pending.mediaId);
    expect(servable?.publicUrl).toBeNull();
    expect(servable?.local).toBe(false);
    expect(servable?.signedUrl).toContain(`${stub.endpoint}/campus/club-logo/`);
    expect(servable?.signedUrl).toContain("X-Amz-Signature=");

    // The redirect target must actually return the bytes.
    const download = await fetch(servable!.signedUrl!);
    expect(download.status).toBe(200);
    expect(Buffer.from(await download.arrayBuffer())).toEqual(PNG);
  });

  it("uses the public base URL when the bucket is public_read", async () => {
    process.env.STORAGE_PUBLIC_BASE_URL = "https://branch.storage.example.edu/campus/";
    try {
      const { club, admin } = await makeClub();
      const pending = await requestUpload(admin, {
        kind: "club_cover",
        scopeId: club.id,
        contentType: "image/png",
        byteSize: PNG.byteLength,
      });
      await fetch(pending.upload.url, {
        method: "PUT",
        headers: pending.upload.headers,
        body: new Uint8Array(PNG),
      });
      await completeUpload(admin, pending.mediaId);

      const servable = await getServableMedia(pending.mediaId);
      // Trailing slash on the configured base must not produce `//`.
      expect(servable?.publicUrl?.startsWith("https://branch.storage.example.edu/campus/club-cover/")).toBe(true);
      expect(servable?.signedUrl).toBeNull();
    } finally {
      delete process.env.STORAGE_PUBLIC_BASE_URL;
    }
  });

  it("rejects a cover whose id is not the right kind of page", async () => {
    await resetDb();
    const { club } = await makeClub();
    const student = await makeUser();
    // A club id is not an event id: the event-cover branch looks the event up
    // and refuses with `not_found`, which also avoids leaking which ids exist.
    await expect(
      requestUpload(student, {
        kind: "event_cover",
        scopeId: club.id,
        contentType: "image/png",
        byteSize: PNG.byteLength,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("deletes the stored object and the attachment", async () => {
    await resetDb();
    const { club, admin } = await makeClub();
    const pending = await requestUpload(admin, {
      kind: "club_logo",
      scopeId: club.id,
      contentType: "image/png",
      byteSize: PNG.byteLength,
    });
    await fetch(pending.upload.url, {
      method: "PUT",
      headers: pending.upload.headers,
      body: new Uint8Array(PNG),
    });
    const done = await completeUpload(admin, pending.mediaId);
    const objectKey = (await getServableMedia(done.id))!.objectKey;
    expect(stub.objects.has(objectKey)).toBe(true);

    await deleteMedia(admin, done.id);
    expect(stub.objects.has(objectKey)).toBe(false);
    expect((await getClubBySlug(club.slug, admin)).logoUrl).toBeNull();
  });

  it("applies and reads back a CORS rule with the site origin", async () => {
    await configureBucketCors(["https://campus.example.edu/", "http://localhost:3000"]);
    const rules = await getBucketCors();
    expect(rules).toHaveLength(1);
    expect(rules![0]!.allowedOrigins).toEqual(["https://campus.example.edu", "http://localhost:3000"]);
    expect(rules![0]!.allowedMethods).toEqual(["GET", "PUT", "HEAD"]);
  });

  it("refuses to build a key without a scope", async () => {
    await resetDb();
    const { admin } = await makeClub();
    await expect(
      requestUpload(admin, { kind: "club_logo", scopeId: null, contentType: "image/png", byteSize: 10 }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });
});
