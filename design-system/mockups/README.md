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

# Mockup: carga de materiales

Sistema de diseño: revisión 2 aprobada. Estado: aprobado por el usuario (25/11/2026). `carga-materiales.html` presenta una propuesta de carga agrupada por alumna, con precios propuestos desde el catálogo y revisión previa; los datos y controles son ilustrativos. Abrir el archivo en un navegador para revisar escritorio y móvil. Vista previa manual (25/11/2026): Playwright no encontró Chrome; no se realizó inspección visual automatizada.

Visual verify: manual (25/11/2026). Comparar `/admin/materiales/nueva` con el mockup en escritorio y móvil; revisar búsqueda de alumnas y materiales, selección, cantidades fraccionarias, precio cero, revisión, reintentos, teclado y consola. No se realizó comparación visual automatizada.

# Mockup: historial de materiales

Sistema de diseño: revisión 2 aprobada. Estado: aprobado por el usuario (25/11/2026). `historial-materiales.html` muestra filtro por período, cargas y detalle por alumna con datos ficticios. Abrir el archivo en un navegador para revisar en escritorio y móvil. Preview: manual (25/11/2026); Playwright no encontró Chrome.

Visual verify: manual (25/11/2026). Comparar `/admin/materiales/historial` con el mockup en escritorio y móvil. Revisar filtros, paginación, detalle, saldos inconsistentes, teclado y consola; no se realizó comparación visual automatizada.

# Mockup: registrar pago

Sistema de diseño: revisión 2 aprobada. Estado: aprobado por el usuario (25/11/2026), junto con la implementación financiera. `registrar-pago.html` propone selección de alumna, asignación manual total o parcial por cargo, medio de pago y confirmación; controles y datos ficticios. Preview: manual (25/11/2026); abrir en un navegador para revisar escritorio y móvil.

Visual verify: manual (25/11/2026). Comparar `/admin/pagos` en escritorio y móvil; revisar selección de cargos, importes, confirmación, errores y reintentos. No se realizó comparación visual automatizada. Diferencia conocida por estructura: el resumen implementado aparece debajo del formulario, mientras el mockup lo muestra a la derecha en escritorio.

# Mockup: historial y anulación de pagos

Sistema de diseño: revisión 2 aprobada. Estado: aprobado por el usuario (25/11/2026), junto con la implementación de la anulación financiera. `historial-pagos.html` propone consulta de pagos vigentes y anulados, detalle de asignaciones y anulación con motivo y confirmación; datos y controles ficticios. Preview: manual (25/11/2026); abrir en un navegador para revisar escritorio y móvil.

Visual verify: manual (25/11/2026). El usuario confirmó que funcionó el recorrido solicitado de consulta, detalle, anulación y saldo con datos ficticios. Quedan pendientes la comparación visual completa con el mockup en escritorio y móvil, teclado, consola y reintentos; no se realizó comparación visual automatizada.

# Mockup: panel de alumna

Sistema de diseño: revisión 2 aprobada. Estado: aprobado por el usuario (25/11/2026), junto con el acceso a datos propios. `panel-alumna.html` propone consulta de cargos, pagos y saldos propios; datos y controles ficticios. Preview: manual (25/11/2026); abrir en navegador para revisar escritorio y móvil.

Visual verify: manual parcial (25/11/2026). El usuario aprobó la revisión de `/mi-cuenta` con datos ficticios. No se confirmó explícitamente la comparación en ambos tamaños ni la revisión de saldo inconsistente, paginación, teclado y consola; no se realizó comparación visual automatizada.

# Mockup: corrección de consumo de material

Sistema de diseño: revisión 2 aprobada. Estado: aprobado por el usuario (25/11/2026), junto con el cambio financiero. `correccion-material.html` propone corrección de importe o anulación con motivo, confirmación e historial; datos y controles ficticios. Preview: manual (25/11/2026); abrir en navegador para revisar escritorio y móvil.

Visual verify: manual parcial (25/11/2026). El usuario confirmó que funciona y aprobó la revisión de correcciones de materiales con datos ficticios. No se confirmó explícitamente la comparación en ambos tamaños ni la revisión de teclado, consola y reintentos; no se realizó comparación visual automatizada.

# Mockup: borradores compartidos

Sistema de diseño: revisión 2 aprobada. Estado: aprobado por el usuario (25/11/2026), junto con la confirmación que crea cargos. `borradores-compartidos.html` propone listado, edición, conflicto entre administradores y confirmación para cargas de horno; materiales tendrá un flujo equivalente. Los datos y controles son ficticios. Preview: manual (25/11/2026); abrir en navegador para revisar escritorio y móvil.

Visual verify: manual pendiente (25/11/2026). Revisar listas y formularios de ambos tipos, guardado, conflictos, recuperación y confirmación en escritorio y móvil; no se realizó comparación visual automatizada.

# Mockup: protección de datos del dispositivo

Sistema de diseño: revisión 2 aprobada. Estado: aprobado por el usuario (25/11/2026). `proteger-datos-dispositivo.html` propone revisar cargas locales, guardarlas como borradores compartidos y resolver operaciones inciertas antes de eliminar datos del navegador. La limpieza solo abarcaría este navegador y la pestaña actual; otras pestañas y dispositivos pueden conservar datos. La copia local de una carga no debe quitarse hasta confirmar que se guardó completa en el servidor; nunca se debe borrar una operación de resultado incierto antes de resolverla. Datos y controles ficticios.

Preview: manual (25/11/2026). Playwright no pudo abrir Chromium porque no está instalado en la ruta configurada. Abrir el HTML local y revisar en escritorio y móvil. Visual verify: pendiente.

Visual verify: aprobado por el usuario (25/11/2026). La pantalla implementada está en `/admin/dispositivo`; no se confirmó explícitamente una comparación completa en escritorio y móvil, reintento tras fallo, bloqueo por operación pendiente, consola o solicitudes. No se pudo realizar comparación visual automatizada.
