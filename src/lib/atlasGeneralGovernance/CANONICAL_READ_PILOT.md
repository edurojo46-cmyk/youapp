# AGGL — piloto de lectura canónica autenticada

Prueba opt-in, sin integración con rutas actuales ni modificación de motores.
Página: http://localhost:5175/atlas-general-read.html

Usa la sesión normal de YOUAPP en el navegador. El piloto crea un cliente separado
con clave pública y el JWT de esa sesión en memoria; verifica getUser(jwt) con Auth.
Rechaza sesiones anónimas, claves administrativas y proyectos distintos de YOUAPP.
El tenant se deriva de app_metadata de Auth verificado o de user.id, igual que la
política RLS inspeccionada; nunca se toma de user_metadata ni de un campo de entrada.

Transporte: solo GET a Auth/user y a atlas_canonical_entities; máximo dos llamadas,
cinco filas, cinco segundos por solicitud y 64 KiB de respuesta.
Proyección: ID, tenant para comprobar el límite, nombre, tipo, estado. El tenant no
se expone en el resultado proyectado. No hechos, emails, metadatos privados ni RPC.
No inferencias, harvesting, escrituras, publicaciones, cambios de permisos ni índices.
Una lista de entidades no certifica hechos ni el contenido total del grafo.

El lector multihop de Query Fabric se conserva intacto. No se usa para este piloto
porque su recorrido puede hacer consultas adicionales. Esta es una lectura acotada
del almacén canónico, no una certificación de Query Fabric end-to-end.

La prueba automática usa el SDK real con transporte simulado; NO equivale a
una lectura en vivo autenticada. Esta última queda pendiente hasta pulsar el botón
en la página con una sesión registrada válida. No se extraen sesiones del navegador
mediante terminal, no se imprimen JWT ni se usan claves service_role para suplirla.
