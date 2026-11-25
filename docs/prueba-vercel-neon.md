# SUYAI: preparación para pruebas en Vercel y Neon

Objetivo: una demostración de costo cero con datos ficticios, dentro de los límites y condiciones de los planes gratuitos. Vercel Hobby está destinado a uso personal y no comercial. No introducir datos personales ni pagos reales antes de completar seguridad, copias y revisión de las condiciones.

## Estado

El proyecto está preparado localmente para Next.js en Vercel y PostgreSQL externo. No se ha publicado ni conectado a Neon; las pruebas contra estos proveedores siguen pendientes. Revisar las condiciones y los límites actuales al crear las cuentas.

## Base de datos de prueba

1. Crear en Neon un proyecto gratuito exclusivo para pruebas y elegir una región compatible con la aplicación. No incluir datos reales.
2. Obtener las conexiones **agrupada** (pooled) y **directa** desde Neon. La aplicación y el proceso programado usan la URL agrupada como `DATABASE_URL`; las migraciones y `pg_dump` usan la conexión directa. Mantener cifrado y verificación TLS según las instrucciones actuales de Neon.
3. En una terminal privada, configurar temporalmente `DATABASE_URL` con la conexión directa y ejecutar `npm run db:migrate`. No pegar ni compartir la conexión en conversaciones, capturas o archivos versionados.
4. En la misma terminal privada ejecutar `npm run admin:bootstrap` para crear una administradora ficticia: el comando solicita interactivamente correo y contraseña sin mostrarlos en pantalla. No poner la contraseña en la línea de comando. Se necesita acceso desde una terminal a la base de prueba.
5. Con la administradora de prueba, configurar valor y día de vencimiento antes de habilitar la generación.

Fuente: [conexiones agrupadas de Neon](https://neon.com/docs/connect/connection-pooling).

## Aplicación de prueba

1. Mantener el repositorio privado. El proyecto contiene cambios locales aún no publicados: revisar y versionar el contenido autorizado antes de conectar el repositorio. Comprobar que archivos `.env`, respaldos, contraseñas y datos privados no se incluyan en Git.
2. Crear un proyecto Vercel Hobby que use el repositorio y seleccionar Node.js 24. La compilación usa `npm run build`. El dominio temporal debe ser HTTPS.
3. Configurar de forma privada las variables de producción del proyecto Vercel: `DATABASE_URL` con la conexión agrupada de prueba, `APP_ORIGIN` con el origen HTTPS exacto y sin barra final, y `AUTH_WEB_ENABLED=true`. Limitar el acceso a la configuración a la persona administradora.
4. Inicialmente dejar `FEE_WORKER_ENABLED=false`. Probar inicio y cierre de sesión y el panel de alumna con datos ficticios. Antes de activar cuotas se necesita `FEE_GENERATION_START` y una clave privada `CRON_SECRET` aleatoria de al menos 32 caracteres ASCII (letras, números, guion o guion bajo). Guardar la clave en Vercel, nunca en el repositorio.
5. La programación en `vercel.json` invoca `/api/cron/fees` una vez por día a las 06:00 UTC; Vercel Hobby puede ejecutarla en cualquier momento de esa hora. Esta ruta comprueba la clave y falla cerrada si falta la configuración. Solo después de verificar cuota y vencimiento ficticios configurar `FEE_WORKER_ENABLED=true` y probar una ejecución autorizada; monitorear fallos y cargos duplicados.
6. Verificar que una solicitud sin clave reciba 401 o 503 y no genere cuotas; comprobar que repetir una ejecución autorizada no genere duplicados. No exponer ni registrar la clave al probar.

Fuentes: [trabajos programados y seguridad de Vercel](https://vercel.com/docs/schedules/cron-jobs/manage-cron-jobs), [límites de frecuencia](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing), [versiones Node](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

## Antes de usar datos reales

Probar protección contra intentos distribuidos, límites de conexiones bajo concurrencia, copias y recuperación en el proveedor, pérdida de sesiones, monitoreo y privacidad de equipos compartidos. Neon Free tiene límites de recursos y recuperación; no confundir una prueba local de restauración con un respaldo productivo. El plan Hobby de Vercel puede no ser apto para la operación comercial del taller. Elegir una opción apropiada y revisar permisos y condiciones antes de la puesta en marcha.
