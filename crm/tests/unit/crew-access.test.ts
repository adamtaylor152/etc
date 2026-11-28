// Crew logins must never reach the back office. These read the source, so a new page, action or API route that
// forgets the owner guard fails here instead of quietly opening up to crew (or to nobody signed in at all).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { visitScope } from "@/server/runner";

const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const read = (f: string) => readFileSync(f, "utf8");
const owner = walk("src/app/(owner)");

/** Source with comments and the insides of strings and regex literals blanked out (same length), so braces, quotes and names in them don't count. */
function code(src: string) {
  const out = src.split("");
  const blank = (from: number, to: number) => { for (let k = from; k < to; k++) if (out[k] !== "\n") out[k] = " "; };
  const stack: string[] = []; // "`" = inside a template literal's text, "{" = inside its ${ } (or any brace)
  let i = 0;
  while (i < src.length) {
    const c = src[i], top = stack.at(-1);
    if (top === "`") {
      if (c === "\\") { blank(i, i + 2); i += 2; }
      else if (c === "`") { stack.pop(); i++; }
      else if (c === "$" && src[i + 1] === "{") { stack.push("{"); i += 2; }
      else { blank(i, i + 1); i++; }
    } else if (c === "/" && src[i + 1] === "/") { const e = src.indexOf("\n", i); blank(i, e < 0 ? src.length : e); i = e < 0 ? src.length : e; }
    else if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2) + 2; blank(i, e); i = e; }
    else if (c === '"' || c === "'") {
      let e = i + 1;
      while (e < src.length && src[e] !== c && src[e] !== "\n") e += src[e] === "\\" ? 2 : 1;
      blank(i + 1, e); i = e + 1;
    } else if (c === "/" && /(^|[(,=:[!&|?{};\n]|return|=>)\s*$/.test(src.slice(Math.max(0, i - 12), i))) {
      // A regex literal (a "/" where a value is expected): /[",\n]/ and /"/g would otherwise open a string.
      let e = i + 1, cls = false;
      while (e < src.length && src[e] !== "\n" && (cls || src[e] !== "/")) { if (src[e] === "\\") e++; else if (src[e] === "[") cls = true; else if (src[e] === "]") cls = false; e++; }
      blank(i + 1, e); i = e + 1;
    } else if (c === "`") { stack.push("`"); i++; }
    else if (c === "{") { stack.push("{"); i++; }
    else if (c === "}") { stack.pop(); i++; }
    else i++;
  }
  return out.join("");
}

/** Index just past the bracket that closes the one at `open`. */
function closing(src: string, open: number) {
  const pairs: Record<string, string> = { "(": ")", "{": "}" };
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === src[open]) depth++;
    else if (src[i] === pairs[src[open]] && --depth === 0) return i + 1;
  }
  throw new Error("unbalanced brackets");
}

/**
 * Every exported function in a file, with its own body only (brace-matched): `export [default] [async] function f(`,
 * and `export const f = [async] (…) =>`. A guard in a helper further down the file does not count for an earlier export.
 */
function exportedFunctions(file: string) {
  const src = code(read(file));
  const found: { name: string; body: string; end: number; start: number }[] = [];
  for (const m of src.matchAll(/^export\s+(?:default\s+)?(?:async\s+)?function\s*\*?\s*(\w*)\s*(?:<[^(]*>)?\(|^export\s+const\s+(\w+)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:<[^(]*>)?\(/gm)) {
    const afterParams = closing(src, m.index + m[0].length - 1);
    // Skip a return type (which may hold braces inside < > or after ":") up to the body's own brace.
    const arrow = m[2] ? src.indexOf("=>", afterParams) + 2 : afterParams;
    let open = src.indexOf("{", arrow);
    for (let angle = 0, i = arrow; i < src.length; i++) {
      if (src[i] === "<") angle++;
      else if (src[i] === ">") angle--;
      else if (src[i] === "{" && angle <= 0) { open = i; break; }
    }
    const exprBody = m[2] && src.slice(arrow, open).trim() !== ""; // `export const f = async () => expr;`
    const end = exprBody ? src.indexOf("\n", arrow) : closing(src, open);
    found.push({ name: m[1] || m[2] || "default", body: src.slice(exprBody ? arrow : open, end), start: m.index, end });
  }
  // The reader must account for every export that can run code, and no body may run into the next export.
  const declared = [...read(file).matchAll(/^export\s+(?:default\s+)?(?:async\s+)?function\b|^export\s+const\s+\w+\s*(?::[^=]+)?=\s*(?:async\s*)?(?:<[^(]*>)?\(/gm)].length;
  if (declared !== found.length || found.some((f, i) => i + 1 < found.length && f.end > found[i + 1].start)) throw new Error(`could not read the exports of ${file}`);
  return found;
}

/**
 * Pages are TSX (JSX text can't be brace-matched this simply), and only how a function STARTS matters there: each
 * exported function with the text from its start to the next export. Reading too far can only fail the check, never pass it.
 */
function pageFunctions(file: string) {
  const src = code(read(file));
  const starts = [...src.matchAll(/^export\s+(?:default\s+)?(?:async\s+)?function\s*(\w*)|^export\s+const\s+(\w+)\s*(?::[^=]+)?=\s*(?:async\s*)?\(/gm)];
  return starts.map((m, i) => ({ name: m[0].includes("default") ? "default" : m[1] || m[2], body: src.slice(m.index + m[0].length, starts[i + 1]?.index ?? src.length) }));
}

const GUARD = /\bawait requireOwner\(/;

describe("the source reader these checks rely on", () => {
  it("sees each export's own body, and nothing in strings or comments", () => {
    const sample = [
      '"use server";',
      "export async function a(f: FormData): Promise<{ ok: boolean }> { const s = `}${f ? \"{\" : '}'}`; // await requireOwner()",
      "  return { ok: !!s.replace(/[\"{]/g, '').split(/'/) };",
      "}",
      "export const b = async (f: FormData) => { await requireOwner(); };",
      "export default function C({ x }: { x: string }) { return x; }",
      "async function helper() { await requireOwner(); }",
    ].join("\n");
    const src = code(sample);
    expect(src).toHaveLength(sample.length);
    expect(src).not.toContain("await requireOwner() \n");
    expect(GUARD.test(src.slice(src.indexOf("function a"), src.indexOf("export const b")))).toBe(false);
    expect(src.split("\n")[3]).toBe("}");
    expect(src).toContain("export const b = async (f: FormData) => { await requireOwner(); };");
  });
});

describe("owner guard coverage", () => {
  it("every owner page and layout checks for an owner before it awaits anything else", () => {
    const pages = owner.filter((f) => /(page|layout)\.tsx$/.test(f));
    expect(pages.length).toBeGreaterThan(40);
    const bad: string[] = [];
    const KNOWN: string[] = [];
    for (const f of pages) {
      // Every exported function that can run on a request: the page itself and generateMetadata.
      const fns = pageFunctions(f);
      for (const fn of fns) {
        // Reading the route's own params is not data: `await params` / `await searchParams` may come first.
        const first = fn.body.replace(/\bawait\s+(?:props\.)?(?:params|searchParams)\b/g, "").match(/\bawait\b[^;\n]*/)?.[0];
        if (fn.name === "default" || first) {
          if (!first || !/^await requireOwner\(/.test(first)) bad.push(`${f}: ${fn.name} (${first ?? "no guard"})`);
        }
      }
      if (!fns.some((fn) => fn.name === "default")) bad.push(`${f}: no page function found`);
    }
    expect(bad.map((b) => b.replace(/ \(.*$/, "")).filter((b) => !KNOWN.includes(b))).toEqual([]);
  });

  it("every exported owner server action checks for an owner in its own body", () => {
    const files = owner.filter((x) => x.endsWith(".ts") && /^\s*["']use server["']/.test(read(x)));
    expect(files.length).toBeGreaterThan(15);
    const missing: string[] = [];
    let n = 0;
    for (const f of files) for (const fn of exportedFunctions(f)) { n++; if (!GUARD.test(fn.body)) missing.push(`${f}: ${fn.name}`); }
    expect(n).toBeGreaterThan(120);
    expect(missing).toEqual([]);
  });

  it("only the runner, my-time and photo uploads accept a crew session", () => {
    const anyUser = walk("src/app").filter((f) => /\.(ts|tsx)$/.test(f) && /\b(currentUser|requireUser)\(/.test(read(f)));
    expect(anyUser.sort()).toEqual([
      "src/app/(crew)/layout.tsx", "src/app/(crew)/run/page.tsx",
      "src/app/(crew)/stop/[id]/actions.ts", "src/app/(crew)/stop/[id]/page.tsx", // checklist and signature for a visit on the caller's own route (visitScope)
      "src/app/(crew)/time/actions.ts", "src/app/(crew)/time/page.tsx", // clock in/out and the caller's own week; every query is scoped to user.id
      "src/app/api/run/route.ts", "src/app/api/uploads/route.ts",
      "src/app/auth/go/page.tsx", "src/app/login/page.tsx", // "already signed in? skip the form"
    ]);
  });
});

// Every API route, by who may call it. A new route.ts must be added here, which is the moment to decide.
const ROUTES: Record<string, "owner" | "crew" | "public" | "owner-or-signed"> = {
  "export/clients": "owner", "export/expenses": "owner", "export/payments": "owner", "export/pdf/[kind]/[id]": "owner",
  "export/report/[report]": "owner", "export/storm/[id]": "owner", "messages/send": "owner", search: "owner",
  run: "crew", uploads: "crew", // signed in, crew included: limited inside by visitScope / an owner check
  healthz: "public", // uptime monitor: counts only
  "cal/[key]": "public", "m/c/[t]": "public", "m/o/[t]": "public", // the link carries a signature
  "media/[id]/[variant]": "owner-or-signed", // a signed link (emails, client pages), else an owner session
  "interac": "public", "interac/email": "public", // the Email Worker's shared secret (inboundAuthorized)
  "stripe/webhook": "public", "telnyx/webhook": "public", // the provider's signature
  "public/bookings": "public", "public/site": "public", "public/slots": "public", "public/uploads/[token]": "public", // the public site, by design
};
/** What a public route checks instead of a session. A route listed without one is open to anyone, on purpose. */
const PUBLIC_CHECK: Record<string, RegExp> = {
  "cal/[key]": /\bfeedUser\(/, "m/c/[t]": /\bverifySigned\(/, "m/o/[t]": /\bverifySigned\(/,
  interac: /\binboundAuthorized\(req\)/, "interac/email": /\binboundAuthorized\(req\)/,
  "stripe/webhook": /constructEvent|webhooks\./, "telnyx/webhook": /\bverify\w*\(/, "public/uploads/[token]": /\bpeekToken\(/,
};

describe("API routes", () => {
  const files = walk("src/app/api").filter((f) => /route\.tsx?$/.test(f));
  const key = (f: string) => f.replace(/^src\/app\/api\//, "").replace(/\/route\.tsx?$/, "");
  const handlers = (f: string) => exportedFunctions(f).filter((fn) => /^(GET|POST|PUT|PATCH|DELETE|HEAD)$/.test(fn.name));

  it("every route is classified, and the list names no route that is gone", () => {
    expect(files.map(key).sort()).toEqual(Object.keys(ROUTES).sort());
  });

  it("owner routes check for an owner, crew routes for a session, in every handler before anything else is awaited", () => {
    const bad: string[] = [];
    for (const f of files) {
      const kind = ROUTES[key(f)];
      if (!kind || kind === "public" || kind === "owner-or-signed") continue;
      const guard = kind === "owner" ? /^await currentOwner\(/ : /^await (currentUser|requireUser)\(/;
      const list = handlers(f);
      if (!list.length) bad.push(`${f}: no handler found`);
      for (const fn of list) {
        const first = fn.body.match(/\bawait\b[^;\n]*/)?.[0];
        if (!first || !guard.test(first)) bad.push(`${f}: ${fn.name} (${first ?? "no guard"})`);
        // ...and the handler must turn a missing session away, not just look it up.
        const who = first?.match(/(\w+) = await/)?.[1] ?? fn.body.match(/const (\w+) = await (currentOwner|currentUser|requireUser)\(/)?.[1];
        if (!who || !new RegExp(`if \\(!${who}\\b[^\\n;]*\\) return (new Response|Response\\.json)\\(`).test(fn.body)) bad.push(`${f}: ${fn.name} never refuses`);
      }
      if (kind === "owner" && /\b(currentUser|requireUser)\(/.test(read(f))) bad.push(`${f}: an owner route must not accept any signed-in user`);
    }
    expect(bad).toEqual([]);
  });

  it("public routes never read a session, and the ones behind a signature or secret check it", () => {
    const bad: string[] = [];
    const media = code(read("src/app/api/media/[id]/[variant]/route.ts"));
    // Unsigned = owners only; a bad signature is refused before the session is even looked at.
    expect(media).toMatch(/if \(signed && !verifyMediaSig\([^\n]*return new Response/);
    expect(media).toMatch(/const user = signed \? null : await currentOwner\(\);\s*if \(!signed && !user\) return new Response/);
    expect(media).not.toMatch(/\b(currentUser|requireUser)\(/);
    for (const f of files) {
      if (ROUTES[key(f)] !== "public") continue;
      if (/\b(currentUser|requireUser|currentOwner|requireOwner)\(/.test(read(f))) bad.push(`${f}: public by design, but reads a session (reclassify it)`);
      const check = PUBLIC_CHECK[key(f)];
      if (check && !check.test(code(read(f)))) bad.push(`${f}: its signature / secret check is gone`);
    }
    expect(bad).toEqual([]);
  });
});

describe("visitScope", () => {
  it("leaves owners unrestricted and limits crew to their own visits plus unassigned ones within a day of today", () => {
    expect(visitScope({ id: "u1", role: "OWNER" })).toEqual({});
    // Their own on any date; unassigned ones only yesterday..tomorrow (also across a month end).
    expect(visitScope({ id: "u1", role: "CREW" }, "2026-12-01")).toEqual({ OR: [
      { assignees: { some: { userId: "u1" } } },
      { assignees: { none: {} }, scheduledDate: { gte: new Date("2026-11-30T00:00:00.000Z"), lte: new Date("2026-12-02T00:00:00.000Z") } },
    ] });
  });
});
