import type { TraceJson } from "@/shared/trace";

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

      // Load via script tag to avoid Next.js bundling issues
      // Emscripten MODULARIZE exports a factory function
      const scriptId = "engine-wasm-loader";
      let existingScript = document.getElementById(scriptId) as HTMLScriptElement;
      
      if (existingScript) {
        // Script already loading, wait for it
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

      // Create and load script
      return new Promise<EmscriptenModule>((resolve, reject) => {
        const script = document.createElement("script");
        script.id = scriptId;
        script.type = "module";
        script.textContent = `
          import Module from '/wasm/engine_wasm.js';
          const factory = Module.default || Module;
          factory({
            locateFile: (p) => '/wasm/' + p
          }).then(instance => {
            window.__engineWasmModule = instance;
            window.__engineWasmReady = true;
          }).catch(err => {
            window.__engineWasmError = err;
          });
        `;
        
        script.onerror = () => reject(new Error("Failed to load engine_wasm.js"));
        
        (window as any).__engineWasmReady = false;
        (window as any).__engineWasmError = null;
        
        const checkReady = setInterval(() => {
          if ((window as any).__engineWasmReady) {
            clearInterval(checkReady);
            const mod = (window as any).__engineWasmModule as EmscriptenModule;
            if (mod) {
              resolve(mod);
            } else {
              reject(new Error("WASM module instance is null"));
            }
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

  if (parsed.ok === false || parsed.error) {
    throw new Error(parsed.error || "Trace failed");
  }

  return {
    segments: parsed.segments || [],
    hitWall: parsed.hitWall,
    hitTarget: parsed.hitTarget,
    hitTargetId: parsed.hitTargetId,
  };
}
