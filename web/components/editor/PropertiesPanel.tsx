"use client";

import type { LevelObject } from "../../shared/levelTypes";

export function PropertiesPanel({ obj }: { obj?: LevelObject }) {
  if (!obj) {
    return (
      <div className="pt-3 text-xs text-muted-foreground">
        Select an object to edit properties.
      </div>
    );
  }

  return (
    <div className="pt-3">
      <div className="text-xs text-muted-foreground mb-2">Properties</div>
      <div className="text-xs font-mono">
        id: {obj.id}<br />
        type: {obj.type}<br />
        x,y: {obj.x},{obj.y}
      </div>
    </div>
  );
}
