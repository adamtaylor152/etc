// The one signing secret (MEDIA_SIGNING_SECRET) behind every stateless signed link: photos, campaign unsubscribe and
// click tracking, calendar feeds. Read lazily so the build needs no environment.

const PLACEHOLDER = "change-me-to-32-random-bytes"; // the value in .env.example: public, so as good as none

/** The configured secret, or null when it is unset, under 16 characters, or still the .env.example placeholder. */
export function configuredSecret(): string | null {
  const s = process.env.MEDIA_SIGNING_SECRET;
  return s && s.length >= 16 && s !== PLACEHOLDER ? s : null;
}

/** For signing. Production refuses to sign with a secret anyone could know; development falls back to a fixed value. */
export function signingSecret(): string {
  const s = configuredSecret();
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("MEDIA_SIGNING_SECRET must be set (32+ random chars, not the .env.example value)");
  return "dev-only-media-secret-change-me";
}
