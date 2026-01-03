// web/lib/engineWasm.ts
import type { TraceJson } from "@/shared/trace";
import { isLevelV2 } from "@/shared/levelTypes";
import type { LevelDataV2 } from "@/shared/levelTypes";
import { v2ToEngineV1ForEditor, parseJson } from "@/lib/level";

type EmscriptenModule = {
  ccall: (name: string, returnType: string | null, argTypes: string[], args: any[]) => any;
  UTF8ToString: (ptr: number) => string;
};

declare global {
  interface Window {
    __engineWasmModule?: EmscriptenModule;
    __engineWasmReady?: boolean;
    __engineWasmError?: any;
    __engineWasmLog?: string[];
  }
}

let modPromise: Promise<EmscriptenModule> | null = null;

const LOG_MAX_LINES = 2000;

function getLogArray(): string[] {
  if (typeof window === "undefined") return [];
  if (!window.__engineWasmLog) window.__engineWasmLog = [];
  return window.__engineWasmLog;
}

/** Dopisz linię do “konsoli” WASM z poziomu JS (np. z catch). */
export function pushWasmLogLine(line: string) {
  if (typeof window === "undefined") return;
  const arr = getLogArray();
  arr.push(String(line));
  if (arr.length > LOG_MAX_LINES) arr.splice(0, arr.length - LOG_MAX_LINES);
}

/** Podejrzyj log bez czyszczenia. */
export function peekWasmLog(): string {
  if (typeof window === "undefined") return "";
  return getLogArray().join("\n");
}

/** Pobierz log i wyczyść bufor (idealne po każdym trace). */
export function takeWasmLog(): string {
  if (typeof window === "undefined") return "";
  const arr = getLogArray();
  const out = arr.join("\n");
  window.__engineWasmLog = [];
  return out;
}

export function clearWasmLog() {
  if (typeof window === "undefined") return;
  window.__engineWasmLog = [];
}

async function getModule(): Promise<EmscriptenModule> {
  if (!modPromise) {
    modPromise = (async () => {
      if (typeof window === "undefined") {
        throw new Error("WASM module can only be loaded in browser");
      }

      const scriptId = "engine-wasm-loader";
      const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;

      // Jeśli już załadowany — tylko czekamy aż moduł będzie gotowy
      if (existingScript) {
        return new Promise<EmscriptenModule>((resolve, reject) => {
          const checkInterval = setInterval(() => {
            const mod = window.__engineWasmModule as EmscriptenModule | undefined;
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

      // Upewnij się, że bufor logów istnieje
      getLogArray();

      return new Promise<EmscriptenModule>((resolve, reject) => {
        const script = document.createElement("script");
        script.id = scriptId;
        script.type = "module";

        // Klucz: print/printErr przekierowane do window.__engineWasmLog
        script.textContent = `
          import Module from '/wasm/engine_wasm.js';
          const factory = Module.default || Module;

          const MAX = ${LOG_MAX_LINES};
          const push = (kind, msg) => {
            const arr = window.__engineWasmLog || (window.__engineWasmLog = []);
            const s = (msg === undefined || msg === null) ? '' : String(msg);
            const line = kind ? ('[' + kind + '] ' + s) : s;
            arr.push(line);
            if (arr.length > MAX) arr.splice(0, arr.length - MAX);
          };

          factory({
            locateFile: (p) => '/wasm/' + p,
            print: (s) => push('out', s),
            printErr: (s) => push('err', s),
          })
          .then(instance => {
            window.__engineWasmModule = instance;
            window.__engineWasmReady = true;
          })
          .catch(err => {
            push('err', err && err.stack ? err.stack : err);
            window.__engineWasmError = err;
          });
        `;

        script.onerror = () => reject(new Error("Failed to load engine_wasm.js"));

        window.__engineWasmReady = false;
        window.__engineWasmError = null;

        const checkReady = setInterval(() => {
          if (window.__engineWasmReady) {
            clearInterval(checkReady);
            const mod = window.__engineWasmModule as EmscriptenModule | undefined;
            if (mod) resolve(mod);
            else reject(new Error("WASM module instance is null"));
          } else if (window.__engineWasmError) {
            clearInterval(checkReady);
            reject(window.__engineWasmError);
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
  if (!p.ok) return levelJson;

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

  // Multi-laser: jeśli silnik liczy tylko pierwszy laser, robimy trace per laser i sklejamy.
  let obj: any;
  try {
    obj = JSON.parse(engineJson);
  } catch {
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
    const perLevel = { ...obj, objects: [lz, ...nonLasers] };
    const t = traceOnce(JSON.stringify(perLevel));

    merged.segments.push(...(t.segments ?? []));
    merged.hitWall = Boolean(merged.hitWall || t.hitWall);
    if (t.hitTarget) merged.hitTarget = true;
    if (!merged.hitTargetId && t.hitTargetId) merged.hitTargetId = t.hitTargetId;
  }

  return merged;
}
