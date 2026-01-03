"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LevelDataV2, PlayerObjectV2 } from "@/shared/levelTypes";
import { isLevelV2 } from "@/shared/levelTypes";
import { GridCanvas } from "@/components/editor/GridCanvas";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { traceWasm } from "@/lib/engineWasm";
import { parseJson, stripDev, v2ToEngineV1ForPlay, fixedIdsV2, initialIdsV2, normalizeMirrorAngle } from "@/lib/level";

type Tool = "select" | "erase" | "mirror";

function nextId(prefix: string, existing: { id: string }[]) {
  let n = 1;
  const set = new Set(existing.map((o) => o.id));
  while (set.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

export default function PlayPage() {
  const [tool, setTool] = useState<Tool>("select");
  const [levelName, setLevelName] = useState<string>("level01.json");
  const [levelV2, setLevelV2] = useState<LevelDataV2 | null>(null);

  const [player, setPlayer] = useState<PlayerObjectV2[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  const [trace, setTrace] = useState<any>(null);
  const [traceErr, setTraceErr] = useState<string | null>(null);

  const fixedIds = useMemo(() => (levelV2 ? fixedIdsV2(levelV2) : new Set<string>()), [levelV2]);
  const initialIds = useMemo(() => (levelV2 ? initialIdsV2(levelV2) : new Set<string>()), [levelV2]);

  const inventoryMirrors = levelV2?.inventory?.mirror ?? 0;
  const usedMirrors = player.length;
  const remainingMirrors = Math.max(0, inventoryMirrors - usedMirrors);

  const engineLevelV1 = useMemo(() => {
    if (!levelV2) return null;
    return v2ToEngineV1ForPlay(levelV2, player);
  }, [levelV2, player]);

  async function loadLevel(name: string) {
    setLevelV2(null);
    setPlayer([]);
    setSelectedId(undefined);
    setTrace(null);
    setTraceErr(null);

    // 1) prefer release
    let txt: string | null = null;

    const r1 = await fetch(`/api/release-levels/${encodeURIComponent(name)}`, { cache: "no-store" });
    if (r1.ok) txt = await r1.text();

    // 2) fallback to authoring (/api/levels) and strip dev client-side
    if (!txt) {
      const r2 = await fetch(`/api/levels/${encodeURIComponent(name)}`, { cache: "no-store" });
      if (r2.ok) txt = await r2.text();
    }

    if (!txt) {
      setTraceErr("Level not found.");
      return;
    }

    const p = parseJson(txt);
    if (!p.ok || !isLevelV2(p.obj)) {
      setTraceErr("Level is not v2 JSON.");
      return;
    }

    const v2 = stripDev(p.obj as LevelDataV2); // w play ignorujemy dev nawet jak jest
    setLevelV2(v2);

    // start playerState = initialPlayer (a nie solution!)
    setPlayer(Array.isArray(v2.initialPlayer) ? v2.initialPlayer : []);
  }

  async function runTrace() {
    if (!engineLevelV1) return;
    setTraceErr(null);
    try {
      const t = await traceWasm(JSON.stringify(engineLevelV1));
      setTrace(t);
    } catch (e: any) {
      setTraceErr(String(e?.message ?? e));
    }
  }

  useEffect(() => {
    const url = new URL(window.location.href);
    const q = url.searchParams.get("level");
    if (q) setLevelName(q);
  }, []);

  useEffect(() => {
    void loadLevel(levelName);
  }, [levelName]);

  useEffect(() => {
    void runTrace();
  }, [engineLevelV1]);

  // rotate selected mirror with "R"
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "r") return;
      if (!selectedId) return;

      setPlayer((prev) =>
        prev.map((m) => {
          if (m.id !== selectedId) return m;
          return { ...m, angle: normalizeMirrorAngle(m.angle + 90) };
        })
      );
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId]);

  function isCellOccupied(x: number, y: number, exceptId?: string) {
    if (!engineLevelV1) return false;
    return engineLevelV1.objects.some((o: any) => o.x === x && o.y === y && o.id !== exceptId);
  }

  return (
    <div className="h-dvh flex">
      <aside className="w-72 border-r p-4 flex flex-col gap-3">
        <div className="font-semibold">Play</div>

        <Card className="p-3 flex flex-col gap-2">
          <div className="text-xs text-muted-foreground">Level</div>
          <div className="text-sm font-mono">{levelName}</div>

          <div className="text-xs text-muted-foreground mt-2">Inventory</div>
          <div className="text-sm">
            mirrors: <b>{usedMirrors}</b> / {inventoryMirrors} (left: <b>{remainingMirrors}</b>)
          </div>

          <div className="text-xs text-muted-foreground mt-2">Tools</div>
          <div className="flex gap-2">
            <Button variant={tool === "select" ? "default" : "secondary"} onClick={() => setTool("select")}>
              Select
            </Button>
            <Button variant={tool === "mirror" ? "default" : "secondary"} onClick={() => setTool("mirror")}>
              Mirror
            </Button>
            <Button variant={tool === "erase" ? "default" : "secondary"} onClick={() => setTool("erase")}>
              Erase
            </Button>
          </div>

          <div className="flex gap-2 mt-2">
            <Button
              variant="outline"
              onClick={() => {
                if (!selectedId) return;
                setPlayer((prev) =>
                  prev.map((m) => (m.id === selectedId ? { ...m, angle: normalizeMirrorAngle(m.angle + 90) } : m))
                );
              }}
              disabled={!selectedId}
            >
              Rotate (R)
            </Button>

            <Button
              variant="outline"
              onClick={() => {
                if (!selectedId) return;
                // remove only if it's a player mirror (not fixed/initial)
                setPlayer((prev) => prev.filter((m) => m.id !== selectedId));
                setSelectedId(undefined);
              }}
              disabled={!selectedId}
            >
              Remove
            </Button>
          </div>

          {traceErr ? <div className="text-xs text-destructive mt-2">{traceErr}</div> : null}
        </Card>
      </aside>

      <main className="flex-1 flex flex-col">
        <header className="h-14 border-b px-4 flex items-center">
          <div className="font-semibold">/play</div>
          <div className="ml-auto text-sm text-muted-foreground">{levelV2?.meta?.name ?? ""}</div>
        </header>

        <div className="flex-1 p-4">
          <Card className="p-3 h-full">
            <div className="h-full">
              {engineLevelV1 ? (
                <GridCanvas
                  level={engineLevelV1 as any}
                  selectedId={selectedId}
                  trace={trace}
                  onClick={({ x, y, hitId }) => {
                    if (!levelV2) return;

                    if (tool === "erase") {
                      if (!hitId) return;
                      // nie usuwaj fixed/initial
                      if (fixedIds.has(hitId) || initialIds.has(hitId)) return;
                      setPlayer((prev) => prev.filter((m) => m.id !== hitId));
                      if (selectedId === hitId) setSelectedId(undefined);
                      return;
                    }

                    if (tool === "select") {
                      setSelectedId(hitId);
                      return;
                    }

                    // tool === mirror
                    if (hitId) {
                      setSelectedId(hitId);
                      return;
                    }

                    if (remainingMirrors <= 0) return;
                    if (isCellOccupied(x, y)) return;

                    setPlayer((prev) => [
                      ...prev,
                      { id: nextId("PM", prev), type: "mirror", x, y, angle: 45 },
                    ]);
                  }}
                  onDrag={({ id, x, y, phase }) => {
                    setSelectedId(id);

                    // blokada przesuwania fixed/initial
                    if (fixedIds.has(id) || initialIds.has(id)) return;

                    if (phase === "move" || phase === "end") {
                      setPlayer((prev) =>
                        prev.map((m) => (m.id === id ? { ...m, x, y } : m))
                      );
                    }
                  }}
                />
              ) : (
                <div className="h-full rounded-md border flex items-center justify-center text-muted-foreground">
                  Loading level...
                </div>
              )}
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
