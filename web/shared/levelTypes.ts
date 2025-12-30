export type LevelObject =
  | { id: string; type: "laser"; x: number; y: number; dir: "N" | "E" | "S" | "W"; color?: "R" | "G" | "B" }
  | { id: string; type: "mirror"; x: number; y: number; angle: 45 | 90 | 135 | 180 }
  | { id: string; type: "wall"; x: number; y: number }
  | { id: string; type: "target"; x: number; y: number; accept?: ("R" | "G" | "B")[] };

export type LevelData = {
  version: 1;
  meta: { name: string; author?: string };
  grid: { w: number; h: number; cellSize: number };
  objects: LevelObject[];
};
