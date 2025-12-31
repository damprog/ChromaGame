export type TraceSegment = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type TraceJson = {
  segments: TraceSegment[];
  hitWall?: boolean;
  hitTarget?: boolean;
  hitTargetId?: string;
};
