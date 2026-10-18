/**
 * Where to send someone after signing in.
 *
 * A leading slash is not enough: browsers treat `\` as `/` in URLs, so
 * `/\evil.example` resolves to `https://evil.example` and a redirect to it
 * leaves the site. Control characters are refused for the same reason (they
 * are stripped during URL parsing, which can turn `/\t/evil` into `//evil`).
 * The value is re-serialised from the parsed URL so nothing ambiguous survives.
 */
export function safeNext(value: string | null | undefined): string {
  const fallback = "/dashboard";
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (value.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const parsed = new URL(value, "https://next.invalid");
    if (parsed.origin !== "https://next.invalid") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
