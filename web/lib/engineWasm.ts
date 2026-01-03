// web/lib/engineWasm.ts
import type { TraceJson } from "@/shared/trace";
import { isLevelV2 } from "@/shared/levelTypes";
import type { LevelDataV2 } from "@/shared/levelTypes";
import { v2ToEngineV1ForEditor, parseJson } from "@/lib/level";

type EmscriptenModule = {
  ccall: (name: string, returnType: string | null, argTypes: string[], args: any[]) => any;
  UTF8ToString: (ptr: number) => string;
};

let modPromise: Promise<EmscriptenModule> | null = null;

async function getModule(): Promise<EmscriptenModule> {
  if (!modPromise) {
    modPromise = (async () => {
      if (typeof window === "undefined") {
        throw new Error("WASM module can only be loaded in browser");
      }

      const scriptId = "engine-wasm-loader";
      const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;

      if (existingScript) {
        return new Promise<EmscriptenModule>((resolve, reject) => {
          const checkInterval = setInterval(() => {
            const mod = (window as any).__engineWasmModule as EmscriptenModule | undefined;
            if (mod) {
              clearInterval(checkInterval);
              resolve(mod);
            }
          }, 50);

          setTimeout(() => {
            clearInterval(checkInterval);
            reject(new Error("Timeout waiting for WASM module"));
          }, 30000);
        });
      }

      return new Promise<EmscriptenModule>((resolve, reject) => {
        const script = document.createElement("script");
        script.id = scriptId;
        script.type = "module";
        script.textContent = `
          import Module from '/wasm/engine_wasm.js';
          const factory = Module.default || Module;
          factory({ locateFile: (p) => '/wasm/' + p })
            .then(instance => { window.__engineWasmModule = instance; window.__engineWasmReady = true; })
            .catch(err => { window.__engineWasmError = err; });
        `;

        script.onerror = () => reject(new Error("Failed to load engine_wasm.js"));

        (window as any).__engineWasmReady = false;
        (window as any).__engineWasmError = null;

        const checkReady = setInterval(() => {
          if ((window as any).__engineWasmReady) {
            clearInterval(checkReady);
            const mod = (window as any).__engineWasmModule as EmscriptenModule;
            if (mod) resolve(mod);
            else reject(new Error("WASM module instance is null"));
          } else if ((window as any).__engineWasmError) {
            clearInterval(checkReady);
            reject((window as any).__engineWasmError);
          }
        }, 50);

        setTimeout(() => {
          clearInterval(checkReady);
          reject(new Error("Timeout loading WASM module"));
        }, 30000);

        document.head.appendChild(script);
      });
    })();
  }
  return modPromise;
}

function ensureEngineJsonForTrace(levelJson: string): string {
  const p = parseJson(levelJson);
  if (!p.ok) return levelJson; // i tak poleci błąd później

  if (isLevelV2(p.obj)) {
    const v2 = p.obj as LevelDataV2;
    const v1 = v2ToEngineV1ForEditor(v2);
    return JSON.stringify(v1);
  }

  return levelJson;
}

export async function traceWasm(levelJson: string): Promise<TraceJson> {
  const mod = await getModule();

  const engineJson = ensureEngineJsonForTrace(levelJson);

  // helper: pojedynczy trace na danym json (engine v1)
  const traceOnce = (json: string): TraceJson => {
    const ptr = mod.ccall("traceLevel", "number", ["string"], [json]) as number;
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

    if (parsed.ok === false || parsed.error) {
      throw new Error(parsed.error || "Trace failed");
    }

    return {
      segments: parsed.segments || [],
      hitWall: parsed.hitWall,
      hitTarget: parsed.hitTarget,
      hitTargetId: parsed.hitTargetId,
    };
  };

  // Multi-laser: jeśli silnik liczy tylko pierwszy laser, zrób trace per laser i sklej.
  let obj: any;
  try {
    obj = JSON.parse(engineJson);
  } catch {
    // fallback
    return traceOnce(engineJson);
  }

  const objects: any[] = Array.isArray(obj?.objects) ? obj.objects : [];
  const lasers = objects.filter((o) => o?.type === "laser");

  if (lasers.length <= 1) {
    return traceOnce(engineJson);
  }

  const nonLasers = objects.filter((o) => o?.type !== "laser");

  const merged: TraceJson = { segments: [], hitWall: false, hitTarget: false, hitTargetId: undefined };

  for (const lz of lasers) {
    const perLevel = {
      ...obj,
      objects: [lz, ...nonLasers], // tylko ten laser jako “pierwszy/jedyny”
    };
    const t = traceOnce(JSON.stringify(perLevel));

    merged.segments.push(...(t.segments ?? []));
    merged.hitWall = Boolean(merged.hitWall || t.hitWall);
    if (t.hitTarget) merged.hitTarget = true;
    if (!merged.hitTargetId && t.hitTargetId) merged.hitTargetId = t.hitTargetId;
  }

  return merged;
}

