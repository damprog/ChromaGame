#pragma once
#include <vector>
#include <string>
#include "Level.h"

enum class Dir { N, E, S, W };

struct RaySegment {
  int x0 = 0, y0 = 0;
  int x1 = 0, y1 = 0;
};

struct TraceResult {
  std::vector<RaySegment> segments;
  bool hitWall = false;
  bool hitTarget = false;
  std::string hitTargetId;
};

TraceResult TraceFirstLaser(const Level& level);
