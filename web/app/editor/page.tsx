"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GridCanvas } from "./GridCanvas";
import type { LevelData } from "../../shared/levelTypes";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

function pretty(obj: unknown) {
  return JSON.stringify(obj, null, 2);
}

function isLikelyLevelData(x: any): x is LevelData {
  return (
    x &&
    x.version === 1 &&
    x.grid &&
    typeof x.grid.w === "number" &&
    typeof x.grid.h === "number" &&
    Array.isArray(x.objects)
  );
}

const LS_KEY = "chromagame.levelJson.v1";

export default function EditorPage() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  const DEFAULT_JSON = pretty({
    version: 1,
    meta: { name: "Level 01", author: "you" },
    grid: { w: 20, h: 12, cellSize: 32 },
    objects: [],
  });

  const [jsonText, setJsonText] = useState<string>(DEFAULT_JSON);
  const [mounted, setMounted] = useState(false);

  const parsed = useMemo(() => {
    try {
      const obj = JSON.parse(jsonText);
      return { ok: true as const, obj };
    } catch (e: any) {
      return { ok: false as const, error: e?.message ?? "Invalid JSON" };
    }
  }, [jsonText]);

  const levelStatus = useMemo(() => {
    if (!parsed.ok) return { ok: false as const, msg: parsed.error };
    if (!isLikelyLevelData(parsed.obj))
      return { ok: false as const, msg: "JSON is valid, but not a LevelData (missing version/grid/objects)." };
    return { ok: true as const, msg: `OK: ${parsed.obj.grid.w}x${parsed.obj.grid.h}, objects: ${parsed.obj.objects.length}` };
  }, [parsed]);

  useEffect(() => {
    setMounted(true);
    const saved = window.localStorage.getItem(LS_KEY);
    if (saved) setJsonText(saved);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    window.localStorage.setItem(LS_KEY, jsonText);
  }, [mounted, jsonText]);

  async function onLoadFile(file: File) {
    const text = await file.text();
    setJsonText(text);
  }

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

          <div className={`text-xs ${levelStatus.ok ? "text-muted-foreground" : "text-destructive"}`}>
            {levelStatus.msg}
          </div>
        </Card>

        <div className="text-xs text-muted-foreground">
          Następny etap: canvas + paleta elementów.
        </div>
      </aside>

      <main className="flex-1 flex flex-col">
        <header className="h-14 border-b px-4 flex items-center gap-2">
          <div className="font-semibold">ChromaGame Editor</div>
          <div className="ml-auto text-sm text-muted-foreground">/editor</div>
        </header>

        <div className="flex-1 p-4">
          {/* 2 kolumny */}
          <div className="h-full grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Canvas */}
            <Card className="p-3 h-full flex flex-col gap-2">
              <div className="text-sm font-medium">Preview</div>

              <div className="flex-1 min-h-0">
                {levelStatus.ok ? (
                  <div className="h-full">
                    <GridCanvas
                      level={parsed.obj as LevelData}
                      selectedId={selectedId}
                      onObjectClick={(id) => setSelectedId(id)}
                      onCellClick={() => setSelectedId(undefined)}
                    />
                  </div>
                ) : (
                  <div className="h-full rounded-md border flex items-center justify-center text-muted-foreground">
                    Fix JSON to see preview
                  </div>
                )}
              </div>
            </Card>

            {/* JSON */}
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
