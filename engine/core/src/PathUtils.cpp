#include "PathUtils.h"
#include <filesystem>

namespace fs = std::filesystem;

std::string JoinPath(const std::string& a, const std::string& b) {
  return (fs::path(a) / fs::path(b)).string();
}

std::string FindRepoRootOrEmpty() {
  fs::path p = fs::current_path();

  // idziemy max 10 poziomów w górę
  for (int i = 0; i < 10; ++i) {
    fs::path candidate = p / "shared";
    if (fs::exists(candidate) && fs::is_directory(candidate)) {
      return p.string();
    }
    if (!p.has_parent_path()) break;
    p = p.parent_path();
  }
  return {};
}
