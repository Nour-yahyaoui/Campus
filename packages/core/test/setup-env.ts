process.env.NODE_ENV = "test";
process.env.APP_ENV = "test";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:55432/campussphere_test";
process.env.ALLOW_DEV_SIGN_IN = "true";
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
process.env.RATE_LIMIT_DISABLED = "false";
// Image uploads run against the local filesystem driver in tests; object
// storage is exercised separately and is not required to run the suite.
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_BUCKET = "campus";
process.env.STORAGE_LOCAL_DIR = `${process.env.TMPDIR ?? "/tmp"}/campussphere-test-uploads`;
delete process.env.AWS_ACCESS_KEY_ID;
delete process.env.AWS_SECRET_ACCESS_KEY;
delete process.env.AWS_ENDPOINT_URL_S3;
