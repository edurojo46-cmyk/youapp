# Query Fabric — prueba local de planificación shadow

Adaptador opt-in buildQueryPlanShadow(): reutiliza QueryIntentClassifier.classify()
y StructuredQueryPlanner.plan(). No instancia AtlasReasoningQueryFabric completo,
no crea clientes Supabase y no recupera registros.

Entrada: missionId, ownerId UUID, query (máximo 500 caracteres), maxHops (1 o 2).
Límites de propuesta: 50 nodos estimados y 5 consultas estimadas; no son mediciones.
Se excluyen inferencias y claims por defecto. No se autentica al propietario aquí.
READY solo significa plan local preparado, nunca autorización de lectura o ejecución.

La duración registrada es la de planificación local; no mide latencia de búsqueda.
No se registra ninguna observación de fuentes ni se presentan resultados de ejemplo
como hechos verificados.

Prueba:
node <ruta-TSX-existente>/cli.mjs --test src/tests/atlas_query_planning_shadow.test.ts

Sin rutas nuevas, integración productiva, reinicios ni cambios de motores existentes.
La lectura real de conocimiento sigue pendiente de autorización, identidad y límites.
