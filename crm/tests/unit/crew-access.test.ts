// Crew logins must never reach the back office. These read the source, so a new page, action or API route that
// forgets the owner guard fails here instead of quietly opening up to crew.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { visitScope } from "@/server/runner";

const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const read = (f: string) => readFileSync(f, "utf8");
const owner = walk("src/app/(owner)");

describe("owner guard coverage", () => {
  it("every owner page and layout checks for an owner", () => {
    const pages = owner.filter((f) => /(page|layout)\.tsx$/.test(f));
    expect(pages.length).toBeGreaterThan(40);
    expect(pages.filter((f) => !read(f).includes("await requireOwner("))).toEqual([]);
  });

  it("every owner server action checks for an owner", () => {
    const missing: string[] = [];
    for (const f of owner.filter((x) => x.endsWith(".ts") && read(x).startsWith('"use server"'))) {
      // Each exported function's body runs to the next export (or the end of the file).
      for (const body of read(f).split(/^export async function /m).slice(1)) {
        if (!body.includes("requireOwner(")) missing.push(`${f}: ${body.slice(0, body.indexOf("("))}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("only the runner and photo uploads accept a crew session", () => {
    const anyUser = walk("src/app").filter((f) => /\.(ts|tsx)$/.test(f) && /\b(currentUser|requireUser)\(/.test(read(f)));
    expect(anyUser.sort()).toEqual([
      "src/app/(crew)/layout.tsx", "src/app/(crew)/run/page.tsx", "src/app/api/run/route.ts", "src/app/api/uploads/route.ts",
      "src/app/auth/go/page.tsx", "src/app/login/page.tsx", // "already signed in? skip the form"
    ]);
  });
});

describe("visitScope", () => {
  it("leaves owners unrestricted and limits crew to their own or unassigned visits", () => {
    expect(visitScope({ id: "u1", role: "OWNER" })).toEqual({});
    expect(visitScope({ id: "u1", role: "CREW" })).toEqual({ OR: [{ assignees: { some: { userId: "u1" } } }, { assignees: { none: {} } }] });
  });
});
