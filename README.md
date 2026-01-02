# ChromaGame

## Quick start

### WEB 

cd /d D:\GitHub\damprog\ChromaGame
pnpm install
pnpm web:dev

lub w web\:
pnpm dev

tylko localhost:
pnpm dev -- --hostname 127.0.0.1

### WASM — pełna przebudowa (CMake + Emscripten)

Najpewniej odpal w “x64 Native Tools Command Prompt for VS 2022”, żeby cmake było w PATH.

#### Aktywacja emsdk + szybki test

call D:\Lokalnie\emsdk\emsdk_env.bat
cmake --version
emcc -v

#### Czysty rebuild (kasuje cache i buduje od nowa)

cd /d D:\GitHub\damprog\ChromaGame
rmdir /s /q engine\out\wasm

call D:\Lokalnie\emsdk\emsdk_env.bat
emcmake cmake -S engine/wasm -B engine/out/wasm -DCMAKE_BUILD_TYPE=Release
cmake --build engine/out/wasm --target engine_wasm -j

--verbose aby upewnić ze właściwy target i zobaczyć linkowanie
cmake --build engine/out/wasm --target engine_wasm -j --verbose 

Gdzie są artefakty (szybkie sprawdzenie)
dir /b engine\out\wasm
dir /b engine\out\wasm\*.js
dir /b engine\out\wasm\*.wasm

Skopiowanie WASM do Next (żeby działało “Run Trace (WASM)”)

---------------------

Docelowe miejsce to web/public/wasm/engine_wasm.js i .wasm.

cd /d D:\GitHub\damprog\ChromaGame
mkdir web\public\wasm 2>nul

copy /y engine\out\wasm\engine_wasm.js   web\public\wasm\
copy /y engine\out\wasm\engine_wasm.wasm web\public\wasm\


Jeśli po rebuildzie w przeglądarce wygląda jakby brało stary WASM: Ctrl+F5 (cache).



## 10. Struktura plików kluczowych

```
ChromaGame/
├── engine/
│   ├── core/              # C++ core engine
│   │   ├── include/       # Level.h, RayTrace.h, etc.
│   │   └── src/           # Implementacje
│   ├── wasm/              # WASM bindings
│   │   ├── CMakeLists.txt
│   │   └── WasmBindings.cpp
│   ├── runtime/           # C++ runtime (exe)
│   └── out/
│       ├── build/         # Native build
│       └── wasm/          # WASM build output
├── web/
│   ├── app/
│   │   ├── editor/        # Edytor strony
│   │   └── api/           # API routes
│   ├── components/
│   │   └── editor/        # GridCanvas, Toolbox, etc.
│   ├── lib/
│   │   └── engineWasm.ts  # WASM loader
│   ├── public/
│   │   └── wasm/         # engine_wasm.js, engine_wasm.wasm
│   └── next.config.ts    # Webpack config dla WASM
└── shared/
    ├── levels/            # Poziomy JSON
    └── out/               # trace.json (legacy)
```

## 11. Najbliższe zadania / TODO

- [ ] Automatyzacja build WASM + copy do public (skrypt/skrypt build)
- [ ] Wersjonowanie plików WASM (cache busting)
- [ ] Dokumentacja API endpoints
- [ ] Testy jednostkowe dla core C++
- [ ] CI/CD pipeline dla WASM build

---