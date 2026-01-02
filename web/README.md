# ChromaGame — Kontekst projektu

## 1. Cel produktu (zlecenie / założenia)

Gra 2D z edytorem poziomów w C++, inspirowana Chromatronem: lasery, lusterka/odbicia, rozbudowana wersja z edytorem.

**Założenia realizacyjne:**
- Edytor wygodny i szybki w webie (Next.js + React)
- Logika/silnik w C++ (pełna kontrola, bez "black box")
- Frontend i web tools: Next.js + React, umożliwiające stworzenie wygodnego i szybkiego edytora poziomów (używalny w przeglądarce lub jako panel deweloperski)
- Silnik gry w C++ zapewniający wydajność, stabilność i pełną kontrolę nad logiką gry
- Korzyści: pełna kontrola nad mechaniką (lasery, odbicia, logika, kolizje), brak ograniczeń "black box" silników, szybki nowoczesny edytor oparty na React z UX porównywalnym do komercyjnych narzędzi

## 2. Architektura

**Monorepo (pnpm workspace):**

- **`web/`** — Next.js 16.1.1 + React 19.2.3 (shadcn/ui): webowy edytor poziomów pod `/editor`
- **`engine/`** — C++ core: wczytanie/walidacja levela + ray/laser trace (kolizje z wall/mirror/target) oraz generowanie wyniku trace
- **`shared/`** — dane poziomów (JSON) i schematy

**Przepływ danych:**
- Level (JSON) → Trace (JSON segmentów) → Overlay w edytorze
- WASM: Level JSON → `traceLevel()` → Trace JSON → Overlay
- C++ API (legacy): Level JSON → `/api/trace/run` → `shared/out/trace.json` → `/api/trace` → Overlay

## 3. Edytor (web) — funkcje i stan

Edytor jest gotowy i spełnia wymagania.

**Funkcje:**
- Edycja levela w JSON + UI narzędzi (laser/mirror/wall/target)
- Manipulacja obiektami na siatce (dodawanie, usuwanie, przesuwanie, zaznaczanie)
- Canvas renderujący siatkę i obiekty (`GridCanvas.tsx`)
- Overlay trace: po wczytaniu trace rysowane są czerwone segmenty na canvasie
- Auto-build: automatyczne zapisywanie i trace przy zmianach
- Benchmark: porównanie wydajności WASM vs C++ API (1000 iteracji)

**Ważne bugfixy:**
- W `GridCanvas.tsx` trzeba było dodać `trace` do deps efektu renderującego, żeby linie się odświeżały

## 4. Schemat poziomów (Level JSON)

**Struktura:**
```json
{
  "version": 1,
  "meta": {
    "name": "Level 01",
    "author": "you"
  },
  "grid": {
    "w": 20,
    "h": 12,
    "cellSize": 32
  },
  "objects": [
    {
      "id": "L1",
      "type": "laser",
      "x": 4,
      "y": 1,
      "dir": "N" | "E" | "S" | "W",
      "color": "R" | "G" | "B"  // opcjonalne
    },
    {
      "id": "M1",
      "type": "mirror",
      "x": 6,
      "y": 1,
      "angle": 45 | 90 | 135 | 180
    },
    {
      "id": "W1",
      "type": "wall",
      "x": 10,
      "y": 5
    },
    {
      "id": "T1",
      "type": "target",
      "x": 8,
      "y": 3,
      "accept": ["R", "G", "B"]  // opcjonalne
    }
  ]
}
```

**Lokalizacja poziomów:**
- `shared/levels/*.json` — zapisane poziomy
- `shared/levels/__web_temp_level.json` — tymczasowy poziom dla C++ API trace

## 5. Trace: dwa tryby

### 5.1. WASM (obecny, zalecany)

**Przepływ:**
1. Budujesz `engine_wasm.js` + `engine_wasm.wasm` (Emscripten)
2. Kopiujesz do `web/public/wasm/`
3. W `/editor` klikasz "Run Trace (WASM)" → przeglądarka ładuje loader `.js`, dociąga `.wasm`, wywołuje eksport C++ (`traceLevel`) i dostajesz trace do overlay — bez odpalania exe i bez `/api/trace/run`

**Funkcje eksportowane:**
- `traceLevel(levelJson: string): string` — zwraca JSON trace
- `freeString(ptr: number): void` — zwalnia pamięć

**Implementacja:**
- `web/lib/engineWasm.ts` — loader WASM przez script tag (omija bundling Next.js)
- `engine/wasm/WasmBindings.cpp` — bindings C++ → WASM

### 5.2. C++ API (legacy, nadal istnieje)

**Przepływ:**
1. `engine` generuje `shared/out/trace.json` przez `game_runtime.exe`
2. `web/app/api/trace/route.ts` czyta ten plik (szuka w górę od `process.cwd()`)
3. W web był przycisk "Run Trace (C++)" który fetchował `/api/trace` i przekazywał wynik do `GridCanvas`

**API endpoints:**
- `POST /api/trace/run` — uruchamia `game_runtime.exe` z poziomem JSON, zapisuje do `shared/levels/__web_temp_level.json`
- `GET /api/trace` — zwraca `shared/out/trace.json`

## 6. Build WASM — kluczowe ustalenia (Windows)

### 6.1. Wymagania

- **Emscripten SDK** (emsdk) — zainstalowany lokalnie
- **CMake** — w PATH lub przez "x64 Native Tools Command Prompt for VS 2022"
- **Visual Studio 2022** (opcjonalnie, dla CMake)

### 6.2. Konfiguracja Emscripten

```bash
# Uruchom emsdk_env.bat (nie jest w repo)
# Z folderu emsdk lub call pełną ścieżką
call D:\Lokalnie\emsdk\emsdk_env.bat
```

### 6.3. Build WASM

```bash
cd engine/out/wasm

# Konfiguracja CMake z toolchain Emscripten
cmake ../.. -DCMAKE_TOOLCHAIN_FILE=D:\Lokalnie\emsdk\upstream\emscripten\cmake\Modules\Platform\Emscripten.cmake

# Build
cmake --build . --target engine_wasm -j

# Kopiuj do public (ręcznie - brak automatyzacji)
copy engine_wasm.js ..\..\..\web\public\wasm\
copy engine_wasm.wasm ..\..\..\web\public\wasm\
```

**Uwagi:**
- `WasmBindings.cpp` eksportuje funkcje (`traceLevel`, `freeString`) i parsuje JSON z tekstu (bez file I/O)
- Do linkowania dobierasz minimalny zestaw `.cpp` z core (bez `fstream/LevelIO.cpp`)
- `nlohmann/json.hpp` musi być w include path dla Emscripten (FetchContent w `CMakeLists.txt`)
- Emscripten flags: `MODULARIZE=1`, `EXPORT_ES6=1`, `ENVIRONMENT=web`, `ALLOW_MEMORY_GROWTH=1`

### 6.4. Output

- `engine/out/wasm/engine_wasm.js` — loader Emscripten
- `engine/out/wasm/engine_wasm.wasm` — binarny moduł WASM
- Kopiuj do: `web/public/wasm/`

## 7. Uruchomienie projektu

### 7.1. Web (Next.js)

**Z root monorepo:**
```bash
pnpm web:dev    # dev server
pnpm web:build  # production build
pnpm web:start  # production server
```

**Z folderu web:**
```bash
cd web
pnpm dev        # next dev --webpack
pnpm build
pnpm start
```

**Wersje:**
- Node.js: 20+ (sprawdź `@types/node: ^20`)
- pnpm: workspace (root + web)
- Next.js: 16.1.1
- React: 19.2.3

**Dostęp:**
- Edytor: http://localhost:3000/editor

### 7.2. Test WASM

1. Uruchom dev server: `pnpm web:dev`
2. Otwórz http://localhost:3000/editor
3. Kliknij "Run Trace (WASM)"
4. Overlay powinien się narysować bez exe

### 7.3. Benchmark

W edytorze dostępny przycisk "Benchmark (1000x)" który:
- Wykonuje 1000 iteracji trace przez WASM
- Wykonuje 1000 iteracji trace przez C++ API
- Wyświetla porównanie czasów (total, avg, speedup)

## 8. API Routes (Next.js)

### 8.1. Poziomy

- `GET /api/levels` — lista poziomów
- `GET /api/levels/[name]` — pobierz poziom
- `POST /api/levels/[name]` — zapisz poziom

### 8.2. Trace (legacy)

- `GET /api/trace` — zwraca `shared/out/trace.json`
- `POST /api/trace/run` — uruchamia `game_runtime.exe` z poziomem JSON

## 9. Troubleshooting

### 9.1. Cache przeglądarki (WASM)

**Problem:** Nie widać zmian po przebudowie WASM

**Rozwiązanie:**
- Hard refresh (Ctrl+Shift+R / Cmd+Shift+R)
- Wersjonowanie nazw plików (np. `engine_wasm.v2.js`)
- Wyczyść cache przeglądarki

### 9.2. Next.js bundling WASM

**Problem:** `Module not found: Can't resolve '.'` przy bundlowaniu `engine_wasm.js`

**Rozwiązanie:**
- `next.config.ts` używa `webpack.IgnorePlugin` aby ignorować `engine_wasm.js`
- WASM ładuje się przez script tag (nie dynamiczny import)
- Użyj `--webpack` flag w dev (Next.js 16 domyślnie używa Turbopack)

### 9.3. Trace nie odświeża się w canvas

**Problem:** Linie trace nie aktualizują się po zmianie

**Rozwiązanie:**
- W `GridCanvas.tsx` dodaj `trace` do dependency array `useEffect` renderującego overlay

### 9.4. Emscripten nie widzi CMake

**Problem:** `emcmake` nie znajduje CMake

**Rozwiązanie:**
- Uruchom w "x64 Native Tools Command Prompt for VS 2022" (ma CMake w PATH)
- Lub dodaj CMake do PATH systemowego

### 9.5. nlohmann/json nie znaleziony (WASM build)

**Problem:** `fatal error: 'nlohmann/json.hpp' file not found`

**Rozwiązanie:**
- Sprawdź czy `engine/wasm/CMakeLists.txt` ma `FetchContent` dla `nlohmann_json`
- Sprawdź czy `target_link_libraries` zawiera `nlohmann_json::nlohmann_json`

### 9.6. Next.js Turbopack vs Webpack

**Problem:** `ERROR: This build is using Turbopack, with a webpack config`

**Rozwiązanie:**
- Dodaj `turbopack: {}` do `next.config.ts`
- Użyj `--webpack` flag w dev script: `"dev": "next dev --webpack"`


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

**Ostatnia aktualizacja:** 02.01.2026 (wersja projektu z WASM + benchmark)
