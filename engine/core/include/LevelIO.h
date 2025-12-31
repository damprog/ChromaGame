#pragma once
#include <string>
#include "Level.h"

bool LoadLevelFromJsonFile(const std::string& path, Level& outLevel, std::string& outError);
