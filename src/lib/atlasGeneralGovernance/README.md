# Atlas General — registro shadow V1

Primer paso del blueprint del 31/10/2026. Catálogo inicial de 15 componentes
existentes; no son motores nuevos ni un inventario exhaustivo de todos los módulos.

- Modo: SHADOW_CATALOG_ONLY. Sin integración productiva.
- Referencia cuatro registros existentes por ruta y responsabilidad.
- No importa motores, adaptadores, registries con inicializadores, DB ni SDK.
- No dispone de ejecución, concesión de permisos, registro de callbacks ni planificación.
- Todas las decisiones de elegibilidad devuelven autorizado=false.
- Costos, efectos y estado operativo permanecen UNKNOWN.
- Las certificaciones existentes no se duplican ni se modifican.
- Los motores conservan datos, índices, ranking y autoridad especializada.

Esta restricción solo describe el nuevo módulo. No añade un veto global a las
rutas existentes de YOUAPP, no corrige otros motores y no acredita seguridad global.

Prueba aislada, sin iniciar aplicaciones:
`node --test src/tests/atlas_general_registry_shadow.test.mjs`

Siguiente fase separada: gobernador plan-only que consulte metadatos sin invocar
executeMission(), run() ni adaptadores. Activación y puente productivo pendientes.
