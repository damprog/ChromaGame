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

function sanitizeName(name: unknown) {
  if (typeof name !== "string") return null;
  const base = path.basename(name);
  if (!/^[a-zA-Z0-9_-]+(\.json)?$/.test(base)) return null;
  return base.endsWith(".json") ? base : base + ".json";
}

export async function GET(_: Request, ctx: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await ctx.params;
    const repoRoot = await findRepoRoot();

    const file = sanitizeName(name);
    if (!file) {
      return NextResponse.json({ ok: false, error: "invalid level name", name: name }, { status: 400 });
    }

    const p = path.join(repoRoot, "shared", "levels", file);

    const txt = await fs.readFile(p, "utf8");
    return new NextResponse(txt, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    console.error("GET /api/levels/[name] failed:", e);
    return NextResponse.json(
      { ok: false, error: "GET failed", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await ctx.params;
    const repoRoot = await findRepoRoot();

    const file = sanitizeName(name);
    if (!file) {
      return NextResponse.json({ ok: false, error: "invalid level name", name: name }, { status: 400 });
    }

    const p = path.join(repoRoot, "shared", "levels", file);

    const body = await req.text();
    if (!body || body.trim().length === 0) {
      return NextResponse.json({ ok: false, error: "empty body" }, { status: 400 });
    }

    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, body, "utf8");
    return NextResponse.json({ ok: true, saved: file });
  } catch (e: any) {
    console.error("POST /api/levels/[name] failed:", e);
    return NextResponse.json(
      { ok: false, error: "POST failed", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

