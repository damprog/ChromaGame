import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Szuka shared/out/trace.json idąc w górę od process.cwd().
 * Dzięki temu działa niezależnie od tego, z jakiego katalogu startuje Next.
 */
async function findTracePath(): Promise<string | null> {
  // 1) Pozwól wymusić ścieżkę env-em (najpewniejsze)
  const envPath = process.env.TRACE_PATH;
  if (envPath) {
    try {
      await fs.access(envPath);
      return envPath;
    } catch {
      // env ustawiony, ale pliku nie ma → lecimy dalej
    }
  }

  // 2) Szukanie w górę po katalogach
  let dir = process.cwd();
  while (true) {
    const candidate = path.join(dir, "shared", "out", "trace.json");
    try {
      await fs.access(candidate);
      return candidate;
    } catch { }

    const parent = path.dirname(dir);
    if (parent === dir) break; // doszliśmy do root
    dir = parent;
  }

  return null;
}

export async function GET() {
  const tracePath = await findTracePath();

  if (!tracePath) {
    return NextResponse.json(
      { ok: false, error: "trace.json not found (expected shared/out/trace.json). Run C++ export first." },
      {
        status: 404,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  }

  try {
    const txt = await fs.readFile(tracePath, "utf8");
    return new NextResponse(txt, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "Failed to read trace.json", details: String(e?.message ?? e) },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  }
}
