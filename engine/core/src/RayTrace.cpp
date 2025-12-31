#include "RayTrace.h"
#include <unordered_map>
#include <nlohmann/json.hpp>

static Dir ParseDir(const std::string& s) {
  if (s == "N") return Dir::N;
  if (s == "E") return Dir::E;
  if (s == "S") return Dir::S;
  return Dir::W;
}

static void Step(Dir d, int& x, int& y) {
  switch (d) {
  case Dir::N: y -= 1; break;
  case Dir::E: x += 1; break;
  case Dir::S: y += 1; break;
  case Dir::W: x -= 1; break;
  }
}

// Mirror rules (MVP):
// angle 45: behaves like "\" mirror (swap N<->W, S<->E)
// angle 135: behaves like "/" mirror (swap N<->E, S<->W)
// angle 90/180: treat as pass-through for now (or you can map later)
static Dir Reflect(Dir in, int angle) {
  if (angle == 45) { // "\"
    if (in == Dir::N) return Dir::W;
    if (in == Dir::W) return Dir::N;
    if (in == Dir::S) return Dir::E;
    if (in == Dir::E) return Dir::S;
  }
  if (angle == 135) { // "/"
    if (in == Dir::N) return Dir::E;
    if (in == Dir::E) return Dir::N;
    if (in == Dir::S) return Dir::W;
    if (in == Dir::W) return Dir::S;
  }
  // MVP: other angles not handled yet
  return in;
}

struct CellObj {
  const LevelObject* obj = nullptr;
};

static std::string Key(int x, int y) {
  return std::to_string(x) + "," + std::to_string(y);
}

TraceResult TraceFirstLaser(const Level& level) {
  TraceResult res;

  // find first laser
  const LevelObject* laser = nullptr;
  for (const auto& o : level.objects) {
    if (o.type == "laser") { laser = &o; break; }
  }
  if (!laser) return res;

  // build occupancy map (1 object per cell — editor already enforces)
  std::unordered_map<std::string, const LevelObject*> map;
  map.reserve(level.objects.size() * 2);
  for (const auto& o : level.objects) {
    map[Key(o.x, o.y)] = &o;
  }

  Dir dir = ParseDir(laser->dir);

  // start from laser cell, beam goes outward
  int x = laser->x;
  int y = laser->y;

  // segment start
  int sx = x;
  int sy = y;

  const int maxSteps = level.w * level.h * 4; // safety
  for (int step = 0; step < maxSteps; ++step) {
    int nx = x, ny = y;
    Step(dir, nx, ny);

    // leaving grid -> end segment at edge cell (current x,y)
    if (nx < 0 || nx >= level.w || ny < 0 || ny >= level.h) {
      res.segments.push_back({ sx, sy, x, y });
      return res;
    }

    // move into next cell
    x = nx; y = ny;

    auto it = map.find(Key(x, y));
    if (it == map.end()) {
      // empty -> continue
      continue;
    }

    const LevelObject* hit = it->second;

    if (hit->type == "wall") {
      res.segments.push_back({ sx, sy, x, y });
      res.hitWall = true;
      return res;
    }

    if (hit->type == "target") {
      res.segments.push_back({ sx, sy, x, y });
      res.hitTarget = true;
      res.hitTargetId = hit->id;
      return res;
    }

    if (hit->type == "mirror") {
      // end current segment at mirror cell
      res.segments.push_back({ sx, sy, x, y });

      // reflect
      const Dir ndir = Reflect(dir, hit->angle);

      // start new segment from mirror cell
      dir = ndir;
      sx = x;
      sy = y;
      continue;
    }

    // other types -> ignore for now (pass-through)
  }

  // safety end
  res.segments.push_back({ sx, sy, x, y });
  return res;
}

nlohmann::json TraceResultToJson(const TraceResult& tr) {
  using nlohmann::json;
  json j;

  j["hitWall"] = tr.hitWall;
  j["hitTarget"] = tr.hitTarget;
  j["hitTargetId"] = tr.hitTargetId;

  j["segments"] = json::array();
  for (const auto& s : tr.segments) {
    j["segments"].push_back({
      {"x0", s.x0}, {"y0", s.y0},
      {"x1", s.x1}, {"y1", s.y1},
      });
  }

  return j;
}
