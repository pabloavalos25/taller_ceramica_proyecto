# Propuesta de alojamiento para SUYAI

Consulta: 25/11/2026. Propuesta para revisión: no hay servicios creados ni datos publicados.

## Componentes y costo orientativo

- Aplicación Next.js: Render Web Service, 0,5 CPU y 512 MB, desde USD 7/mes.
- Base de datos: Render Postgres paga, 256 MB de memoria, desde USD 6/mes, más almacenamiento según uso. La memoria de la base no es su capacidad de almacenamiento.
- Generación de cuotas: Render Cron Job que ejecute `npm run fees:run` de forma periódica; mínimo USD 1/mes y cobro por tiempo de ejecución. Confirmar frecuencia, límites y costo real antes de activar.
- Estimación inicial de cómputo: desde USD 14/mes, más almacenamiento, posibles excedentes, dominio, impuestos y cualquier servicio de seguridad adicional. No se garantiza que los planes más pequeños soporten la carga real: probar memoria y concurrencia, especialmente el costo de verificación de contraseñas con scrypt.

Fuentes: [precios de Render](https://render.com/pricing), [planes de cómputo](https://render.com/docs/compute-plans), [tareas programadas](https://render.com/docs/cronjobs).

No usar la base gratuita para datos reales: Render indica que vence a los 30 días y que no tiene respaldos administrados. Fuente: [limitaciones del plan gratuito](https://render.com/docs/free).

## Protección de ingreso

La aplicación ya limita intentos por cuenta. Falta una protección adicional de tráfico por origen que no dependa de encabezados enviados por el cliente.

Una opción a evaluar es un dominio propio detrás de Cloudflare, con una regla de límite sobre `/api/auth/login`. El plan gratuito documenta una regla, conteo por IP y ventana de 10 segundos; esta regla limita solicitudes totales, no distingue únicamente credenciales inválidas. Determinar el umbral con pruebas para no bloquear alumnas que comparten conexión. El dominio tiene costo aparte si no se dispone de uno. Fuentes: [límites de reglas de Cloudflare](https://developers.cloudflare.com/waf/rate-limiting-rules/), [DNS de Cloudflare para Render](https://render.com/docs/configure-cloudflare-dns).

La regla solo protege el tráfico que atraviesa Cloudflare. Render también ofrece un subdominio `onrender.com`; antes de usar datos reales hay que impedir o controlar los caminos alternativos al origen, verificar que no permitan eludir la regla y probar la configuración concreta. Render permite deshabilitar ese subdominio una vez configurado el dominio, pero esto por sí solo no demuestra que todos los caminos alternativos estén cerrados. No habilitar confianza en IP o encabezados de proxy sin validar la arquitectura. Fuente: [dominios personalizados de Render](https://render.com/docs/custom-domains).

## Respaldos y recuperación

Render indica que las bases Postgres pagas tienen recuperación a un punto en el tiempo: ventana de 3 días en Hobby y 7 días en Pro o superior. La recuperación crea otra base para verificar antes de cambiar las conexiones. Los respaldos lógicos creados desde el panel se conservan 7 días; para retención prolongada se necesita una copia adicional protegida. Fuente: [recuperación de PostgreSQL](https://render.com/docs/postgresql-backups).

Antes de usar datos reales:

1. Ensayar en un entorno aislado una recuperación real del proveedor, con datos ficticios. Verificar cuentas, ingreso, cuotas, cargos, pagos y una operación posterior.
2. Confirmar responsable, frecuencia de revisión, alertas, retención y ubicación cifrada de copias adicionales; probar su restauración. El proveedor documenta un [ejemplo de respaldo a S3](https://render.com/docs/backup-postgresql-to-s3), que requiere cuenta y costos adicionales.
3. Establecer un procedimiento para revocar sesiones después de recuperar y revisar operaciones realizadas desde la fecha de la copia. No redirigir el sistema a una base restaurada sin comprobarla primero.
4. Restringir credenciales y acceso de red a la base y separar cuentas para aplicación, migraciones y copias según permisos necesarios; ensayar antes de producción.

## Preparación técnica sin publicar

- Aplicación: Node 24; instalar con `npm ci`, compilar con `npm run build`, iniciar con `npm start`. Confirmar uso de `PORT` en el servicio real. Las migraciones se ejecutan explícitamente con `npm run db:migrate`, no al arrancar.
- Variables privadas: `DATABASE_URL`, `APP_ORIGIN` exacto con HTTPS y `AUTH_WEB_ENABLED=true` solo tras configurar el entorno. Jamás versionar contraseñas.
- Cuotas: tarea separada con `FEE_WORKER_ENABLED=true`, `FEE_GENERATION_START` adecuado y las configuraciones iniciales de valor y vencimiento; probar primero `npm run fees:run` con datos ficticios. Render evalúa el horario de cron en UTC.
- Crear administradora inicial de forma segura usando `npm run admin:bootstrap` en una terminal interactiva apropiada y sin compartir credenciales. Verificar que el entorno elegido permita esa operación antes de comprometer el despliegue; no colocar contraseñas en comandos, logs ni archivos versionados.
- Preparar pruebas con datos ficticios, acceso de alumna y administradora, cierre de sesión, carga, pagos y restauración. El ensayo previo local de PostgreSQL no sustituye la validación del servicio elegido.

No se han configurado cuentas, DNS, facturación, copias automáticas ni reglas de protección. Pendiente: presupuesto y proveedor definitivo, dirección pública, validación de la protección del origen, y procedimiento de restauración y permisos.
