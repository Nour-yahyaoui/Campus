/**
 * Apply the CORS rule the browser needs to upload images straight to storage.
 *
 * The browser sends `PUT <presigned URL>` to the storage host, which is a
 * different origin from the site. S3-compatible providers reject or block that
 * at the browser level unless the bucket allows it, and the failure surfaces in
 * the UI as "the image did not reach storage" — with nothing in the server logs,
 * because the request never left the browser. Run this once per bucket (and
 * again after changing domains).
 *
 * Usage, from the repository root:
 *
 *   # with STORAGE_BUCKET / AWS_* in .env or exported
 *   npm run storage:cors
 *
 *   # add extra origins (preview deployments, a second domain)
 *   EXTRA_ORIGINS="https://staging.example.edu,https://campus-web.onrender.com" npm run storage:cors
 *
 * The canonical origin comes from NEXT_PUBLIC_SITE_URL; localhost is added
 * outside production so `npm run dev` with real credentials also works.
 */
import { configureBucketCors, getBucketCors, storageInfo } from "@campussphere/core";

async function main(): Promise<void> {
  const info = storageInfo();
  if (info.driver !== "s3") {
    console.error(
      "Object storage is not configured (no AWS credentials found), so there is nothing to configure.\n" +
        "Set STORAGE_BUCKET, AWS_ENDPOINT_URL_S3, AWS_REGION, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY first.",
    );
    process.exit(2);
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  const origins = [
    ...(site ? [site] : []),
    ...(process.env.NODE_ENV === "production" ? [] : ["http://localhost:3000"]),
    ...(process.env.EXTRA_ORIGINS ?? "").split(",").map((value) => value.trim()),
  ].filter(Boolean);

  if (origins.length === 0) {
    console.error("NEXT_PUBLIC_SITE_URL is not set, so there is no origin to allow.");
    process.exit(2);
  }

  console.log(`bucket   ${info.bucket} (${info.driver})`);
  console.log(`origins  ${origins.join(", ")}`);
  await configureBucketCors(origins);

  const applied = await getBucketCors();
  if (!applied) {
    console.error("The rule was sent but could not be read back. Check the bucket in the console.");
    process.exit(1);
  }
  for (const rule of applied) {
    console.log(`applied  ${rule.allowedMethods.join(",")} from ${rule.allowedOrigins.join(", ")}`);
  }
  console.log("\nNow upload an image from the deployed site to confirm the browser accepts it.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
