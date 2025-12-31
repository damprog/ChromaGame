import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function sanitizeName(name: string) {
  // blokada path traversal
  const safe = name.replace(/[^a-zA-Z0-9_\-\.]/g, "");
  if (!safe.endsWith(".json")) return safe + ".json";
  return safe;
}

export async function GET(_: Request, { params }: { params: { name: string } }) {
  const repoRoot = await findRepoRoot();
  const file = sanitizeName(params.name);
  const p = path.join(repoRoot, "shared", "levels", file);

  try {
    const txt = await fs.readFile(p, "utf8");
    return new NextResponse(txt, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "level not found", path: p }, { status: 404 });
  }
}

export async function POST(req: Request, { params }: { params: { name: string } }) {
  const repoRoot = await findRepoRoot();
  const file = sanitizeName(params.name);
  const p = path.join(repoRoot, "shared", "levels", file);

  const body = await req.text();
  if (!body || body.trim().length === 0) {
    return NextResponse.json({ ok: false, error: "empty body" }, { status: 400 });
  }

  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, body, "utf8");
  return NextResponse.json({ ok: true, saved: file });
}
