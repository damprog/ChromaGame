"use client";

import { useEffect, useMemo, useRef } from "react";
import type { LevelData, LevelObject } from "../../shared/levelTypes";

type Props = {
  level: LevelData;
  selectedId?: string;
  onClick?: (info: { x: number; y: number; hitId?: string }) => void;
};

function cellToPx(cell: number, cellSize: number) {
  return cell * cellSize;
}

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, cellSize: number) {
  ctx.clearRect(0, 0, w, h);

  // background
  ctx.fillStyle = "rgba(0,0,0,0.01)";
  ctx.strokeStyle = "rgba(0,0,0,0.08)";
  ctx.fillRect(0, 0, w, h);

  // grid lines
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;

  for (let x = 0; x <= w; x += cellSize) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += cellSize) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
    ctx.stroke();
  }
}

function drawObject(
  ctx: CanvasRenderingContext2D,
  obj: LevelObject,
  cellSize: number,
  selected: boolean
) {
  const x = cellToPx(obj.x, cellSize);
  const y = cellToPx(obj.y, cellSize);

  ctx.save();

  // selection outline
  if (selected) {
    ctx.strokeStyle = "rgba(0, 120, 255, 0.9)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
  }

  // object box
  ctx.fillStyle = "rgba(0,0,0,0.08)";
  ctx.fillRect(x + 4, y + 4, cellSize - 8, cellSize - 8);
 
  // label
  ctx.fillStyle = "rgba(0,0,0,0.85)"; // dla tekstu
  ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  ctx.fillText(obj.type, x + 8, y + 18);

  ctx.restore();
}

function getCellFromMouse(
  canvas: HTMLCanvasElement,
  e: MouseEvent,
  cellSize: number
) {
  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  return { x: Math.floor(px / cellSize), y: Math.floor(py / cellSize) };
}

export function GridCanvas({ level, selectedId, onClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const pxSize = useMemo(() => {
    const w = level.grid.w * level.grid.cellSize;
    const h = level.grid.h * level.grid.cellSize;
    return { w, h };
  }, [level.grid.w, level.grid.h, level.grid.cellSize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    drawGrid(ctx, pxSize.w, pxSize.h, level.grid.cellSize);

    for (const obj of level.objects) {
      drawObject(ctx, obj, level.grid.cellSize, obj.id === selectedId);
    }
  }, [level, selectedId, pxSize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleClick = (e: MouseEvent) => {
      const { x, y } = getCellFromMouse(canvas, e, level.grid.cellSize);
      const hit = level.objects.find(o => o.x === x && o.y === y);
      onClick?.({ x, y, hitId: hit?.id });
    };

    canvas.addEventListener("click", handleClick);
    return () => canvas.removeEventListener("click", handleClick);
  }, [level, onClick]);

  return (
    <div className="overflow-auto rounded-md border">
      <canvas
        ref={canvasRef}
        width={pxSize.w}
        height={pxSize.h}
        className="block"
      />
    </div>
  );
}
