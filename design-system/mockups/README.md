# Mockup inicial: inicio de sesión

Sistema de diseño: revisión 2 aprobada. Estado del mockup: aprobado por el usuario (25/11/2026). Fuente: requisitos de SUYAI y logo original. Abrir `inicio-sesion.html` directamente en un navegador; ajustar el ancho para revisar escritorio y móvil. No hay autenticación en esta vista.

Vista previa: manual; Playwright no encuentra Chrome en el entorno. Verificación visual automatizada pendiente.

Visual verify: manual (25/11/2026). Playwright no encontró Chrome; abrir la aplicación y el mockup, comparar el acceso en escritorio y móvil, y verificar estados, consola y solicitudes cuando exista un navegador automatizado.

# Mockup: cambio obligatorio de contraseña

Sistema de diseño: revisión 2 aprobada. Estado del mockup: aprobado por el usuario (25/11/2026). Fuente: requisitos de SUYAI; permite contraseña actual, nueva contraseña y confirmación. Abrir `cambiar-contrasena.html` en un navegador y revisar en escritorio y móvil. Vista estática sin operación real. Vista previa manual; Playwright no encontró Chrome en el entorno.

Visual verify: manual (25/11/2026). La ruta y el flujo HTTP se probaron, pero no se comparó visualmente con el mockup desde un navegador automatizado: Playwright no encuentra Chrome. Revisar pantalla de cambio en 390×844 y 1440×900, mensajes, foco, consola y solicitudes.

# Mockup: alta de alumna

Sistema de diseño: revisión 2 aprobada. Estado del mockup: aprobado por el usuario (25/11/2026). Incluye datos personales, seis días, estado y elección del primer período. Abrir `nueva-alumna.html` en un navegador y revisar en escritorio y móvil. Vista estática ilustrativa; no crea cuentas. Vista previa manual: Playwright no encontró Chrome.

Visual verify: manual (25/11/2026). No se comparó visualmente con el mockup: Playwright no encuentra Chrome. Revisar `/admin/alumnas/nueva` contra `nueva-alumna.html` en 390×844 y 1440×900, incluidos estados de selección, errores, teclado y consola. Las secciones del menú aún no son navegables.

# Mockup: listado y estado de alumnas

Sistema de diseño: revisión 2 aprobada. Estado del mockup: aprobado por el usuario (25/11/2026). Muestra búsqueda y filtros combinables, tabla de escritorio, tarjetas móviles y acciones de baja/reactivación. Los datos son ficticios. Abrir `listado-alumnas.html` en navegador; vista previa manual, Playwright no encontró Chrome. La confirmación de baja y la elección de período al reactivar deben solicitarse antes de ejecutar la operación.

Visual verify: manual (25/11/2026). El flujo HTTP se probó, pero no se comparó el listado ni los diálogos con el mockup desde navegador: Playwright no encuentra Chrome. Revisar 390×844 y 1440×900, filtros, paginación, foco y teclado de diálogos, consola y solicitudes. El detalle individual y otras secciones aún no están implementados.

# Mockup: valor general de cuotas

Sistema de diseño: revisión 2 aprobada. Estado del mockup: aprobado por el usuario (25/11/2026). Muestra valor vigente, próximo valor, programación e historial con datos ficticios. Abrir `cuotas-valor.html` en navegador para revisar escritorio y móvil; vista previa manual, Playwright no encontró Chrome. La configuración inicial sin valor previo requiere un estado vacío y no debe alterar cuotas existentes.

Visual verify: manual (25/11/2026). Se probó el flujo HTTP, pero no se comparó la pantalla con el mockup desde navegador automatizado: Playwright no encuentra Chrome. Revisar `/admin/cuotas` frente a `cuotas-valor.html` en 390×844 y 1440×900, incluidos estados iniciales, errores, teclado, consola y solicitudes.

# Mockup: día de vencimiento de cuotas

Sistema de diseño: revisión 2 aprobada. Estado del mockup: aprobado por el usuario (25/11/2026). Agrega a la pantalla de cuotas el día vigente y próximo, y una opción para programar un día del 1 al 28 desde el mes siguiente. Importes, días y controles son ficticios. Abrir `cuotas-vencimiento.html` en el navegador y revisar escritorio y móvil; vista previa manual, Playwright no encontró Chrome.

Visual verify: manual (25/11/2026). Se probó la configuración por HTTP, pero no se comparó visualmente con `cuotas-vencimiento.html` desde navegador automatizado porque Playwright no encuentra Chrome. Revisar `/admin/cuotas` a 390×844 y 1440×900, incluidos los estados vacío, error, historial y teclado.

# Mockup: ajuste individual de cuota

Sistema de diseño: revisión 2 aprobada. Estado del mockup: aprobado por el usuario (25/11/2026). Presenta el importe original, importe actual, monto abonado, nuevo importe y motivo; los datos son ficticios. Abrir `ajustar-cuota.html` en un navegador y revisar escritorio y móvil. Vista previa manual: Playwright no encontró Chrome.

Visual verify: manual (25/11/2026). Revisar la pantalla implementada en /admin/cuotas/ajustar frente al mockup a 390×844 y 1440×900, búsqueda, selección, errores, teclado y reintentos. No se realizó comparación visual automatizada.

# Mockup: carga masiva de horno

Sistema de diseño: revisión 2 aprobada. Estado del mockup: aprobado por el usuario (25/11/2026). Muestra datos generales, búsqueda de alumnas, piezas agrupadas, resumen, borrador y revisión previa. Los datos y controles son ficticios. Abrir `carga-horno.html` en el navegador; revisar escritorio y móvil. La vista de confirmación y los estados de errores, borrador e inactividad también deben incluirse en la implementación.

Visual verify: manual (25/11/2026). Comparar /admin/hornos/nueva con el mockup en 390×844 y 1440×900; revisar búsqueda, selección, bloques, borrador, confirmación, teclado, consola y solicitudes. No se realizó comparación visual automatizada.

# Mockup: historial de hornadas

Sistema de diseño: revisión 2 aprobada. Estado del mockup: aprobado por el usuario (25/11/2026). Incluye filtro por período, listado y detalle agrupado por alumna con importes generados y cobrados. Los datos son ficticios. Abrir `historial-hornos.html` en un navegador y revisar escritorio y móvil. Vista previa manual: Playwright no encontró Chrome.

Visual verify: manual (25/11/2026). Revisar /admin/hornos frente al mockup a 390×844 y 1440×900, búsqueda por período, detalle, paginación, estados, teclado, consola y solicitudes. No se realizó comparación visual automatizada.

# Mockup: corrección de cargo de horno

Sistema de diseño: revisión 2 aprobada. Estado del mockup: aprobado por el usuario (25/11/2026). Presenta corrección económica, anulación con motivo y confirmación, e historial de cambios; los datos son ficticios. Abrir `correccion-horno.html` en navegador para revisar escritorio y móvil. Vista previa manual: Playwright no encontró Chrome.

Visual verify: manual (25/11/2026). Comparar la pantalla de corrección y anulación con el mockup en escritorio y móvil; revisar confirmación, teclado, errores, reintentos y estado anulado. No se realizó comparación visual automatizada.

# Mockup: catálogo de materiales

Sistema de diseño: revisión 2 aprobada. Estado del mockup: aprobado por el usuario (25/11/2026). Presenta búsqueda, estado, listado y formulario de creación o edición; datos ficticios. Abrir `catalogo-materiales.html` en navegador para revisar escritorio y móvil. Vista previa manual: Playwright no encontró Chrome.

Visual verify: manual (25/11/2026). Comparar /admin/materiales con el mockup en escritorio y móvil; revisar filtros, formulario, unidad personalizada, errores, reintentos, teclado y consola. No se realizó comparación visual automatizada.
