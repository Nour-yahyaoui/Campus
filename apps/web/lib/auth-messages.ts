/**
 * Fixed sign-in messages.
 *
 * The login page used to render `?error=` verbatim. React escapes it, so it was
 * never XSS — but it let anyone put arbitrary sentences ("Your account is
 * locked, call +216 …") inside a trusted notice on our own domain. The URL now
 * carries a code, and only codes in this map produce text.
 */
const MESSAGES: Record<string, string> = {
  oauth_failed: "Google sign-in could not be completed. Try again in a moment.",
  oauth_unverified:
    "Google reports this email address as unverified. Verify it with Google, then try again.",
  oauth_denied: "Google did not complete the sign-in. Start again.",
  oauth_expired: "That sign-in attempt expired. Start again.",
  dev_signin_failed: "Development sign-in could not be completed.",
  dev_signin_disabled: "Development sign-in is disabled on this deployment.",
  invalid_email: "Enter a valid email address.",
  check_form: "Check the form and try again.",
};

/** `null` when there is nothing to show; a generic sentence for unknown codes. */
export function authErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  return MESSAGES[code] ?? "Sign-in could not be completed. Start again.";
}
