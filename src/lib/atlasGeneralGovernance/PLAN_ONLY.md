# Atlas General — gobernador plan-only V1

Paso posterior al registro shadow; reutiliza EngineCapabilityRegistry.mjs sin
modificarlo. El único import es el catálogo inerte.

createPlan() recibe una misión estructurada: missionId, ownerId, requests
(id/capability/dependsOn/preferredEngineId) y límites opcionales.

- Propone componentes por capacidad exacta; no interpreta lenguaje natural,
  no sustituye a General Objective, Pathfinder ni Discovery AI.
- Construye dependencias solo si se solicitan; no impone una cadena universal.
- Las preferencias son orientativas y nunca autorizan una acción.
- Costos, calidad y latencia no medidos permanecen desconocidos.
- ownerId es contexto de propuesta, no identidad autenticada.
- No acepta callbacks, adaptadores, execute, permisos ni presupuestos pagos.
- No hay ejecutor ni puente a YOUAPP. Todo plan requiere revisión.
- Los límites son metadatos propuestos, no enforcement de workers existentes.
- La restricción no cambia ni bloquea las rutas actuales del proyecto.

Prueba aislada:
node --test src/tests/atlas_general_plan_only.test.mjs

Siguiente paso independiente: revisar un plan real y los requisitos de una única
capacidad de lectura antes de diseñar su adaptador de ejecución. No activar motores
por haber encontrado una coincidencia en el catálogo.
