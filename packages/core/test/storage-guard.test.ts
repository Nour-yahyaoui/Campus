import { afterEach, describe, expect, it, vi } from "vitest";
import { presignUpload, putLocalObject, storageInfo } from "../src/storage";

/**
 * The documentation promises that the local filesystem driver is refused in
 * production. These tests hold the implementation to that promise, because the
 * failure mode is silent: a lambda's `/tmp` looks like a successful upload.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("object storage in production", () => {
  it("reports itself as unconfigured when no bucket is present", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STORAGE_DRIVER", "local");
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_ENDPOINT_URL_S3;
    delete process.env.S3_ENDPOINT;
    expect(storageInfo()).toMatchObject({ driver: "local", configured: false });
  });

  it("refuses to presign an upload instead of writing to an ephemeral disk", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STORAGE_DRIVER", "local");
    await expect(presignUpload("avatar/scope/id.png", "image/png")).rejects.toMatchObject({
      code: "unavailable",
      status: 503,
    });
  });

  it("refuses a direct local write in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STORAGE_DRIVER", "local");
    await expect(putLocalObject("avatar/scope/id.png", new Uint8Array([1]))).rejects.toMatchObject({
      code: "unavailable",
    });
  });

  it("still presigns to the internal route in development", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("STORAGE_DRIVER", "local");
    const upload = await presignUpload("avatar/scope/id.png", "image/png");
    expect(upload.url).toContain("/api/uploads/body?key=");
  });
});
