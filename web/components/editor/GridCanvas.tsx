"use client";

import { useEffect, useMemo, useRef } from "react";
import type { LevelData, LevelObject } from "../../shared/levelTypes";

type Props = {
  level: LevelData;
  selectedId?: string;
  trace?: TraceJson | null;
  onClick?: (info: { x: number; y: number; hitId?: string }) => void;
  onDrag?: (info: { id: string; x: number; y: number; phase: "start" | "move" | "end" }) => void;
};

type TraceJson = {
  segments: { x0: number; y0: number; x1: number; y1: number }[];
  hitWall?: boolean;
  hitTarget?: boolean;
  hitTargetId?: string;
};

function cellToPx(cell: number, cellSize: number) {
  return cell * cellSize;
}

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, cellSize: number) {
  ctx.clearRect(0, 0, w, h);

  // background
  ctx.fillStyle = "rgba(0,0,0,0.01)";
  ctx.fillRect(0, 0, w, h);

  // grid lines
  ctx.strokeStyle = "rgba(0,0,0,0.08)";
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

function drawObject(ctx: CanvasRenderingContext2D, obj: LevelObject, cellSize: number, selected: boolean) {
  const x = cellToPx(obj.x, cellSize);
  const y = cellToPx(obj.y, cellSize);

  ctx.save();

  if (selected) {
    ctx.strokeStyle = "rgba(0, 120, 255, 0.9)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
  }

  ctx.fillStyle = "rgba(0,0,0,0.08)";
  ctx.fillRect(x + 4, y + 4, cellSize - 8, cellSize - 8);

  ctx.fillStyle = "rgba(0,0,0,0.85)";
  ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  ctx.fillText(obj.type, x + 8, y + 18);

  ctx.restore();
}

function getCellFromMouse(canvas: HTMLCanvasElement, e: MouseEvent, cellSize: number) {
  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  return { x: Math.floor(px / cellSize), y: Math.floor(py / cellSize) };
}

export function GridCanvas({ level, selectedId, onClick, onDrag, trace }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const pxSize = useMemo(() => {
    const w = level.grid.w * level.grid.cellSize;
    const h = level.grid.h * level.grid.cellSize;
    return { w, h };
  }, [level.grid.w, level.grid.h, level.grid.cellSize]);

  // render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    drawGrid(ctx, pxSize.w, pxSize.h, level.grid.cellSize);
    for (const obj of level.objects) {
      drawObject(ctx, obj, level.grid.cellSize, obj.id === selectedId);
    }

    // trace overlay
    if (trace?.segments?.length) {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 0, 0, 0.85)";
      ctx.lineWidth = 3;

      const cs = level.grid.cellSize;
      const cx = (gx: number) => gx * cs + cs / 2;
      const cy = (gy: number) => gy * cs + cs / 2;

      for (const s of trace.segments) {
        ctx.beginPath();
        ctx.moveTo(cx(s.x0), cy(s.y0));
        ctx.lineTo(cx(s.x1), cy(s.y1));
        ctx.stroke();
      }

      ctx.restore();
    }
  }, [level, selectedId, pxSize, trace]);

  // click
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleClick = (e: MouseEvent) => {
      const { x, y } = getCellFromMouse(canvas, e, level.grid.cellSize);
      const hit = level.objects.find((o) => o.x === x && o.y === y);
      onClick?.({ x, y, hitId: hit?.id });
    };

    canvas.addEventListener("click", handleClick);
    return () => canvas.removeEventListener("click", handleClick);
  }, [level, onClick]);

  // drag
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let draggingId: string | undefined;
    let lastX = -1;
    let lastY = -1;
    let downPxX = 0, downPxY = 0;
    let draggingArmed = false;

    const onMouseDown = (e: MouseEvent) => {
      const { x, y } = getCellFromMouse(canvas, e, level.grid.cellSize);
      const hit = level.objects.find((o) => o.x === x && o.y === y);
      if (!hit) return;
      draggingId = hit.id;
      lastX = x;
      lastY = y;
      downPxX = e.clientX;
      downPxY = e.clientY;
      draggingArmed = true;
      onDrag?.({ id: hit.id, x, y, phase: "start" });
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!draggingId) return;

      if (draggingArmed) {
        const dx = Math.abs(e.clientX - downPxX);
        const dy = Math.abs(e.clientY - downPxY);
        if (dx + dy < 4) return; // threshold
        draggingArmed = false;
      }

      const { x, y } = getCellFromMouse(canvas, e, level.grid.cellSize);
      if (x === lastX && y === lastY) return;
      lastX = x;
      lastY = y;

      onDrag?.({ id: draggingId, x, y, phase: "move" });
    };

    const onMouseUp = (e: MouseEvent) => {
      if (!draggingId) return;
      const id = draggingId;
      draggingId = undefined;
      draggingArmed = false;

      const { x, y } = getCellFromMouse(canvas, e, level.grid.cellSize);
      onDrag?.({ id, x, y, phase: "end" });
    };

    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [level, onDrag]);

  return (
    <div className="overflow-auto rounded-md border">
      <canvas ref={canvasRef} width={pxSize.w} height={pxSize.h} className="block" />
    </div>
  );
}
