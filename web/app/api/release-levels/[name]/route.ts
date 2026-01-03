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

function normalizeName(name: string) {
  const base = (name ?? "").split(/[\\/]/).pop()!.trim();
  if (!base) return "level01.json";
  return base.toLowerCase().endsWith(".json") ? base : `${base}.json`;
}

export async function GET(_: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const file = normalizeName(name);

  const repoRoot = await findRepoRoot();
  const p = path.join(repoRoot, "shared", "levels_release", file);

  try {
    const txt = await fs.readFile(p, "utf8");
    return new NextResponse(txt, { headers: { "Content-Type": "application/json; charset=utf-8" } });
  } catch (e: any) {
    if (e?.code === "ENOENT") return new NextResponse("Not found", { status: 404 });
    throw e;
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const file = normalizeName(name);

  const repoRoot = await findRepoRoot();
  const dir = path.join(repoRoot, "shared", "levels_release");
  await fs.mkdir(dir, { recursive: true });

  const body = await req.text();
  if (!body || body.trim().length === 0) {
    return NextResponse.json({ ok: false, error: "Empty body" }, { status: 400 });
  }

  const p = path.join(dir, file);
  await fs.writeFile(p, body, "utf8");
  return NextResponse.json({ ok: true, file });
}
