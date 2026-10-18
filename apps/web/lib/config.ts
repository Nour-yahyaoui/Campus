export function authOptions() {
  const google = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const dev = process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_SIGN_IN === "true";
  return { google, dev };
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
