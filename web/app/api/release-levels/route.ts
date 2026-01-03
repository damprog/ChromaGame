import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function exists(p: string) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function findRepoRoot(): Promise<string> {
  let dir = process.cwd();
  while (true) {
    const hasEngine = await exists(path.join(dir, "engine"));
    const hasShared = await exists(path.join(dir, "shared"));
    if (hasEngine && hasShared) return dir;

    const parent = path.dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
}

export async function GET() {
  const repoRoot = await findRepoRoot();
  const dir = path.join(repoRoot, "shared", "levels_release");
  await fs.mkdir(dir, { recursive: true });

  const files = (await fs.readdir(dir)).filter((f) => f.toLowerCase().endsWith(".json")).sort();
  return NextResponse.json({ ok: true, levels: files });
}
