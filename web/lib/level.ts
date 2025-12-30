import type { LevelData, LevelObject } from "../shared/levelTypes";

export const DEFAULT_LEVEL: LevelData = {
  version: 1,
  meta: { name: "Level 01", author: "you" },
  grid: { w: 20, h: 12, cellSize: 32 },
  objects: [],
};

export function pretty(obj: unknown) {
  return JSON.stringify(obj, null, 2);
}

export function parseJson(text: string): { ok: true; obj: any } | { ok: false; error: string } {
  try {
    return { ok: true, obj: JSON.parse(text) };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Invalid JSON" };
  }
}

export function isLikelyLevelData(x: any): x is LevelData {
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

export function cloneLevel(src: LevelData): LevelData {
  return {
    ...src,
    meta: { ...src.meta },
    grid: { ...src.grid },
    objects: src.objects.map((o) => ({ ...o })) as any,
  };
}

export function nextId(prefix: string, objects: { id: string }[]) {
  let n = 1;
  while (objects.some((o) => o.id === `${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

export function addObjectAt(level: LevelData, tool: "laser" | "mirror" | "wall" | "target", x: number, y: number) {
  const exists = level.objects.some((o) => o.x === x && o.y === y);
  if (exists) return;

  if (tool === "laser") {
    level.objects.push({
      id: nextId("L", level.objects),
      type: "laser",
      x, y,
      dir: "E",
      color: "R",
    } as any);
  } else if (tool === "mirror") {
    level.objects.push({
      id: nextId("M", level.objects),
      type: "mirror",
      x, y,
      angle: 45,
    } as any);
  } else if (tool === "wall") {
    level.objects.push({
      id: nextId("W", level.objects),
      type: "wall",
      x, y,
    } as any);
  } else if (tool === "target") {
    level.objects.push({
      id: nextId("T", level.objects),
      type: "target",
      x, y,
      accept: ["R"],
    } as any);
  }
}

export function removeObjectById(level: LevelData, id: string) {
  level.objects = level.objects.filter((o) => o.id !== id) as any;
}

export function findObject(level: LevelData, id?: string): LevelObject | undefined {
  if (!id) return undefined;
  return level.objects.find((o) => o.id === id);
}
