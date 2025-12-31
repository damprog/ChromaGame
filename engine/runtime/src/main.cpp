#include <iostream>
#include <string>

#include "LevelIO.h"

int main() {
  Level level;
  std::string err;

  // ścieżka względna od katalogu roboczego procesu
  // na start odpalimy z working directory = engine/runtime (ustawimy niżej)
  const std::string path = "../../../../../shared/levels/level01.json";

  if (!LoadLevelFromJsonFile(path, level, err)) {
    std::cout << "Load failed: " << err << "\n";
    return 1;
  }

  std::cout << "Loaded level:\n";
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
