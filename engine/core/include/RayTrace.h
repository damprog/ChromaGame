#pragma once
#include <vector>
#include <string>
#include "Level.h"
#include <nlohmann/json_fwd.hpp>

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

// zapis wyniku trace do json (nlohmann::json)
nlohmann::json TraceResultToJson(const TraceResult& tr);
