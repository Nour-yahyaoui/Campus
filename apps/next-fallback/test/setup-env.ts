(process.env as { NODE_ENV?: string }).NODE_ENV = "test";
process.env.APP_ENV = "test";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:55432/campussphere_test";
process.env.ALLOW_DEV_SIGN_IN = "true";
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
process.env.RATE_LIMIT_DISABLED = "false";
