"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LevelData } from "../../shared/levelTypes";
import type { TraceJson } from "@/shared/trace";

import { GridCanvas } from "@/components/editor/GridCanvas";
import { Toolbox, type Tool } from "@/components/editor/Toolbox";
import { ObjectList } from "@/components/editor/ObjectList";
import { PropertiesPanel } from "@/components/editor/PropertiesPanel";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

import {
  DEFAULT_LEVEL,
  pretty,
  parseJson,
  isLikelyLevelData,
  findObject,
  cloneLevel,
  addObjectAt,
  removeObjectById,
  updateObject,
  tryMoveObject
} from "@/lib/level";


const LS_KEY = "chromagame.levelJson.v1";

export default function EditorPage() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [jsonText, setJsonText] = useState<string>(pretty(DEFAULT_LEVEL));
  const [mounted, setMounted] = useState(false);

  type TraceStatus = "idle" | "loading" | "ok" | "missing" | "error";
  const [trace, setTrace] = useState<TraceJson | null>(null);
  const [traceStatus, setTraceStatus] = useState<TraceStatus>("idle");
  const [traceError, setTraceError] = useState<string | null>(null);
  const [lastTraceAt, setLastTraceAt] = useState<number | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  type RunStatus = "idle" | "running" | "ok" | "error";
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [runError, setRunError] = useState<string | null>(null);
  const [runOut, setRunOut] = useState<string | null>(null);
  const [runErr, setRunErr] = useState<string | null>(null);

  // Parse JSON
  const parsed = useMemo(() => parseJson(jsonText), [jsonText]);

  // Validate level shape
  const levelStatus = useMemo(() => {
    if (!parsed.ok) return { ok: false as const, msg: parsed.error };
    if (!isLikelyLevelData(parsed.obj)) {
      return {
        ok: false as const,
        msg: "JSON is valid, but not a LevelData (missing version/grid/objects).",
      };
    }
    return {
      ok: true as const,
      msg: `OK: ${parsed.obj.grid.w}x${parsed.obj.grid.h}, objects: ${parsed.obj.objects.length}`,
    };
  }, [parsed]);

  // Load localStorage after mount (no hydration issues)
  useEffect(() => {
    setMounted(true);
    const saved = window.localStorage.getItem(LS_KEY);
    if (saved) setJsonText(saved);
  }, []);

  // Save to localStorage
  useEffect(() => {
    if (!mounted) return;
    window.localStorage.setItem(LS_KEY, jsonText);
  }, [mounted, jsonText]);

  async function onLoadFile(file: File) {
    const text = await file.text();
    setJsonText(text);
  }

  async function refreshTrace(signal?: AbortSignal): Promise<boolean> {
    setTraceError(null);
    setTraceStatus("loading");

    const res = await fetch("/api/trace", {
      cache: "no-store",
      signal,
    });

    if (res.status === 404) {
      setTraceStatus("missing");
      return false;
    }

    if (!res.ok) {
      setTraceStatus("error");
      setTraceError(`HTTP ${res.status}`);
      return false;
    }

    const json = (await res.json()) as TraceJson;
    setTrace(json);
    setTraceStatus("ok");
    setLastTraceAt(Date.now());
    return true;
  }

  async function runTrace() {
    setRunStatus("running");
    setRunError(null);
    setRunOut(null);
    setRunErr(null);

    let payload: any = null;

    try {
      const res = await fetch("/api/trace/run", {
        method: "POST",
        cache: "no-store",
      });

      // endpoint powinien zwracać JSON { ok, out, err, code } — ale robimy bezpiecznie:
      const text = await res.text();
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { ok: res.ok, raw: text };
      }

      if (!res.ok || payload?.ok === false) {
        setRunStatus("error");
        setRunError(`Run failed (HTTP ${res.status})`);
        if (payload?.out) setRunOut(String(payload.out));
        if (payload?.err) setRunErr(String(payload.err));
        if (payload?.raw) setRunErr(String(payload.raw));
        return;
      }

      setRunStatus("ok");
      if (payload?.out) setRunOut(String(payload.out));
      if (payload?.err) setRunErr(String(payload.err));

      // Najważniejsze: po uruchomieniu runtime od razu zaciągnij świeży trace
      await refreshTrace();
    } catch (e: any) {
      setRunStatus("error");
      setRunError(String(e?.message ?? e));
    }
  }

  // Refresh
  useEffect(() => {
    if (!autoRefresh) return;

    let alive = true;
    let timeoutId: any = null;
    const controller = new AbortController();

    const delayOk = 900;
    const delayFail = 2500;

    const tick = async () => {
      try {
        const ok = await refreshTrace(controller.signal);
        if (!alive) return;

        timeoutId = setTimeout(tick, ok ? delayOk : delayFail);
      } catch (e: any) {
        if (String(e?.name) === "AbortError") return;

        setTraceStatus("error");
        setTraceError(String(e?.message ?? e));

        if (!alive) return;
        timeoutId = setTimeout(tick, delayFail);
      }
    };

    tick();

    return () => {
      alive = false;
      controller.abort();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [autoRefresh]);


  // shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete") {
        if (!selectedId) return;
        updateLevel((lvl) => removeObjectById(lvl, selectedId));
        setSelectedId(undefined);
        return;
      }

      // 1-6 tools
      const map: Record<string, Tool> = {
        "1": "select",
        "2": "erase",
        "3": "laser",
        "4": "mirror",
        "5": "wall",
        "6": "target",
      };
      const t = map[e.key];
      if (t) setTool(t);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, updateLevel]);


  function onDownload() {
    if (!parsed.ok) return;

    const filename = "level.json";
    const blob = new Blob([pretty(parsed.obj)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }

  function onFormat() {
    if (!parsed.ok) return;
    setJsonText(pretty(parsed.obj));
  }

  function updateLevel(mutator: (lvl: LevelData) => void) {
    if (!level) return;
    const next = cloneLevel(level);
    mutator(next);
    setJsonText(pretty(next));
  }

  const level: LevelData | undefined =
    parsed.ok && isLikelyLevelData(parsed.obj) ? (parsed.obj as LevelData) : undefined;

  const selectedObj = useMemo(() => {
    if (!level) return undefined;
    return findObject(level, selectedId);
  }, [level, selectedId]);

  return (
    <div className="h-dvh flex">
      <aside className="w-72 border-r p-4 flex flex-col gap-3">
        <div className="font-semibold">Tools</div>

        <Card className="p-3 flex flex-col gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onLoadFile(f);
              e.currentTarget.value = "";
            }}
          />

          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            Load JSON file
          </Button>

          <Button onClick={onDownload} disabled={!parsed.ok}>
            Download JSON
          </Button>

          <Button variant="outline" onClick={onFormat} disabled={!parsed.ok}>
            Format
          </Button>

          <div className="flex flex-col gap-2">
            <Button variant="outline" onClick={() => void refreshTrace()}>
              Refresh Trace (C++)
            </Button>

            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Auto-refresh
            </label>

            <Button
              variant="default"
              onClick={() => void runTrace()}
              disabled={runStatus === "running"}
            >
              {runStatus === "running" ? "Running Trace..." : "Run Trace (C++)"}
            </Button>

            <div className="text-xs text-muted-foreground">
              Run: <b>{runStatus}</b>
              {runError ? <span className="ml-2">• {runError}</span> : null}
            </div>

            {runOut ? (
              <pre className="text-xs whitespace-pre-wrap border rounded p-2 max-h-40 overflow-auto">
                {runOut}
              </pre>
            ) : null}

            {runErr ? (
              <pre className="text-xs whitespace-pre-wrap border rounded p-2 max-h-40 overflow-auto">
                {runErr}
              </pre>
            ) : null}


            <div className="text-xs text-muted-foreground">
              Status: <b>{traceStatus}</b>
              {lastTraceAt ? <span> • {new Date(lastTraceAt).toLocaleTimeString()}</span> : null}
              {traceError ? <span className="ml-2">• {traceError}</span> : null}
            </div>

            {traceStatus === "missing" ? (
              <div className="text-xs text-muted-foreground">
                Brak trace.json — uruchom C++ runtime, który generuje shared/out/trace.json
              </div>
            ) : null}
          </div>

          <div className={`text-xs ${levelStatus.ok ? "text-muted-foreground" : "text-destructive"}`}>
            {levelStatus.msg}
          </div>

          {/* Narzędzia (podpięcie do klików w canvas — to Etap 11.1) */}
          <Toolbox tool={tool} setTool={setTool} />

          {level && (
            <>
              <ObjectList level={level} selectedId={selectedId} onSelect={setSelectedId} />
              <PropertiesPanel
                obj={selectedObj}
                onUpdate={(id, patch) => {
                  updateLevel((lvl) => updateObject(lvl, id, patch));
                }}
                onMove={(id, x, y) => {
                  updateLevel((lvl) => tryMoveObject(lvl, id, x, y));
                }}
              />

            </>
          )}
        </Card>

        <div className="text-xs text-muted-foreground">
          Aktualne narzędzie: <span className="font-mono">{tool}</span>
        </div>
      </aside>

      <main className="flex-1 flex flex-col">
        <header className="h-14 border-b px-4 flex items-center gap-2">
          <div className="font-semibold">ChromaGame Editor</div>
          <div className="ml-auto text-sm text-muted-foreground">/editor</div>
        </header>

        <div className="flex-1 p-4">
          <div className="h-full grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card className="p-3 h-full flex flex-col gap-2">
              <div className="text-sm font-medium">Preview</div>

              <div className="flex-1 min-h-0">
                {level ? (
                  <div className="h-full">
                    <GridCanvas
                      level={level}
                      selectedId={selectedId}
                      trace={trace}
                      onClick={({ x, y, hitId }) => {
                        if (!level) return;

                        if (tool === "erase") {
                          if (!hitId) return;
                          updateLevel((lvl) => removeObjectById(lvl, hitId));
                          if (selectedId === hitId) setSelectedId(undefined);
                          return;
                        }

                        if (tool === "select") {
                          setSelectedId(hitId);
                          return;
                        }

                        if (hitId) {
                          setSelectedId(hitId);
                          return;
                        }

                        updateLevel((lvl) => addObjectAt(lvl, tool, x, y));
                      }}
                      onDrag={({ id, x, y, phase }) => {
                        // zawsze zaznacz podczas przeciągania
                        setSelectedId(id);

                        // move/end: próbuj przesunąć obiekt
                        if (phase === "move" || phase === "end") {
                          updateLevel((lvl) => tryMoveObject(lvl, id, x, y));
                        }
                      }}
                    />


                  </div>
                ) : (
                  <div className="h-full rounded-md border flex items-center justify-center text-muted-foreground">
                    Fix JSON to see preview
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-3 h-full flex flex-col gap-2">
              <div className="text-sm font-medium">Level JSON</div>
              <Textarea
                className="flex-1 min-h-0 font-mono text-xs"
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
              />
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
