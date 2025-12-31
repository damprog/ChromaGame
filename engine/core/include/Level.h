#pragma once
#include <string>
#include <vector>

struct LevelObject {
  std::string id;
  std::string type;
  int x = 0;
  int y = 0;

  // optional fields
  std::string dir;   // for laser
  std::string color; // for laser
  int angle = 0;     // for mirror
};

struct Level {
  int version = 1;
  std::string name;
  std::string author;

  int w = 0;
  int h = 0;
  int cellSize = 0;

  std::vector<LevelObject> objects;
};
