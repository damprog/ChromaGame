import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// skopiuj to samo findRepoRoot/exists które masz w /api/trace/run
async function exists(p: string) { try { await fs.access(p); return true; } catch { return false; } }
async function findRepoRoot(): Promise<string> {
  let dir = process.cwd();
  while (true) {
    if (await exists(path.join(dir, "engine")) && await exists(path.join(dir, "shared"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
}

export async function GET() {
  const repoRoot = await findRepoRoot();
  const levelsDir = path.join(repoRoot, "shared", "levels");

  let files: string[] = [];
  try {
    files = await fs.readdir(levelsDir);
  } catch {
    return NextResponse.json({ ok: false, error: "shared/levels not found", levelsDir }, { status: 404 });
  }

  const levels = files
    .filter((f) => f.endsWith(".json"))
    .filter((f) => f !== "__web_temp_level.json"); // opcjonalnie ukryj temp

  return NextResponse.json({ ok: true, levels });
}
