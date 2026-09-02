# SNAPSHOT MANIFEST: ATLAS_EXACT_ENTITY_WORK_AUTOREPAIR_V1

- **Fecha:** 2026-09-02
- **Identificador de Tag:** `ATLAS_EXACT_ENTITY_WORK_AUTOREPAIR_V1`
- **Estado de Ingeniería:** STABLE / PROTECTED ✅
- **Build Status:** `npm run build` = PASS ✅ | `npx tsc --noEmit` = PASS ✅ | `npx vite build` = PASS ✅
- **Invariantes Activas:**
  - `Search.list = 0` 🔒
  - `Radar = 0 u` 🔒
  - `isFixture = false` 🔒 (100% procedencia física)

---

## 1. Alcance y Arquitectura Protegida

Este snapshot congela el estado completo y estable de la infraestructura de búsqueda semántica, ontología de obras, gates de fidelidad, memoria de cobertura y autorreparación autónoma de YouApp:

### A. ExactWorkSearchGate & ExactEntityWorkGate
- Ontología pura en `canonicalWorksCatalog.ts`: mapea identificadores de obra, títulos canónicos, aliases y términos de búsqueda hacia el índice físico. No fabrica ni devuelve fixtures inventados.
- Gates de fidelidad simultánea: `WorkFidelity >= 75` y `ArtistFidelity >= 85` con reconocimiento de entidades compuestas (e.g. *Calle 13*).
- Tipificación de roles de contenido (`ContentRole`): `PRIMARY_WORK`, `OFFICIAL_VIDEO`, `LIVE_PERFORMANCE`, `REMASTER`, `LYRIC` vs `COVER`.
- Rechazo sistemático de homónimos, canciones ajenas del mismo artista y covers sin participación del autor original.

### B. Separación Ontológica de Memoria de Cobertura
- `ExactWorkCoverageMemory`: Registra la cobertura global de interpretaciones de una obra.
- `ExactEntityWorkCoverageMemory`: Registra la cobertura estricta del binomio Entidad Canónica + Obra (*Artist + Work*), impidiendo que versiones de terceros inflen la cobertura del autor original.

### C. Persistencia Bronze Atlas & Procedencia Física
- Guardado determinista en `youapp_index` con `sourceContainsProviderId` validado.
- Separación de activos: `Asset` / `Recording` / `Rendition`.
- Verificación estricta de reproducibilidad (`isPlayable = true`).
- Coexistencia multi-proveedor física: YouTube, Dailymotion, Internet Archive.

### D. Autonomous Discovery Gap Worker & Idempotencia
- Detección reactiva y proactiva de déficit de catálogo mediante `ExactEntityWorkHealth`.
- Ejecución autónoma con contabilidad de 10 columnas (`discoveredRaw`, `validatedExactEntityWork`, `newPhysicalAssetsInserted`, `existingAssetsReclassified`, `duplicateSkipped`, `totalExactEntityWorkAfter`, `totalPlayableAfter`, `uniqueAssetsAfter`, `uniqueRecordingsAfter`, `uniqueRenditionTypesAfter`, `gapClosureEfficiency`).
- Alerta preventiva `HARVEST_WITHOUT_COVERAGE_LIFT`.
- **Idempotencia Comprobada:** En re-ejecución sobre las mismas obras (RUN #2), nuevos insertos duplicados = 0, dedupe = 100%.

---

## 2. Resultados de las Pruebas de Regresión Golden

### A. Golden Regression Test: `"calle 13 la perla"`
- **Resultados Top 10:** 10 / 10 Calle 13 + La Perla (100% de precisión).
- **WrongArtist:** 0.
- **WrongWork:** 0.
- **Playable@10:** 10 / 10 reproducibles.
- **Serving Path:** `FAST` (0ms externo).
- **Search.list:** 0 llamadas.
- **Radar:** 0 unidades de cuota consumidas.

### B. Idempotencia en Obras Críticas (RUN #2)
| Obra | Artista | Duplicados Saltados | Nuevos Insertos | EEW After | Cobertura Final | Idempotente |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| *Paint It, Black* | The Rolling Stones | 0 | 0 | 4 / 4 | 40% | SÍ (0 duplicados) ✅ |
| *Crimen* | Gustavo Cerati | 0 | 0 | 4 / 4 | 40% | SÍ (0 duplicados) ✅ |
| *Demoliendo Hoteles* | Charly García | 0 | 0 | 3 / 3 | 30% | SÍ (0 duplicados) ✅ |
| *Seguir Viviendo Sin Tu Amor* | Luis Alberto Spinetta | 0 | 0 | 6 / 8 | 60% | SÍ (0 duplicados) ✅ |

---

## 3. Guía de Restauración / Rollback

En caso de requerir volver a este punto exacto en el futuro:

```bash
# 1. Verificar el tag en el historial
git tag -v ATLAS_EXACT_ENTITY_WORK_AUTOREPAIR_V1

# 2. Checkout seguro en un nuevo branch de trabajo
git checkout -b rollback-atlas-autorepair ATLAS_EXACT_ENTITY_WORK_AUTOREPAIR_V1

# 3. Validar build
npm run build
```
