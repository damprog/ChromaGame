// web/shared/levelTypes.ts

export type Dir = "N" | "E" | "S" | "W";
export type Color = "R" | "G" | "B";

// =========================
// V1 (engine legacy): grid + objects[]
// =========================

export type MirrorAngleV1 = 45 | 135 | 225 | 315;

export type LevelObjectV1 =
  | { id: string; type: "laser"; x: number; y: number; dir: Dir; color?: Color }
  | { id: string; type: "mirror"; x: number; y: number; angle: MirrorAngleV1 }
  | { id: string; type: "wall"; x: number; y: number }
  | { id: string; type: "target"; x: number; y: number; accept?: Color[] };

export type LevelDataV1 = {
  version: 1;
  meta: { name: string; author?: string };
  grid: { w: number; h: number; cellSize: number };
  objects: LevelObjectV1[];
};

// Back-compat dla istniejących komponentów:
export type LevelObject = LevelObjectV1;
export type LevelData = LevelDataV1;

export function isLevelV1(x: any): x is LevelDataV1 {
  return (
    x &&
    x.version === 1 &&
    x.grid &&
    typeof x.grid.w === "number" &&
    typeof x.grid.h === "number" &&
    typeof x.grid.cellSize === "number" &&
    Array.isArray(x.objects)
  );
}

// =========================
// V2 (authoring/release): fixed + inventory + initialPlayer + dev.solution
// =========================

export type MirrorAngleV2 = 45 | 135 | 225 | 315;

export type FixedObjectV2 =
  | { id: string; type: "laser"; x: number; y: number; dir: Dir; color?: Color }
  | { id: string; type: "wall"; x: number; y: number }
  | { id: string; type: "target"; x: number; y: number; accept?: Color[] };

export type PlayerObjectV2 =
  | { id: string; type: "mirror"; x: number; y: number; angle: MirrorAngleV2 };

export type InventoryV2 = {
  mirror?: number;
};

export type LevelRulesV2 = {
  moveLimit?: number | null;
  requireAllTargets?: boolean;
};

export type LevelDevV2 = {
  solution?: PlayerObjectV2[];
  notes?: string;
};

export type LevelDataV2 = {
  version: 2;
  meta: {
    id?: string;
    name: string;
    author?: string;
    difficulty?: number;
  };
  grid: { w: number; h: number; cellSize: number };
  fixed: FixedObjectV2[];
  inventory: InventoryV2;
  initialPlayer?: PlayerObjectV2[];
  rules?: LevelRulesV2;
  dev?: LevelDevV2;
};

export function isLevelV2(x: any): x is LevelDataV2 {
  return (
    x &&
    x.version === 2 &&
    x.grid &&
    typeof x.grid.w === "number" &&
    typeof x.grid.h === "number" &&
    typeof x.grid.cellSize === "number" &&
    Array.isArray(x.fixed) &&
    x.inventory &&
    typeof x.inventory === "object"
  );
}
