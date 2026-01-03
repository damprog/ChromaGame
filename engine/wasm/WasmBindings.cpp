#include <cstdlib>
#include <cstring>
#include <string>

#include <nlohmann/json.hpp>

#include "../core/include/Level.h"
#include "../core/include/RayTrace.h"   // TraceFirstLaser / TraceResult (dopasuj include jeśli inny)

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT
#endif

using json = nlohmann::json;

static char* DupCString(const std::string& s) {
  char* out = (char*)std::malloc(s.size() + 1);
  if (!out) return nullptr;
  std::memcpy(out, s.c_str(), s.size() + 1);
  return out;
}

static bool LoadLevelFromJsonText(const std::string& text, Level& outLevel, std::string& outError) {
  outError.clear();

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

extern "C" {

  // Zwraca JSON trace jako string w pamięci WASM (malloc). JS musi wywołać freeString(ptr).
  EXPORT char* traceLevel(const char* levelJson) {
    printf("[wasm] traceLevel called\n"); fflush(stdout);

    if (!levelJson) {
      return DupCString("{\"ok\":false,\"error\":\"null input\"}");
    }

    Level level;
    std::string err;
    if (!LoadLevelFromJsonText(levelJson, level, err)) {
      json j;
      j["ok"] = false;
      j["error"] = err;
      return DupCString(j.dump());
    }

    try {
      auto tr = TraceFirstLaser(level); // <- dopasuj jeśli nazwa/namespace inna

      json j;
      j["ok"] = true;
      j["hitWall"] = tr.hitWall;
      j["hitTarget"] = tr.hitTarget;
      j["hitTargetId"] = tr.hitTargetId;

      j["segments"] = json::array();
      for (const auto& s : tr.segments) {
        j["segments"].push_back({
          {"x0", s.x0},
          {"y0", s.y0},
          {"x1", s.x1},
          {"y1", s.y1},
          });
      }

      return DupCString(j.dump());
    }
    catch (const std::exception& e) {
      json j;
      j["ok"] = false;
      j["error"] = std::string("Trace error: ") + e.what();
      return DupCString(j.dump());
    }
    catch (...) {
      return DupCString("{\"ok\":false,\"error\":\"Trace error: unknown\"}");
    }
  }

  EXPORT void freeString(void* p) {
    if (p) std::free(p);
  }

} // extern "C"
