REM === Najpewniej C++ odpal w “x64 Native Tools Command Prompt for VS 2022”, żeby cmake było w PATH. ===
REM === Jeśli manualnie sie wykonuje to trzeba opjedynczo komendy wklejać ===
REM === KROK 1: Build WASM + kopiowanie do web/public/wasm ===

cd /d D:\GitHub\damprog\ChromaGame

call D:\Lokalnie\emsdk\emsdk_env.bat

if not exist engine\out\wasm\CMakeCache.txt (
  call emcmake cmake -S engine/wasm -B engine/out/wasm -DCMAKE_BUILD_TYPE=Release
)
cmake --build engine/out/wasm --target engine_wasm --parallel

mkdir web\public\wasm 2>nul
copy /y engine\out\wasm\engine_wasm.js   web\public\wasm\
copy /y engine\out\wasm\engine_wasm.wasm web\public\wasm\
