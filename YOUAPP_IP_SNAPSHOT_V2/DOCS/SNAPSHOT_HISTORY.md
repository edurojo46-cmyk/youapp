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
- **Git Tag:** `youapp-streaming-mvp-v1`
- **Archivo:** `YOUAPP_IP_SNAPSHOT_V2.zip`
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
