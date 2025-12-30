add_executable(game_runtime
  src/main.cpp
)

target_link_libraries(game_runtime PRIVATE engine_core)
