#include <iostream>
#include <string>
#include <fstream>
#include <nlohmann/json.hpp>
#include <filesystem>

#include "LevelIO.h"
#include "LevelValidate.h"
#include "PathUtils.h"
#include "RayTrace.h"

int main(int argc, char** argv) {
  Level level;
  std::string err;

  // Find map/data
  const std::string root = FindRepoRootOrEmpty();
  if (root.empty()) {
    std::cout << "Cannot find repo root (folder 'shared' not found above current working dir)\n";
    return 1;
  }

  std::string levelPath;

  // argv[1] = ścieżka do pliku level .json
  if (argc >= 2 && argv[1] && std::string(argv[1]).size() > 0) {
    levelPath = std::string(argv[1]);
  }
  else {
    levelPath = JoinPath(root, "shared/levels/level01.json"); // fallback
  }

  const std::string path = levelPath;

  // Load map and objects
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

  // Trace laser
  const auto tr = TraceFirstLaser(level);

  std::cout << "Trace segments: " << tr.segments.size() << "\n";
  for (size_t i = 0; i < tr.segments.size(); ++i) {
    const auto& s = tr.segments[i];
    std::cout << "  [" << i << "] (" << s.x0 << "," << s.y0 << ") -> (" << s.x1 << "," << s.y1 << ")\n";
  }

  if (tr.hitWall) std::cout << "Hit wall.\n";
  if (tr.hitTarget) std::cout << "Hit target: " << tr.hitTargetId << "\n";

  // Export JSON
  const std::string outDir = JoinPath(root, "shared/out");
  const std::string outPath = JoinPath(root, "shared/out/trace.json");

  // utwórz folder jeśli nie istnieje
  std::filesystem::create_directories(outDir);

  const auto j = TraceResultToJson(tr);
  std::ofstream o(outPath, std::ios::binary);
  o << j.dump(2);

  std::cout << "Wrote trace: " << outPath << "\n";


  return 0;
}
