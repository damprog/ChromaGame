cmake_minimum_required(VERSION 3.22)
project(engine_wasm CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(engine_wasm
  WasmBindings.cpp

  # core sources (bez LevelIO.cpp - bo pliki / fstream)
  ../core/src/RayTrace.cpp
  ../core/src/LevelValidate.cpp
  ../core/src/PathUtils.cpp
)

target_include_directories(engine_wasm PRIVATE
  ../core/include
)

target_link_options(engine_wasm PRIVATE
  "-sMODULARIZE=1"
  "-sEXPORT_ES6=1"
  "-sENVIRONMENT=web"
  "-sALLOW_MEMORY_GROWTH=1"
  "-sEXPORTED_FUNCTIONS=[_traceLevel,_freeString]"
  "-sEXPORTED_RUNTIME_METHODS=[ccall,UTF8ToString]"
)

set_target_properties(engine_wasm PROPERTIES OUTPUT_NAME "engine_wasm")
