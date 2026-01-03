// web/lib/level.ts

import { isLevelV2 } from "../shared/levelTypes";
import type {
  LevelData,
  LevelObject,
  LevelDataV1,
  LevelDataV2,
  FixedObjectV2,
  PlayerObjectV2,
  MirrorAngleV2,
} from "../shared/levelTypes";

// --------------------
// DEFAULTS
// --------------------

export const DEFAULT_LEVEL: LevelData = {
  version: 1,
  meta: { name: "Level 01", author: "you" },
  grid: { w: 20, h: 12, cellSize: 32 },
  objects: [],
};

export const DEFAULT_LEVEL_V2: LevelDataV2 = {
  version: 2,
  meta: { id: "l001", name: "Level 01", author: "you", difficulty: 1 },
  grid: { w: 20, h: 12, cellSize: 32 },
  fixed: [],
  inventory: { mirror: 3 },
  initialPlayer: [],
  rules: { moveLimit: null, requireAllTargets: true },
  dev: { solution: [] },
};

// --------------------
// JSON helpers
// --------------------

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

export function isLikelyLevelData(x: any): x is LevelDataV1 {
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

function cloneV2(src: LevelDataV2): LevelDataV2 {
  // bezpieczne i proste (schema małe)
  return JSON.parse(JSON.stringify(src)) as LevelDataV2;
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// --------------------
// V1 mutators (legacy)
// --------------------

export function nextId(prefix: string, objects: { id: string }[]) {
  let n = 1;
  while (objects.some((o) => o.id === `${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

export function isCellOccupied(level: LevelData, x: number, y: number, exceptId?: string) {
  return level.objects.some((o) => o.x === x && o.y === y && o.id !== exceptId);
}

export function addObjectAt(level: LevelData, tool: "laser" | "mirror" | "wall" | "target", x: number, y: number) {
  x = clamp(x, 0, level.grid.w - 1);
  y = clamp(y, 0, level.grid.h - 1);

  if (isCellOccupied(level, x, y)) return;

  if (tool === "laser") {
    level.objects.push({ id: nextId("L", level.objects), type: "laser", x, y, dir: "E", color: "R" } as any);
  } else if (tool === "mirror") {
    level.objects.push({ id: nextId("M", level.objects), type: "mirror", x, y, angle: 0 } as any);
  } else if (tool === "wall") {
    level.objects.push({ id: nextId("W", level.objects), type: "wall", x, y } as any);
  } else if (tool === "target") {
    level.objects.push({ id: nextId("T", level.objects), type: "target", x, y, accept: ["R"] } as any);
  }
}

export function removeObjectById(level: LevelData, id: string) {
  level.objects = level.objects.filter((o) => o.id !== id) as any;
}

export function findObject(level: LevelData, id?: string): LevelObject | undefined {
  if (!id) return undefined;
  return level.objects.find((o) => o.id === id);
}

export function updateObject(level: LevelData, id: string, patch: Partial<LevelObject>) {
  const idx = level.objects.findIndex((o) => o.id === id);
  if (idx === -1) return;
  level.objects[idx] = { ...level.objects[idx], ...patch } as any;
}

export function tryMoveObject(level: LevelData, id: string, x: number, y: number) {
  const obj = level.objects.find((o) => o.id === id);
  if (!obj) return;

  x = clamp(x, 0, level.grid.w - 1);
  y = clamp(y, 0, level.grid.h - 1);

  if (isCellOccupied(level, x, y, id)) return;
  obj.x = x;
  obj.y = y;
}

// --------------------
// V2 helpers (NOWE)
// --------------------

function ensureDev(level: LevelDataV2) {
  if (!level.dev) level.dev = {};
  if (!Array.isArray(level.dev.solution)) level.dev.solution = [];
}

function allObjectsV2(level: LevelDataV2): Array<FixedObjectV2 | PlayerObjectV2> {
  const sol = Array.isArray(level.dev?.solution) ? level.dev!.solution! : [];
  const init = Array.isArray(level.initialPlayer) ? level.initialPlayer : [];
  return [...level.fixed, ...init, ...sol];
}

function isOccupiedV2(level: LevelDataV2, x: number, y: number, exceptId?: string) {
  return allObjectsV2(level).some((o) => o.x === x && o.y === y && o.id !== exceptId);
}

function nextIdV2(level: LevelDataV2, prefix: string) {
  const ids = new Set(allObjectsV2(level).map((o) => o.id));
  let n = 1;
  while (ids.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

// v2 -> v1 (engine input). Dla edytora bierzemy fixed + dev.solution (+ initialPlayer)
export function v2ToEngineV1ForEditor(level: LevelDataV2): LevelData {
  const solution = Array.isArray(level.dev?.solution) ? level.dev!.solution! : [];
  const initial = Array.isArray(level.initialPlayer) ? level.initialPlayer : [];

  return {
    version: 1,
    meta: { name: level.meta.name, author: level.meta.author },
    grid: { ...level.grid },
    objects: [...(level.fixed as any), ...(initial as any), ...(solution as any)],
  };
}

// v1 -> v2 (przy wczytaniu starego json)
export function v1ToV2(level: LevelDataV1): LevelDataV2 {
  const fixed = level.objects.filter((o) => o.type !== "mirror") as any as FixedObjectV2[];
  const mirrors = level.objects.filter((o) => o.type === "mirror") as any as PlayerObjectV2[];

  const invCount = mirrors.length > 0 ? mirrors.length : 3;

  return {
    version: 2,
    meta: { name: level.meta.name, author: level.meta.author, difficulty: 1 },
    grid: { ...level.grid },
    fixed,
    inventory: { mirror: invCount },
    initialPlayer: [],
    rules: { moveLimit: null, requireAllTargets: true },
    dev: { solution: mirrors },
  };
}

export function stripDev(level: LevelDataV2): LevelDataV2 {
  const c = cloneV2(level);
  delete (c as any).dev;
  return c;
}

export function addObjectAtV2(level: LevelDataV2, tool: "laser" | "mirror" | "wall" | "target", x: number, y: number) {
  x = clamp(x, 0, level.grid.w - 1);
  y = clamp(y, 0, level.grid.h - 1);

  if (isOccupiedV2(level, x, y)) return;

  if (tool === "mirror") {
    ensureDev(level);
    level.dev!.solution!.push({
      id: nextIdV2(level, "M"),
      type: "mirror",
      x,
      y,
      angle: 45,
    });
    return;
  }

  if (tool === "laser") {
    level.fixed.push({ id: nextIdV2(level, "L"), type: "laser", x, y, dir: "E", color: "R" });
    return;
  }

  if (tool === "wall") {
    level.fixed.push({ id: nextIdV2(level, "W"), type: "wall", x, y });
    return;
  }

  if (tool === "target") {
    level.fixed.push({ id: nextIdV2(level, "T"), type: "target", x, y, accept: ["R"] });
    return;
  }
}

export function removeObjectByIdV2(level: LevelDataV2, id: string) {
  level.fixed = level.fixed.filter((o) => o.id !== id);
  if (level.initialPlayer) level.initialPlayer = level.initialPlayer.filter((o) => o.id !== id);
  if (level.dev?.solution) level.dev.solution = level.dev.solution.filter((o) => o.id !== id);
}

export function updateObjectV2(level: LevelDataV2, id: string, patch: any) {
  const fixIdx = level.fixed.findIndex((o) => o.id === id);
  if (fixIdx !== -1) {
    level.fixed[fixIdx] = { ...level.fixed[fixIdx], ...patch } as any;
    return;
  }

  const initIdx = (level.initialPlayer ?? []).findIndex((o) => o.id === id);
  if (initIdx !== -1 && level.initialPlayer) {
    level.initialPlayer[initIdx] = { ...level.initialPlayer[initIdx], ...patch } as any;
    return;
  }

  const solIdx = (level.dev?.solution ?? []).findIndex((o) => o.id === id);
  if (solIdx !== -1 && level.dev?.solution) {
    level.dev.solution[solIdx] = { ...level.dev.solution[solIdx], ...patch } as any;
  }
}

export function tryMoveObjectV2(level: LevelDataV2, id: string, x: number, y: number) {
  x = clamp(x, 0, level.grid.w - 1);
  y = clamp(y, 0, level.grid.h - 1);
  if (isOccupiedV2(level, x, y, id)) return;

  const fix = level.fixed.find((o) => o.id === id);
  if (fix) { fix.x = x; fix.y = y; return; }

  const init = level.initialPlayer?.find((o) => o.id === id);
  if (init) { init.x = x; init.y = y; return; }

  const sol = level.dev?.solution?.find((o) => o.id === id);
  if (sol) { sol.x = x; sol.y = y; }
}

export function setInventoryMirrors(level: LevelDataV2, n: number) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  level.inventory.mirror = v;
}

type MirrorAngle = 45 | 135 | 225 | 315;

export function normalizeMirrorAngle(a: number): MirrorAngle {
  const vals: MirrorAngle[] = [45, 135, 225, 315];
  const v = ((a % 360) + 360) % 360;

  let best: MirrorAngle = 45;
  let bestDist = 9999;

  for (const t of vals) {
    const d = Math.min(Math.abs(v - t), 360 - Math.abs(v - t));
    if (d < bestDist) { bestDist = d; best = t; }
  }
  return best;
}


export function tryParseLevelV2(text: string): LevelDataV2 | null {
  const p = parseJson(text);
  if (!p.ok) return null;
  return isLevelV2(p.obj) ? (p.obj as LevelDataV2) : null;
}

// === PLAY helpers (v2 -> engine v1 using runtime playerState) ===
// fixed + initialPlayer + runtime playerObjects
export function v2ToEngineV1ForPlay(level: LevelDataV2, playerObjects: PlayerObjectV2[]): LevelData {
  const initial = Array.isArray(level.initialPlayer) ? level.initialPlayer : [];
  return {
    version: 1,
    meta: { name: level.meta.name, author: level.meta.author },
    grid: { ...level.grid },
    objects: [...(level.fixed as any), ...(initial as any), ...(playerObjects as any)],
  };
}

export function fixedIdsV2(level: LevelDataV2): Set<string> {
  return new Set(level.fixed.map((o) => o.id));
}

export function initialIdsV2(level: LevelDataV2): Set<string> {
  return new Set((level.initialPlayer ?? []).map((o) => o.id));
}
