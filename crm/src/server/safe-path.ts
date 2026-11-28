// The one check for "redirect back to where you were" values that arrive from a form or a query string.

const CONTROL = /[\u0000-\u001f\u007f]/; // browsers drop tabs and newlines from a URL, so "/\t/evil.com" would become "//evil.com"
const inApp = (path: string) => /^\/(?![/\\])/.test(path) && !path.includes("\\"); // browsers read "\" as "/": "/\evil.com" leaves the site

/**
 * `p` when it is a path inside this app, else `fallback`. It must start with exactly one "/" and its path part must
 * hold no backslash, also once percent-decoded ("/%5Cevil.com"); no control characters anywhere. Pure, unit-tested.
 */
export function safePath(p: string | null | undefined, fallback = "/"): string {
  if (!p || CONTROL.test(p)) return fallback;
  const path = p.split(/[?#]/, 1)[0];
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return fallback;
  }
  return inApp(path) && inApp(decoded) && !CONTROL.test(decoded) ? p : fallback;
}
