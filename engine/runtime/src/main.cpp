#include <iostream>
#include <string>

#include "LevelIO.h"
#include "LevelValidate.h"
#include "PathUtils.h"

int main() {
  Level level;
  std::string err;

  const std::string root = FindRepoRootOrEmpty();
  if (root.empty()) {
    std::cout << "Cannot find repo root (folder 'shared' not found above current working dir)\n";
    return 1;
  }

  const std::string path = JoinPath(root, "shared/levels/level01.json");

  if (!LoadLevelFromJsonFile(path, level, err)) {
    std::cout << "Load failed: " << err << "\n";
    return 1;
  }

  if (!ValidateLevel(level, err)) {
    std::cout << "Validate failed: " << err << "\n";
    return 1;
  }

  std::cout << "Loaded+validated level:\n";
  std::cout << "  name: " << level.name << "\n";
  std::cout << "  grid: " << level.w << "x" << level.h << " cellSize=" << level.cellSize << "\n";
  std::cout << "  objects: " << level.objects.size() << "\n";

  for (const auto& o : level.objects) {
    std::cout << "    [" << o.id << "] " << o.type << " (" << o.x << "," << o.y << ")";
    if (!o.dir.empty()) std::cout << " dir=" << o.dir;
    if (!o.color.empty()) std::cout << " color=" << o.color;
    if (o.angle != 0) std::cout << " angle=" << o.angle;
    std::cout << "\n";
  }

  return 0;
}
