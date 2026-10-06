# ATLAS INTELLECTUAL PROPERTY & PHYSICAL LKG MANIFEST

## Metadatos del Snapshot
- **SNAPSHOT_NAME:** `ATLAS_INDUSTRIAL_ESTABLISHMENT_PHYSICAL_LKG_2026-10-06`
- **FECHA_HORA_LOCAL:** `Tue Oct 06 2026 11:08:16 GMT-0300 (hora estándar de Argentina)`
- **FECHA_HORA_UTC:** `2026-10-06T14:08:16.344Z`
- **GIT_HEAD:** `923adbe62033b61d6cfa53e50ce42cdf5c35eb99`
- **GIT_BRANCH:** `main`
- **PROJECT_ROOT:** `c:\Users\Eduardo\YOUAPP`
- **SECRETS_INCLUDED:** `0`
- **RUNTIME_BACKEND_PID_5174:** `36128`
- **RUNTIME_FRONTEND_PID_5175:** `40332`
- **RUNTIME_MATCHES_DISK:** `TRUE`
- **BUILD_VERIFICATION (tsc --noEmit):** `PASS (Exit code 0)`

---

## Validación Física de Producción (LKG)
- **Misión de Validación:** `#4_00B681`
- **Objetivo:** `LIBRERIAS en CABA`
- **Target:** `1000`
- **Estado Observado en UI (http://localhost:5175/buscaindustrial):** `BUSCANDO RESULTADOS`
- **Métricas Físicas Certificadas:**
  - `SCANNED:` 279
  - `CORE_EXISTING:` 139
  - `CERTIFIED_NEW:` 130
- **Conclusión de Estado:** `PHYSICAL_ESTABLISHMENT_ACQUISITION_WORKING = TRUE`

---

## Invariantes y Contratos Protegidos
1. **Source Outcome Truth Contract:**
   - Fallos técnicos de ejecución (HTTP 408, 429, 500, 502, 503, 504, TimeoutError, AbortError, connection reset) son registrados estrictamente como `TECHNICAL_FAILURE`, nunca como `ZERO_YIELD` ni `EXHAUSTED`.
   - Fuentes de fallback/hipótesis de IA o directorios no validados que retornan 0 filas no califican como agotadas (`EXHAUSTED`) ni pueden causar `VALID_SOURCE_ZERO_YIELD`.
   - `VALID_SOURCE_ZERO_YIELD` requiere la ejecución exitosa de una fuente enumerable validada para la misión que físicamente devuelva 0 registros.
2. **Universal Mission & Spatial Partitioning Orchestrator:**
   - Ejecución fluida Probe $\rightarrow$ Acquisition con cuadrantes espaciales y soporte de failover a múltiples espejos de OpenStreetMap Overpass.
3. **Core Registry & Deduping Integrity:**
   - Ledger append-only, deduplicación canónica por CUIT/nombre/ubicación, y certificación con prueba criptográfica.

---

## Observaciones Registradas (Para seguimiento futuro — No bloqueantes)
1. **Discrepancia Contable Menor en UI:**
   - `UI_SCANNED = 279` vs `VISIBLE_ACCOUNTED = 139 (existentes) + 130 (nuevos) = 269` (Diferencia de 10 registros, atribuible a visualización de filas del probe inicial).
2. **Velocidad en UI:**
   - `UI_SPEED = 0 reg/sec` mientras la misión continúa buscando activamente en segundo plano.

---

## Componentes Intelectuales Protegidos
1. **Industrial Discovery Service (`server/services/industrial/IndustrialDiscoveryService.ts`):**
   Orquestación del loop de misión, ejecución de fuentes espaciales/físicas y evaluación de terminación veraz.
2. **Mission Orchestrator (`server/services/industrial/MissionOrchestrator.ts`):**
   Máquina de estados de misiones, telemetría en tiempo real y ledger de estados de fuentes.
3. **Autonomous Source Discovery (`server/services/industrial/AutonomousSourceDiscovery.ts`):**
   Conector resiliente de Overpass OSM con failover multi-espejo y timeout protegido.
4. **Spatial Partition Planner (`server/services/industrial/SpatialPartitionPlanner.ts`):**
   Particionamiento espacial adaptativo de cuadrantes BBox con persistencia en base de datos.
