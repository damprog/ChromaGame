"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LevelData, LevelDataV2 } from "../../shared/levelTypes";
import { isLevelV2 } from "../../shared/levelTypes";
import type { TraceJson } from "@/shared/trace";

import { GridCanvas } from "@/components/editor/GridCanvas";
import { Toolbox, type Tool } from "@/components/editor/Toolbox";
import { ObjectList } from "@/components/editor/ObjectList";
import { PropertiesPanel } from "@/components/editor/PropertiesPanel";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

import { traceWasm } from "@/lib/engineWasm";
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

export default function EditorPage() {
  const skipNextAutoLoadRef = useRef(false);

  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  const [jsonText, setJsonText] = useState<string>(pretty(DEFAULT_LEVEL_V2));
  const [baselineJson, setBaselineJson] = useState<string>("");

  const normalizedJsonText = useMemo(() => normalizeJsonText(jsonText), [jsonText]);
  const normalizedBaseline = useMemo(() => normalizeJsonText(baselineJson), [baselineJson]);
  const isDirty = normalizedJsonText !== normalizedBaseline;

  const [mounted, setMounted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [trace, setTrace] = useState<TraceJson | null>(null);
  const [traceStatus, setTraceStatus] = useState<TraceStatus>("idle");
  const [traceError, setTraceError] = useState<string | null>(null);
  const [lastTraceAt, setLastTraceAt] = useState<number | null>(null);

  const [autoBuild, setAutoBuild] = useState(false);
  const [autoBuildAt, setAutoBuildAt] = useState<number | null>(null);
  const [autoBuildError, setAutoBuildError] = useState<string | null>(null);
  const autoBuildBusyRef = useRef(false);
  const lastAutoBuildJsonRef = useRef<string>("");

  const [levels, setLevels] = useState<string[]>([]);
  const [levelName, setLevelName] = useState<string>("level01.json");

  const parsed = useMemo(() => parseJson(jsonText), [jsonText]);

  // v2 level (źródło prawdy w edytorze)
  const levelV2: LevelDataV2 | null = useMemo(() => {
    if (!parsed.ok) return null;
    return isLevelV2(parsed.obj) ? (parsed.obj as LevelDataV2) : null;
  }, [parsed]);

  // Widok v1 do istniejących komponentów (canvas/list/properties)
  const viewLevel: LevelData | null = useMemo(() => {
    if (!levelV2) return null;
    return v2ToEngineV1ForEditor(levelV2);
  }, [levelV2]);

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
      return {
        ok: true as const,
        msg: `OK v1 (auto-migrate on load): objects=${parsed.obj.objects.length}`,
      };
    }

    return { ok: false as const, msg: "JSON valid, but not Level v1/v2." };
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

  // === LEVEL LIST (select) ===
  async function refreshLevelsList() {
    const res = await fetch("/api/levels", { cache: "no-store" });
    if (!res.ok) return;

    const j = await res.json();
    if (j?.ok && Array.isArray(j.levels)) {
      setLevels(j.levels);
    }
  }

  // load list on page load (fix for empty select)
  useEffect(() => {
    void refreshLevelsList();
  }, []);

  async function loadLevelFromDisk(name: string) {
    const file = normalizeLevelName(name);
    const res = await fetch(`/api/levels/${encodeURIComponent(file)}`, { cache: "no-store" });
    if (!res.ok) return;

    const txt = await res.text();

    // v1 → migrate to v2
    const p = parseJson(txt);
    if (p.ok && isLikelyLevelData(p.obj)) {
      const v2 = v1ToV2(p.obj);
      const out = pretty(v2);
      setJsonText(out);
      setBaselineJson(out);
      await runTraceWasm(out);
      return;
    }

    setJsonText(txt);
    setBaselineJson(txt);
    await runTraceWasm(txt);
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

    setBaselineJson(body); // natychmiast gasi "Unsaved"
    setIsSaving(true);

    try {
      await saveLevelToDisk(levelName, body);
    } catch (e) {
      setBaselineJson(prev);
      throw e;
    } finally {
      setIsSaving(false);
    }
  }

  async function runTraceWasm(jsonOverride?: string) {
    const body = jsonOverride ?? jsonText;
    if (!body || body.trim().length === 0) return;

    setTraceStatus("loading");
    setTraceError(null);

    try {
      const t = await traceWasm(body); // wasm ogarnia v2->v1
      setTrace(t);
      setTraceStatus("ok");
      setLastTraceAt(Date.now());
    } catch (e: any) {
      setTraceStatus("error");
      setTraceError(String(e?.message ?? e));
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
        await runTraceWasm(body);

        lastAutoBuildJsonRef.current = body;
        setAutoBuildAt(Date.now());
      } catch (e: any) {
        setAutoBuildError(String(e?.message ?? e));
      } finally {
        autoBuildBusyRef.current = false;
      }
    }, 350);

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
  }, [selectedId, jsonText]);

  // Auto-load after level change
  const [isAutoLoading, setIsAutoLoading] = useState(false);
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
        if (!alive) return;
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

    setLevelName(file);
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

  function onFormat() {
    if (!parsed.ok) return;
    setJsonText(pretty(parsed.obj));
  }

  const selectedObj = useMemo(() => {
    if (!viewLevel) return undefined;
    return viewLevel.objects.find((o) => o.id === selectedId);
  }, [viewLevel, selectedId]);

  return (
    <div className="h-dvh flex">
      <aside className="w-72 border-r p-4 flex flex-col gap-3">
        <div className="font-semibold">Tools</div>

        <Card className="p-3 flex flex-col gap-2">
          {isDirty ? <span className="text-xs text-muted-foreground">● Unsaved</span> : null}
          {isSaving ? <span className="text-xs text-muted-foreground">Saving...</span> : null}
          {isAutoLoading ? <span className="text-xs text-muted-foreground">Loading...</span> : null}

          <select value={levelName} onChange={(e) => requestSelectLevel(e.target.value)}>
            {levels.length === 0 ? (
              <option value={levelName}>(loading levels...)</option>
            ) : (
              levels.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))
            )}
          </select>

          <Button onClick={() => void onSaveNow()} disabled={isSaving}>
            Save
          </Button>

          <Button
            variant="outline"
            onClick={async () => {
              if (isDirty) {
                const ok = window.confirm("Masz niezapisane zmiany. Utworzyć nowy level i je utracić?");
                if (!ok) return;
              }

              const file = nextLevelFileName(levels);

              const lvl = structuredClone(DEFAULT_LEVEL_V2);
              lvl.meta = { ...lvl.meta, name: fileNameToMetaName(file), id: file.replace(/\.json$/i, "") };

              const body = pretty(lvl);

              try {
                // utwórz plik od razu
                await saveLevelToDisk(file, body);

                // od razu dodaj do selecta (bez czekania na API)
                setLevels((prev) => {
                  const set = new Set([...prev, file]);
                  return Array.from(set).sort();
                });

                // ustaw UI na nowy level, bez natychmiastowego autoloadu
                skipNextAutoLoadRef.current = true;
                setLevelName(file);
                setJsonText(body);
                setBaselineJson(body);

                setSelectedId(undefined);
                setTrace(null);
                setTraceStatus("idle");

                // dopnij pewność z API (po cichu)
                void refreshLevelsList();

                await runTraceWasm(body);
              } catch (e: any) {
                alert(String(e?.message ?? e));
              }
            }}
          >
            New Level (v2)
          </Button>

          <Button variant="outline" onClick={onFormat} disabled={!parsed.ok}>
            Format
          </Button>

          {/* Inventory (v2) */}
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

          {/* Auto-build + Trace */}
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

            <Button
              variant="default"
              disabled={!levelV2}
              onClick={async () => {
                if (!levelV2) return;

                const released = stripDev(levelV2);
                const body = pretty(released);

                const res = await fetch(`/api/release-levels/${encodeURIComponent(levelName)}`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json; charset=utf-8" },
                  body,
                });

                if (!res.ok) {
                  alert(`Release failed (HTTP ${res.status})`);
                  return;
                }

                alert("Released.");
              }}
            >
              Release level
            </Button>

            <Button
              variant="outline"
              onClick={() => window.open(`/play?level=${encodeURIComponent(levelName)}`, "_blank")}
            >
              Play Preview
            </Button>

            <div className="text-xs text-muted-foreground">
              Trace: <b>{traceStatus}</b>
              {lastTraceAt ? <span> • {new Date(lastTraceAt).toLocaleTimeString()}</span> : null}
              {traceError ? <span className="ml-2">• {traceError}</span> : null}
            </div>
          </div>

          <div className={`text-xs ${levelStatus.ok ? "text-muted-foreground" : "text-destructive"}`}>
            {levelStatus.msg}
          </div>

          <Toolbox tool={tool} setTool={setTool} />

          {viewLevel ? (
            <>
              <ObjectList level={viewLevel} selectedId={selectedId} onSelect={setSelectedId} />
              <PropertiesPanel
                obj={selectedObj}
                onUpdate={(id, patch) => updateLevelV2((lvl) => updateObjectV2(lvl, id, patch))}
                onMove={(id, x, y) => updateLevelV2((lvl) => tryMoveObjectV2(lvl, id, x, y))}
              />
            </>
          ) : null}
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
                          return;
                        }

                        if (hitId) {
                          setSelectedId(hitId);
                          return;
                        }

                        updateLevelV2((lvl) => addObjectAtV2(lvl, tool, x, y));
                      }}
                      onDrag={({ id, x, y, phase }) => {
                        setSelectedId(id);
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
