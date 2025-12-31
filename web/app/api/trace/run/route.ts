import fs from "node:fs/promises";
import path from "node:path";

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
    if (parent === dir) return process.cwd(); // fallback
    dir = parent;
  }
}

import { NextResponse } from "next/server";
import { spawn } from "node:child_process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function runOnce(cmd: string, args: string[], cwd: string) {
  return new Promise<{ code: number; out: string; err: string }>((resolve) => {
    const p = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      cwd,
    });

    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("close", (code) => resolve({ code: code ?? -1, out, err }));
  });
}

export async function POST(req: Request) {
  const repoRoot = await findRepoRoot();

  const exe =
    process.env.RUN_TRACE_EXE ??
    path.join(repoRoot, "engine", "out", "build", "x64-Debug", "runtime", "game_runtime.exe");

  if (!(await exists(exe))) {
    return NextResponse.json({ ok: false, error: "game_runtime.exe not found", exe }, { status: 404 });
  }

  // 1) bierzemy level JSON z requestu
  const levelJson = await req.text();
  if (!levelJson || levelJson.trim().length === 0) {
    return NextResponse.json({ ok: false, error: "Empty request body (expected level JSON)" }, { status: 400 });
  }

  // 2) zapis do shared/levels/__web_temp_level.json
  const levelPath = path.join(repoRoot, "shared", "levels", "__web_temp_level.json");
  await fs.mkdir(path.dirname(levelPath), { recursive: true });
  await fs.writeFile(levelPath, levelJson, "utf8");

  // 3) uruchom runtime z argumentem ścieżki levela
  const { code, out, err } = await runOnce(exe, [levelPath], repoRoot);

  if (code !== 0) {
    return NextResponse.json({ ok: false, code, out, err }, { status: 500 });
  }

  return NextResponse.json({ ok: true, code, out, err, levelPath });
}
