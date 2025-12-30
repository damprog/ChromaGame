add_library(engine_core STATIC
  src/core_dummy.cpp
)

target_include_directories(engine_core PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)
