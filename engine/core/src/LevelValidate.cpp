#include "LevelValidate.h"
#include <unordered_set>

static std::string Key(int x, int y) {
  return std::to_string(x) + "," + std::to_string(y);
}

bool ValidateLevel(const Level& level, std::string& outError) {
  outError.clear();

  if (level.w <= 0 || level.h <= 0) {
    outError = "Grid size must be > 0";
    return false;
  }

  std::unordered_set<std::string> used;

  for (const auto& o : level.objects) {
    if (o.id.empty()) {
      outError = "Object with empty id";
      return false;
    }
    if (o.type.empty()) {
      outError = "Object " + o.id + " has empty type";
      return false;
    }
    if (o.x < 0 || o.x >= level.w || o.y < 0 || o.y >= level.h) {
      outError = "Object " + o.id + " out of bounds: (" + std::to_string(o.x) + "," + std::to_string(o.y) + ")";
      return false;
    }
    const auto k = Key(o.x, o.y);
    if (used.find(k) != used.end()) {
      outError = "Two objects share the same cell: (" + k + ")";
      return false;
    }
    used.insert(k);
  }

  return true;
}
