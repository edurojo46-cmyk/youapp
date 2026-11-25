# AGGL — fuente propia del publicador

Extensión aislada del piloto de lectura. Mis videos y borradores se lee de
youapp_social_publishing_posts con Auth verificado, owner_id=user.id y RLS forzado.
Esta fuente es propiedad del usuario, no del tenant organizativo de app_metadata.

- Máximo cinco filas, dos GET (Auth y lectura), timeout de cinco segundos y 64 KiB.
- Solo ID, owner para verificar aislamiento, título, fecha y tamaño; sin rutas
  privadas de Storage, aprobaciones, configuración de envío ni tokens.
- Guardado no significa publicado: el resultado se etiqueta SAVED_METADATA.
- No descarga videos, no consulta redes sociales ni publica.
- No copia datos al grafo canónico ni abre acceso a datos de otros usuarios.
- La fuente canónica se conserva como opción explícita; no hay fallback silencioso.
- Configurar esta fuente no activa ningún motor productivo de Atlas General.

La inspección de solo lectura confirmó dos registros para la cuenta autorizada.
Las pruebas automáticas usan SDK real con transporte simulado. El resultado
autenticado del nuevo selector permanece pendiente de ejecución en el navegador.
Página: http://localhost:5175/atlas-general-read.html
