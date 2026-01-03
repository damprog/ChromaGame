// web/app/api/trace/run/route.ts
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { NextResponse } from "next/server";

import { isLevelV2 } from "@/shared/levelTypes";
import type { LevelDataV2 } from "@/shared/levelTypes";
import { parseJson, v2ToEngineV1ForEditor } from "@/lib/level";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
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

function runOnce(cmd: string, args: string[], cwd: string) {
  return new Promise<{ code: number; out: string; err: string }>((resolve) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], cwd });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("close", (code) => resolve({ code: code ?? -1, out, err }));
  });
}

function ensureEngineJson(levelJson: string): string {
  const p = parseJson(levelJson);
  if (!p.ok) return levelJson;

  if (isLevelV2(p.obj)) {
    const v2 = p.obj as LevelDataV2;
    const v1 = v2ToEngineV1ForEditor(v2);
    return JSON.stringify(v1);
  }

  return levelJson;
}

export async function POST(req: Request) {
  const repoRoot = await findRepoRoot();

  const exe =
    process.env.RUN_TRACE_EXE ??
    path.join(repoRoot, "engine", "out", "build", "x64-Debug", "runtime", "game_runtime.exe");

  if (!(await exists(exe))) {
    return NextResponse.json({ ok: false, error: "game_runtime.exe not found", exe }, { status: 404 });
  }

  const levelJson = await req.text();
  if (!levelJson || levelJson.trim().length === 0) {
    return NextResponse.json({ ok: false, error: "Empty request body (expected level JSON)" }, { status: 400 });
  }

  const engineJson = ensureEngineJson(levelJson);

  const levelPath = path.join(repoRoot, "shared", "levels", "__web_temp_level.json");
  await fs.mkdir(path.dirname(levelPath), { recursive: true });
  await fs.writeFile(levelPath, engineJson, "utf8");

  const { code, out, err } = await runOnce(exe, [levelPath], repoRoot);

  if (code !== 0) {
    return NextResponse.json({ ok: false, code, out, err }, { status: 500 });
  }

  return NextResponse.json({ ok: true, code, out, err, levelPath });
}
