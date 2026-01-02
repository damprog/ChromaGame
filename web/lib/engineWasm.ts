import type { TraceJson } from "@/shared/trace";

type EmscriptenModule = {
  ccall: (name: string, returnType: string | null, argTypes: string[], args: any[]) => any;
  UTF8ToString: (ptr: number) => string;
};

let modPromise: Promise<EmscriptenModule> | null = null;

async function getModule(): Promise<EmscriptenModule> {
  if (!modPromise) {
    modPromise = (async () => {
      // engine_wasm.js eksportuje "factory" (bo MODULARIZE=1)
      const m: any = await import("../public/wasm/engine_wasm.js");
      const factory = m.default ?? m;
      const mod = await factory();
      return mod as EmscriptenModule;
    })();
  }
  return modPromise;
}

export async function traceWasm(levelJson: string): Promise<TraceJson> {
  const mod = await getModule();

  const ptr = mod.ccall("traceLevel", "number", ["string"], [levelJson]) as number;
  const out = mod.UTF8ToString(ptr);

  mod.ccall("freeString", null, ["number"], [ptr]);

  const parsed = JSON.parse(out) as {
    ok?: boolean;
    error?: string;
    hitWall?: boolean;
    hitTarget?: boolean;
    hitTargetId?: string;
    segments?: Array<{ x0: number; y0: number; x1: number; y1: number }>;
  };

  // Jeśli błąd, rzuć wyjątek
  if (parsed.ok === false || parsed.error) {
    throw new Error(parsed.error || "Trace failed");
  }

  // Konwersja do TraceJson - segments musi być tablicą (nie opcjonalne)
  return {
    segments: parsed.segments || [],
    hitWall: parsed.hitWall,
    hitTarget: parsed.hitTarget,
    hitTargetId: parsed.hitTargetId,
  };
}
