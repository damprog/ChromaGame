"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LevelData, LevelDataV2 } from "../../shared/levelTypes";
import { isLevelV2 } from "../../shared/levelTypes";
import type { TraceJson } from "@/shared/trace";

import { GridCanvas } from "@/components/editor/GridCanvas";
import { Toolbox, type Tool } from "@/components/editor/Toolbox";
import { PropertiesPanel } from "@/components/editor/PropertiesPanel";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

import {
  traceWasm,
  takeWasmLog,
  clearWasmLog,
  pushWasmLogLine,
} from "@/lib/engineWasm";

import {
  DEFAULT_LEVEL_V2,
  pretty,
  parseJson,
  isLikelyLevelData,
  v1ToV2,
  v2ToEngineV1ForEditor,
  addObjectAtV2,
  removeObjectByIdV2,
  updateObjectV2,
  tryMoveObjectV2,
  setInventoryMirrors,
  tryParseLevelV2,
  stripDev,
} from "@/lib/level";

const LS_KEY_V2 = "chromagame.levelJson.v2";

type TraceStatus = "idle" | "loading" | "ok" | "error";
type RightTab = "params" | "json" | "engine";

function raf() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export default function EditorPage() {
  const skipNextAutoLoadRef = useRef(false);
  const didInitLevelFromListRef = useRef(false);

  // stale-guard dla async trace (żeby starszy wynik nie nadpisał nowszego)
  const traceRunIdRef = useRef(0);

  // drag handle dla split view w Engine
  const engineSplitRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const dragStartYRef = useRef(0);
  const dragStartPctRef = useRef(0.5);

  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [rightTab, setRightTab] = useState<RightTab>("params");

  const [jsonText, setJsonText] = useState<string>(pretty(DEFAULT_LEVEL_V2));
  const [baselineJson, setBaselineJson] = useState<string>("");

  const normalizedJsonText = useMemo(() => normalizeJsonText(jsonText), [jsonText]);
  const normalizedBaseline = useMemo(() => normalizeJsonText(baselineJson), [baselineJson]);
  const isDirty = normalizedJsonText !== normalizedBaseline;

  const [mounted, setMounted] = useState(false);

  const [levels, setLevels] = useState<string[]>([]);
  const [levelName, setLevelName] = useState<string>("level01.json");

  const [isAutoLoading, setIsAutoLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [autoBuild, setAutoBuild] = useState(false);
  const [autoBuildAt, setAutoBuildAt] = useState<number | null>(null);
  const [autoBuildError, setAutoBuildError] = useState<string | null>(null);
  const autoBuildBusyRef = useRef(false);
  const lastAutoBuildJsonRef = useRef<string>("");

  const [trace, setTrace] = useState<TraceJson | null>(null);
  const [traceStatus, setTraceStatus] = useState<TraceStatus>("idle");
  const [traceError, setTraceError] = useState<string | null>(null);
  const [lastTraceAt, setLastTraceAt] = useState<number | null>(null);

  // Engine panel: konsola + wynik
  const [engineConsole, setEngineConsole] = useState<string>("");
  const [engineResult, setEngineResult] = useState<string>("");
  const [engineUpdatedAt, setEngineUpdatedAt] = useState<number | null>(null);

  const [engineSplitPct, setEngineSplitPct] = useState<number>(0.5);

  const [uiError, setUiError] = useState<string | null>(null);

  const [isReleasing, setIsReleasing] = useState(false);
  const [releaseMsg, setReleaseMsg] = useState<string | null>(null);

  const [isCreating, setIsCreating] = useState(false);

  const parsed = useMemo(() => parseJson(jsonText), [jsonText]);

  // v2 = source of truth
  const levelV2: LevelDataV2 | null = useMemo(() => {
    if (!parsed.ok) return null;
    return isLevelV2(parsed.obj) ? (parsed.obj as LevelDataV2) : null;
  }, [parsed]);

  // v1 view dla canvas/properties
  const viewLevel: LevelData | null = useMemo(() => {
    if (!levelV2) return null;
    return v2ToEngineV1ForEditor(levelV2);
  }, [levelV2]);

  const selectedObj = useMemo(() => {
    if (!viewLevel) return undefined;
    return viewLevel.objects.find((o) => o.id === selectedId);
  }, [viewLevel, selectedId]);

  const levelStatus = useMemo(() => {
    if (!parsed.ok) return { ok: false as const, msg: parsed.error };

    if (levelV2) {
      const fixedCount = levelV2.fixed.length;
      const solCount = levelV2.dev?.solution?.length ?? 0;
      const inv = levelV2.inventory?.mirror ?? 0;
      return {
        ok: true as const,
        msg: `OK v2: fixed=${fixedCount}, solution=${solCount}, inventory.mirror=${inv}`,
      };
    }

    if (isLikelyLevelData(parsed.obj)) {
      return { ok: true as const, msg: `OK v1 (auto-migrate on load)` };
    }

    return { ok: false as const, msg: "JSON poprawny, ale to nie jest Level v1/v2." };
  }, [parsed, levelV2]);

  // localStorage restore
  useEffect(() => {
    setMounted(true);
    const saved = window.localStorage.getItem(LS_KEY_V2);
    if (saved) setJsonText(saved);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    window.localStorage.setItem(LS_KEY_V2, jsonText);
  }, [mounted, jsonText]);

  async function refreshLevelsList() {
    const res = await fetch("/api/levels", { cache: "no-store" });
    if (!res.ok) return;

    const j = await res.json();
    if (j?.ok && Array.isArray(j.levels)) {
      const list = (j.levels as string[]).slice().sort();
      setLevels(list);

      // jednorazowo ustaw pierwszy level jeśli aktualny nie istnieje
      if (!didInitLevelFromListRef.current) {
        didInitLevelFromListRef.current = true;
        if (list.length > 0 && !list.includes(levelName)) {
          setLevelName(list[0]);
        }
      }
    }
  }

  useEffect(() => {
    void refreshLevelsList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadLevelFromDisk(name: string) {
    const file = normalizeLevelName(name);
    const res = await fetch(`/api/levels/${encodeURIComponent(file)}`, { cache: "no-store" });
    if (!res.ok) return;

    const txt = await res.text();

    // v1 -> migrate to v2
    const p = parseJson(txt);
    if (p.ok && isLikelyLevelData(p.obj)) {
      const v2 = v1ToV2(p.obj);
      const out = pretty(v2);
      setJsonText(out);
      setBaselineJson(out);
      // bez await: UI zmienia się natychmiast
      void runTraceWasm(out);
      return;
    }

    setJsonText(txt);
    setBaselineJson(txt);
    void runTraceWasm(txt);
  }

  async function saveLevelToDisk(name: string, jsonOverride?: string) {
    const file = normalizeLevelName(name);
    const body = jsonOverride ?? jsonText;

    const res = await fetch(`/api/levels/${encodeURIComponent(file)}`, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body,
    });

    if (!res.ok) {
      const msg = await res.text();
      throw new Error(`Save failed (HTTP ${res.status}): ${msg}`);
    }

    setBaselineJson(body);
  }

  async function onSaveNow() {
    const body = jsonText;
    const prev = baselineJson;

    setUiError(null);
    setBaselineJson(body); // optimistic: gasi "Unsaved" od razu
    setIsSaving(true);

    await raf();

    try {
      await saveLevelToDisk(levelName, body);
    } catch (e: any) {
      setBaselineJson(prev);
      setUiError(String(e?.message ?? e));
    } finally {
      setIsSaving(false);
    }
  }

  async function runTraceWasm(jsonOverride?: string) {
    const body = jsonOverride ?? jsonText;
    if (!body || body.trim().length === 0) return;

    const myRunId = ++traceRunIdRef.current;

    setUiError(null);
    setTraceStatus("loading");
    setTraceError(null);

    clearWasmLog();
    setEngineConsole("");
    setEngineResult("");

    // pozwól UI pokazać "loading" zanim WASM ruszy
    await raf();

    try {
      const t = await traceWasm(body);

      if (myRunId !== traceRunIdRef.current) return;

      setTrace(t);
      setTraceStatus("ok");
      setLastTraceAt(Date.now());

      const log = takeWasmLog();
      setEngineConsole(log || "(no console output)");
      setEngineResult(JSON.stringify(t, null, 2));
      setEngineUpdatedAt(Date.now());
    } catch (e: any) {
      if (myRunId !== traceRunIdRef.current) return;

      const msg = String(e?.message ?? e);

      // dopisz błąd do “konsoli”
      pushWasmLogLine(`[js-error] ${msg}`);
      const log = takeWasmLog();

      setTraceStatus("error");
      setTraceError(msg);

      setEngineConsole(log || msg);
      setEngineResult("");
      setEngineUpdatedAt(Date.now());
    }
  }

  // Auto-build: autosave + trace (WASM)
  useEffect(() => {
    if (!autoBuild) return;

    const body = jsonText;
    if (!body || body.trim().length === 0) return;
    if (body === lastAutoBuildJsonRef.current) return;

    const id = window.setTimeout(async () => {
      if (autoBuildBusyRef.current) return;

      autoBuildBusyRef.current = true;
      setAutoBuildError(null);

      try {
        await saveLevelToDisk(levelName, body);
        void runTraceWasm(body);

        lastAutoBuildJsonRef.current = body;
        setAutoBuildAt(Date.now());
      } catch (e: any) {
        setAutoBuildError(String(e?.message ?? e));
      } finally {
        autoBuildBusyRef.current = false;
      }
    }, 250);

    return () => window.clearTimeout(id);
  }, [autoBuild, jsonText, levelName]);

  // shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete") {
        if (!selectedId) return;
        updateLevelV2((lvl) => removeObjectByIdV2(lvl, selectedId));
        setSelectedId(undefined);
        return;
      }

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
  }, [selectedId]);

  // Auto-load after level change
  useEffect(() => {
    if (!levelName) return;

    if (skipNextAutoLoadRef.current) {
      skipNextAutoLoadRef.current = false;
      return;
    }

    let alive = true;
    setIsAutoLoading(true);

    (async () => {
      try {
        await loadLevelFromDisk(levelName);
      } finally {
        if (alive) setIsAutoLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [levelName]);

  function updateLevelV2(mutator: (lvl: LevelDataV2) => void) {
    const cur = tryParseLevelV2(jsonText);
    if (!cur) return;

    const next = JSON.parse(JSON.stringify(cur)) as LevelDataV2;
    mutator(next);
    setJsonText(pretty(next));
  }

  function requestSelectLevel(next: string) {
    const file = normalizeLevelName(next);

    if (isDirty) {
      const ok = window.confirm("Masz niezapisane zmiany. Przełączyć level i je utracić?");
      if (!ok) return;
    }

    setUiError(null);
    setReleaseMsg(null);
    setLevelName(file);
  }

  function nextLevelFileName(list: string[]) {
    let max = 0;
    for (const f of list) {
      const m = /^level(\d+)\.json$/i.exec(f);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `level${String(max + 1).padStart(2, "0")}.json`;
  }

  function fileNameToMetaName(file: string) {
    const m = /^level(\d+)\.json$/i.exec(file);
    return m ? `Level ${m[1].padStart(2, "0")}` : file.replace(/\.json$/i, "");
  }

  function normalizeLevelName(name: string) {
    const trimmed = (name ?? "").trim();
    if (!trimmed) return "level01.json";
    const base = trimmed.split(/[\\/]/).pop()!;
    return base.endsWith(".json") ? base : `${base}.json`;
  }

  function normalizeJsonText(txt: string) {
    try {
      return JSON.stringify(JSON.parse(txt));
    } catch {
      return txt.trim();
    }
  }

  function onFormat() {
    if (!parsed.ok) return;
    setJsonText(pretty(parsed.obj));
  }

  async function onNewLevelV2() {
    if (isDirty) {
      const ok = window.confirm("Masz niezapisane zmiany. Utworzyć nowy level i je utracić?");
      if (!ok) return;
    }

    setUiError(null);
    setReleaseMsg(null);
    setIsCreating(true);

    await raf();

    const file = nextLevelFileName(levels);

    const lvl = structuredClone(DEFAULT_LEVEL_V2);
    lvl.meta = { ...lvl.meta, name: fileNameToMetaName(file), id: file.replace(/\.json$/i, "") };

    const body = pretty(lvl);

    try {
      await saveLevelToDisk(file, body);

      // update select immediately
      setLevels((prev) => {
        const set = new Set([...prev, file]);
        return Array.from(set).sort();
      });

      // bez natychmiastowego autoloadu
      skipNextAutoLoadRef.current = true;
      setLevelName(file);
      setJsonText(body);
      setBaselineJson(body);

      setSelectedId(undefined);

      // dobij listę “po cichu”
      void refreshLevelsList();

      void runTraceWasm(body);
    } catch (e: any) {
      setUiError(String(e?.message ?? e));
    } finally {
      setIsCreating(false);
    }
  }

  async function onReleaseLevel() {
    if (!levelV2) return;

    setUiError(null);
    setReleaseMsg(null);
    setIsReleasing(true);

    await raf();

    try {
      const released = stripDev(levelV2);
      const body = pretty(released);

      const res = await fetch(`/api/release-levels/${encodeURIComponent(levelName)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body,
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`Release failed (HTTP ${res.status}) ${t ? `: ${t}` : ""}`);
      }

      setReleaseMsg("Released ✓");
      window.setTimeout(() => setReleaseMsg(null), 1500);
    } catch (e: any) {
      setUiError(String(e?.message ?? e));
    } finally {
      setIsReleasing(false);
    }
  }

  // drag split for Engine tab
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const host = engineSplitRef.current;
      if (!host) return;

      const rect = host.getBoundingClientRect();
      const dy = e.clientY - dragStartYRef.current;
      const newPx = dragStartPctRef.current * rect.height + dy;
      const newPct = clamp(newPx / rect.height, 0.15, 0.85);
      setEngineSplitPct(newPct);
    };

    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  return (
    <div className="h-dvh flex">
      <aside className="w-72 border-r p-4 flex flex-col gap-3">
        <div className="font-semibold">Editor</div>

        <Card className="p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            {isDirty ? (
              <span className="text-xs text-muted-foreground">● Unsaved</span>
            ) : (
              <span className="text-xs text-muted-foreground">Saved</span>
            )}
            {isAutoLoading ? <span className="text-xs text-muted-foreground">Loading…</span> : null}
          </div>

          <select value={levelName} onChange={(e) => requestSelectLevel(e.target.value)}>
            {levels.length === 0 ? (
              <option value={levelName}>(loading…)</option>
            ) : (
              levels.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))
            )}
          </select>

          <div className="flex gap-2">
            <Button onClick={() => void onSaveNow()} disabled={isSaving}>
              {isSaving ? "Saving…" : "Save"}
            </Button>

            <Button variant="outline" onClick={() => void onNewLevelV2()} disabled={isCreating}>
              {isCreating ? "Creating…" : "New Level"}
            </Button>
          </div>

          <Button variant="outline" onClick={onFormat} disabled={!parsed.ok}>
            Format
          </Button>

          {/* Inventory */}
          {levelV2 ? (
            <div className="pt-2">
              <div className="text-xs text-muted-foreground mb-1">Inventory</div>
              <div className="flex items-center gap-2">
                <div className="text-xs w-14">mirror</div>
                <Input
                  className="h-8"
                  value={String(levelV2.inventory?.mirror ?? 0)}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    updateLevelV2((lvl) => setInventoryMirrors(lvl, n));
                  }}
                />
              </div>
            </div>
          ) : null}

          <div className="pt-2">
            <Toolbox tool={tool} setTool={setTool} />
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={autoBuild} onChange={(e) => setAutoBuild(e.target.checked)} />
              Auto-build (autosave + trace)
            </label>

            <div className="text-xs text-muted-foreground">
              {autoBuildAt ? <>Auto-build: {new Date(autoBuildAt).toLocaleTimeString()}</> : null}
              {autoBuildError ? <span className="ml-2">• {autoBuildError}</span> : null}
            </div>

            <Button variant="default" onClick={() => void runTraceWasm()}>
              Run Trace (WASM)
            </Button>

            <div className="flex gap-2">
              <Button variant="default" disabled={!levelV2 || isReleasing} onClick={() => void onReleaseLevel()}>
                {isReleasing ? "Releasing…" : "Release level"}
              </Button>

              <Button
                variant="outline"
                onClick={() => window.open(`/play?level=${encodeURIComponent(levelName)}`, "_blank")}
              >
                Play Preview
              </Button>
            </div>

            {releaseMsg ? <div className="text-xs text-muted-foreground">{releaseMsg}</div> : null}

            <div className="text-xs text-muted-foreground">
              Trace: <b>{traceStatus}</b>
              {lastTraceAt ? <span> • {new Date(lastTraceAt).toLocaleTimeString()}</span> : null}
              {traceError ? <span className="ml-2">• {traceError}</span> : null}
            </div>

            {uiError ? <div className="text-xs text-destructive">{uiError}</div> : null}

            <div className={`text-xs ${levelStatus.ok ? "text-muted-foreground" : "text-destructive"}`}>
              {levelStatus.msg}
            </div>

            <div className="text-xs text-muted-foreground pt-1">
              Tool: <span className="font-mono">{tool}</span>
              {selectedId ? (
                <span>
                  {" "}
                  • Selected: <span className="font-mono">{selectedId}</span>
                </span>
              ) : null}
            </div>
          </div>
        </Card>
      </aside>

      <main className="flex-1 flex flex-col">
        <header className="h-14 border-b px-4 flex items-center gap-2">
          <div className="font-semibold">ChromaGame Editor</div>
          <div className="ml-auto text-sm text-muted-foreground">/editor</div>
        </header>

        <div className="flex-1 p-4">
          <div className="h-full grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* LEFT: Preview */}
            <Card className="p-3 h-full flex flex-col gap-2">
              <div className="text-sm font-medium">Preview</div>

              <div className="flex-1 min-h-0">
                {viewLevel ? (
                  <div className="h-full">
                    <GridCanvas
                      level={viewLevel}
                      selectedId={selectedId}
                      trace={trace}
                      onClick={({ x, y, hitId }) => {
                        if (!levelV2) return;

                        if (tool === "erase") {
                          if (!hitId) return;
                          updateLevelV2((lvl) => removeObjectByIdV2(lvl, hitId));
                          if (selectedId === hitId) setSelectedId(undefined);
                          return;
                        }

                        if (tool === "select") {
                          setSelectedId(hitId);
                          setRightTab("params");
                          return;
                        }

                        if (hitId) {
                          setSelectedId(hitId);
                          setRightTab("params");
                          return;
                        }

                        updateLevelV2((lvl) => addObjectAtV2(lvl, tool, x, y));
                      }}
                      onDrag={({ id, x, y, phase }) => {
                        setSelectedId(id);
                        setRightTab("params");
                        if (phase === "move" || phase === "end") {
                          updateLevelV2((lvl) => tryMoveObjectV2(lvl, id, x, y));
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

            {/* RIGHT: Tabs */}
            <Card className="p-3 h-full flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Button variant={rightTab === "params" ? "default" : "secondary"} onClick={() => setRightTab("params")}>
                  Parameters
                </Button>
                <Button variant={rightTab === "json" ? "default" : "secondary"} onClick={() => setRightTab("json")}>
                  Level JSON
                </Button>
                <Button variant={rightTab === "engine" ? "default" : "secondary"} onClick={() => setRightTab("engine")}>
                  Engine
                </Button>

                <div className="ml-auto text-xs text-muted-foreground">
                  {rightTab === "engine" && engineUpdatedAt ? <>updated {new Date(engineUpdatedAt).toLocaleTimeString()}</> : null}
                </div>
              </div>

              <div className="flex-1 min-h-0">
                {rightTab === "params" ? (
                  <div className="h-full flex flex-col gap-2">
                    {selectedObj ? (
                      <>
                        <div className="text-xs text-muted-foreground">
                          Selected: <span className="font-mono">{selectedObj.id}</span> • type:{" "}
                          <span className="font-mono">{(selectedObj as any).type}</span>
                        </div>

                        <div className="flex-1 min-h-0 overflow-auto border rounded p-2">
                          <PropertiesPanel
                            obj={selectedObj}
                            onUpdate={(id, patch) => updateLevelV2((lvl) => updateObjectV2(lvl, id, patch))}
                            onMove={(id, x, y) => updateLevelV2((lvl) => tryMoveObjectV2(lvl, id, x, y))}
                          />
                        </div>
                      </>
                    ) : (
                      <div className="h-full rounded-md border flex items-center justify-center text-muted-foreground">
                        Select an object on the map
                      </div>
                    )}
                  </div>
                ) : null}

                {rightTab === "json" ? (
                  <Textarea
                    className="h-full min-h-0 font-mono text-xs"
                    value={jsonText}
                    onChange={(e) => setJsonText(e.target.value)}
                  />
                ) : null}

                {rightTab === "engine" ? (
                  <div ref={engineSplitRef} className="h-full min-h-0 flex flex-col border rounded overflow-hidden">
                    {/* TOP: Console */}
                    <div style={{ height: `${engineSplitPct * 100}%` }} className="min-h-0">
                      <div className="px-2 py-1 text-xs text-muted-foreground border-b flex items-center justify-between">
                        <span>Console</span>
                        <Button
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => setEngineConsole("")}
                        >
                          Clear
                        </Button>
                      </div>
                      <pre className="h-full min-h-0 whitespace-pre-wrap p-2 overflow-auto text-xs">
                        {engineConsole || "(no console output)"}
                      </pre>
                    </div>

                    {/* Divider / Handle */}
                    <div
                      className="h-2 border-y cursor-row-resize bg-muted/40"
                      onMouseDown={(e) => {
                        const host = engineSplitRef.current;
                        if (!host) return;
                        draggingRef.current = true;
                        dragStartYRef.current = e.clientY;
                        dragStartPctRef.current = engineSplitPct;
                        document.body.style.cursor = "row-resize";
                        document.body.style.userSelect = "none";
                      }}
                      title="Drag to resize"
                    />

                    {/* BOTTOM: Result */}
                    <div style={{ height: `${(1 - engineSplitPct) * 100}%` }} className="min-h-0">
                      <div className="px-2 py-1 text-xs text-muted-foreground border-b">Result</div>
                      <pre className="h-full min-h-0 whitespace-pre-wrap p-2 overflow-auto text-xs">
                        {engineResult || "(no result yet)"}
                      </pre>
                    </div>
                  </div>
                ) : null}
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
