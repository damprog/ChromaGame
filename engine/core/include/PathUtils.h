#pragma once
#include <string>

// próbuje znaleźć katalog repo (tam gdzie jest folder "shared")
// startując od katalogu roboczego i idąc w górę
std::string FindRepoRootOrEmpty();
std::string JoinPath(const std::string& a, const std::string& b);
