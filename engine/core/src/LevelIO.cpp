#include "LevelIO.h"

#include <fstream>
#include <sstream>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

static std::string ReadAllText(const std::string& path, std::string& err) {
  std::ifstream f(path, std::ios::binary);
  if (!f) {
    err = "Cannot open file: " + path;
    return {};
  }
  std::ostringstream ss;
  ss << f.rdbuf();
  return ss.str();
}

bool LoadLevelFromJsonFile(const std::string& path, Level& outLevel, std::string& outError) {
  outError.clear();

  std::string readErr;
  const std::string text = ReadAllText(path, readErr);
  if (!readErr.empty()) {
    outError = readErr;
    return false;
  }

  json j;
  try {
    j = json::parse(text);
  }
  catch (const std::exception& e) {
    outError = std::string("JSON parse error: ") + e.what();
    return false;
  }

  try {
    outLevel.version = j.at("version").get<int>();

    const auto& meta = j.at("meta");
    outLevel.name = meta.value("name", "");
    outLevel.author = meta.value("author", "");

    const auto& grid = j.at("grid");
    outLevel.w = grid.at("w").get<int>();
    outLevel.h = grid.at("h").get<int>();
    outLevel.cellSize = grid.at("cellSize").get<int>();

    outLevel.objects.clear();
    for (const auto& o : j.at("objects")) {
      LevelObject obj;
      obj.id = o.value("id", "");
      obj.type = o.value("type", "");
      obj.x = o.value("x", 0);
      obj.y = o.value("y", 0);

      // optional
      obj.dir = o.value("dir", "");
      obj.color = o.value("color", "");
      obj.angle = o.value("angle", 0);

      outLevel.objects.push_back(std::move(obj));
    }
  }
  catch (const std::exception& e) {
    outError = std::string("JSON schema error: ") + e.what();
    return false;
  }

  return true;
}
