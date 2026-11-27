// File storage behind three functions so a bucket (R2/S3) can replace the local volume later.
// ponytail: local disk under UPLOAD_DIR (a Coolify volume); swap these three for an S3 client when needed.
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

const root = () => path.resolve(process.env.UPLOAD_DIR ?? "./data/uploads");

function resolveKey(key: string) {
  const full = path.resolve(root(), key);
  if (!full.startsWith(root() + path.sep)) throw new Error("bad storage key");
  return full;
}

export async function put(key: string, data: Buffer) {
  const full = resolveKey(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
}

/** Web stream + size, or null if missing. */
export async function getStream(key: string): Promise<{ stream: ReadableStream; size: number } | null> {
  const full = resolveKey(key);
  const s = await stat(full).catch(() => null);
  if (!s) return null;
  return { stream: Readable.toWeb(createReadStream(full)) as ReadableStream, size: s.size };
}

export async function remove(prefix: string) {
  await rm(resolveKey(prefix), { recursive: true, force: true });
}
