add_library(engine_core STATIC
  src/core_dummy.cpp
  src/LevelIO.cpp
  src/PathUtils.cpp
  src/LevelValidate.cpp
)

target_include_directories(engine_core PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(engine_core PUBLIC nlohmann_json::nlohmann_json)
