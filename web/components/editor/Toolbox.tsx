"use client";

import { Button } from "@/components/ui/button";

export type Tool = "select" | "erase" | "laser" | "mirror" | "wall" | "target";

export function Toolbox({
  tool,
  setTool,
}: {
  tool: Tool;
  setTool: (t: Tool) => void;
}) {
  const btn = (t: Tool, label: string) => (
    <Button
      key={t}
      variant={tool === t ? "default" : "secondary"}
      onClick={() => setTool(t)}
    >
      {label}
    </Button>
  );

  return (
    <div className="grid grid-cols-2 gap-2 pt-2">
      {btn("select", "Select")}
      {btn("erase", "Erase")}
      {btn("laser", "Laser")}
      {btn("mirror", "Mirror")}
      {btn("wall", "Wall")}
      {btn("target", "Target")}
    </div>
  );
}
