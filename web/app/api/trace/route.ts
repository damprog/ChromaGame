import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";

async function exists(p: string) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

// Szuka najbliższego PRZODKA, w którym istnieje: shared/out/trace.json
async function findTracePath(startDir: string) {
  let dir = startDir;
  for (let i = 0; i < 12; i++) {
    const candidate = path.join(dir, "shared", "out", "trace.json");
    if (await exists(candidate)) return candidate;

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export async function GET() {
  const tracePath = await findTracePath(process.cwd());
  if (!tracePath) {
    return NextResponse.json(
      { error: "trace.json not found (expected shared/out/trace.json above cwd). Run C++ runtime first." },
      { status: 404 }
    );
  }

  try {
    const text = await fs.readFile(tracePath, "utf8");
    const json = JSON.parse(text);
    return NextResponse.json(json);
  } catch (e: any) {
    return NextResponse.json(
      { error: `Cannot read/parse trace.json: ${e?.message ?? String(e)}` },
      { status: 500 }
    );
  }
}
