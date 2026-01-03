"use client";

import type { LevelObject } from "../../shared/levelTypes";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function PropertiesPanel({
  obj,
  onUpdate,
  onMove,
}: {
  obj?: LevelObject;
  onUpdate: (id: string, patch: Partial<LevelObject>) => void;
  onMove: (id: string, x: number, y: number) => void;
}) {
  if (!obj) {
    return (
      <div className="pt-3 text-xs text-muted-foreground">
        Select an object to edit properties.
      </div>
    );
  }

  const num = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  return (
    <div className="pt-3 flex flex-col gap-3">
      <div className="text-xs text-muted-foreground">Properties</div>

      {/* Id / Type */}
      <div className="text-xs font-mono">
        id: {obj.id}
        <br />
        type: {obj.type}
      </div>

      {/* X / Y */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <div className="text-xs text-muted-foreground">x</div>
          <Input
            value={obj.x}
            onChange={(e) => onMove(obj.id, num(e.target.value), obj.y)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <div className="text-xs text-muted-foreground">y</div>
          <Input
            value={obj.y}
            onChange={(e) => onMove(obj.id, obj.x, num(e.target.value))}
          />
        </div>
      </div>

      {/* Specyficzne pola wg typu */}
      {obj.type === "laser" && (
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <div className="text-xs text-muted-foreground">dir</div>
            <div className="grid grid-cols-2 gap-2">
              {(["N", "W", "S", "E"] as const).map((d) => (
                <Button
                  key={d}
                  variant={obj.dir === d ? "default" : "secondary"}
                  onClick={() => onUpdate(obj.id, { dir: d } as any)}
                >
                  {d}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="text-xs text-muted-foreground">color</div>
            <div className="grid grid-cols-3 gap-2">
              {(["R", "G", "B"] as const).map((c) => (
                <Button
                  key={c}
                  variant={obj.color === c ? "default" : "secondary"}
                  onClick={() => onUpdate(obj.id, { color: c } as any)}
                >
                  {c}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}

      {obj.type === "mirror" && (
        <div className="flex flex-col gap-1">
          <div className="text-xs text-muted-foreground">angle</div>
          <div className="grid grid-cols-2 gap-2">
            {[45, 135, 225, 315].map((a) => (
              <Button
                key={a}
                variant={obj.angle === a ? "default" : "secondary"}
                onClick={() => onUpdate(obj.id, { angle: a as any } as any)}
              >
                {a}
              </Button>
            ))}
          </div>
        </div>
      )}

      {obj.type === "target" && (
        <div className="flex flex-col gap-1">
          <div className="text-xs text-muted-foreground">accept</div>
          <div className="grid grid-cols-3 gap-2">
            {(["R", "G", "B"] as const).map((c) => {
              const has = (obj.accept ?? []).includes(c);
              return (
                <Button
                  key={c}
                  variant={has ? "default" : "secondary"}
                  onClick={() => {
                    const next = new Set(obj.accept ?? []);
                    if (has) next.delete(c);
                    else next.add(c);
                    onUpdate(obj.id, { accept: Array.from(next) as any } as any);
                  }}
                >
                  {c}
                </Button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
