# YOUAPP SNAPSHOT HISTORY

Este documento constituye el registro maestro inmutable de versiones protegidas, propiedad intelectual (IP) y estados de ingeniería de **YouApp**.

---

## V1 — YouApp Core
- **Fecha:** 2026-08-30
- **Git Tag:** `youapp-core-v1`
- **Archivo:** `YOUAPP_IP_SNAPSHOT_V1.zip`
- **SHA256:** `0502BE57641F112FB4B224872ACA7A26428BA9E3BCF2E2447665186724D080F6`
- **Estado:** ORIGINAL — CONGELADO / NO MODIFICAR

### Incluye:
- Search Engine & Normalization Engine
- Atlas Graph & Semantic Embeddings
- Ranking Engine & Relevance
- RadarPlanner & QuotaBrain
- TV Core & Signal Persistence V1
- LiveZapping & ProgramarTV
- Persistence V1 & Guest Auth
- Universal Test Pack

---

## V1.1 — YouApp Core + UI Captures
- **Fecha:** 2026-08-30
- **Git Tag:** `youapp-core-v1` (congelado)
- **Archivo:** `YOUAPP_IP_SNAPSHOT_V1_1.zip`
- **SHA256:** `3BFFBC0C18E0613A37A89C4C3893E49EAF430154950118C20721CDCA2BF81594`
- **Estado:** ORIGINAL — CONGELADO / NO MODIFICAR

### Incluye:
- Todo V1
- Capturas de Pantalla de interfaz (HOME, BUSCAR_IA, HACEME_UNA_TV, LIVE_ZAPPING, PROGRAMAR_TV, SEARCH_LAB, MI_SIGNAL)

---

## V2 — YouApp Streaming MVP & Smart Bar
- **Fecha:** 2026-09-01
- **Commit:** `45fec1c`
- **Git Tag:** `youapp-streaming-mvp-v1`
- **Archivo:** `YOUAPP_IP_SNAPSHOT_V2.zip`
- **SHA256:** `2D2E58CF65AB81B3C198E146B90CB488C43D9610623700BAFDB35CA98FBC31C4`
- **Estado:** ORIGINAL — CONGELADO / NO MODIFICAR

### Cambios & Nuevas Capacidades desde V1:
1. **Smart Bar Contextual & Player Event Bridge:**
   - Contrato unificado de `PlaybackState` (`idle | ready | buffering | playing | paused | ended | error`).
   - Sincronización continua en tiempo real de progreso (`currentTime / duration`) y círculo SVG en la Smart Bar.
   - Smart Bar adaptativa con `StreamingCapabilities`.
2. **Capa Multiplataforma & Streaming Graph:**
   - `streaming_titles`: Catálogo universal de películas y series con metadatos y external IDs (TMDB, IMDB, Watchmode).
   - `streaming_availability`: Disponibilidad de streaming en Argentina (`country_code = 'AR'`) con trazabilidad completa de origen (`source`, `verified_at`, `expires_at`).
   - `user_streaming_services`: Gestión de suscripciones activas declaradas por el usuario (*"Mis plataformas"*).
   - `user_library`: Mi Lista universal multi-contenido (`movie`, `series`, `episode`, `video`, `signal`, `live`).
   - `user_streaming_activity`: Historial de streaming reciente distinguiendo progreso medido vs actividad externa.
3. **Nuevas Experiencias de Interfaz:**
   - **Mi Plataforma (`/mi-plataforma`):** Centro personalizado con filtro `[✓ Mis plataformas]`, Hero inteligente, recomendaciones y lista unificada.
   - **Explorar (`/explorar`):** Descubrimiento universal con filtros por géneros, tendencias y catálogo global.
   - **Ficha de Detalle (`/streaming/:type/:id`):** Ficha técnica cinematográfica con desglose de disponibilidad en Argentina y enlaces seguros.
   - **Modal Mis Plataformas:** Selector limpio sin credenciales para optimizar el catálogo sin costos adicionales.
   - **Modal Dónde Verla:** Jerarquía de valor (Tu Suscripción $\rightarrow$ Otras Suscripciones $\rightarrow$ Alquiler/Compra).

---

## V3 — YouApp Knowledge Reuse V1
- **Fecha:** 2026-09-01
- **Git Tag:** `youapp-knowledge-reuse-v1-live-validated`
- **Archivo:** `YOUAPP_IP_SNAPSHOT_V3.zip`
- **Estado:** LIVE VALIDATED ✅ — CONGELADO / NO MODIFICAR 🧊

### Principio Fundamental:
> **SEARCH ONCE → ABSORB → REMEMBER → REUSE**
> *"Cada búsqueda Radar exitosa y correctamente absorbida construye conocimiento reutilizable en YouApp."*

### Validaciones Superadas:
- **CandidatePool / IndexedDB Local Reuse:** PASS
- **Browser Reload / F5 Persistence:** PASS
- **Atlas Pure Recovery (`youapp_index` sin RAM ni IndexedDB):** PASS
- **Novel Query Learning & Absorption (`"spinetta jade"`):** PASS (40 videos absorbidos en 1ª consulta)
- **Repeated Query Quota Delta = 0:** PASS (2ª consulta ejecutó Fast Path 100% Atlas con 0 cuota backend)

### Caso Gold de Validación en Vivo:
- **Query:** `"spinetta jade"`
  - **1ª Búsqueda (Inédita):** Atlas = 0 $\rightarrow$ Radar = 1 (~100 u) $\rightarrow$ 40 videos absorbidos en `youapp_index`.
  - **2ª Búsqueda (Sin Caché):** Atlas = 40 $\rightarrow$ Fast Path $\rightarrow$ Radar = 0 $\rightarrow$ **Cuota = 0 u**.

### Nuevas Capacidades & Defensas de Economía:
1. **Radar Recency Guard Inteligente (`quotaBrain.ts`):**
   - Cooldown de 6 horas para consultas generales y 1 hora para noticias/actualidad.
   - Condicionado a la existencia efectiva de candidatos reutilizables (`hasKnowledge > 0`).
2. **Normalización Canónica de Consultas:**
   - Limpieza de acentos, símbolos y espacios redundantes para reutilización semántica compartida.
3. **Calibración de Fast Path Adaptativo (`searchEngine.ts`):**
   - Aprobación con $\ge 8$ candidatos y Top 5 de alta relevancia sin exigir umbrales artificiales.
4. **Telemetría Estructurada `[DiscoveryEconomy]`:**
   - Registro en tiempo real de fuentes (RAM, IndexedDB, Atlas, Radar), estado de guardas y balance de cuota consumida.
