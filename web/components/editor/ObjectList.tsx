"use client";

import type { LevelData } from "../../shared/levelTypes";
import { Button } from "@/components/ui/button";

export function ObjectList({
  level,
  selectedId,
  onSelect,
}: {
  level: LevelData;
  selectedId?: string;
  onSelect: (id?: string) => void;
}) {
  return (
    <div className="pt-3">
      <div className="text-xs text-muted-foreground mb-2">
        Objects ({level.objects.length})
      </div>

      <div className="flex flex-col gap-1 max-h-56 overflow-auto pr-1">
        {level.objects.map((o) => (
          <Button
            key={o.id}
            variant={selectedId === o.id ? "default" : "secondary"}
            className="justify-between"
            onClick={() => onSelect(o.id)}
          >
            <span className="font-mono text-xs">{o.id}</span>
            <span className="text-xs opacity-80">{o.type}</span>
          </Button>
        ))}
        {level.objects.length === 0 && (
          <div className="text-xs text-muted-foreground">No objects</div>
        )}
      </div>
    </div>
  );
}
