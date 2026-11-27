# Selector de período para carga de horno

Sistema de diseño: revisión 2. Propuesta: `horno-periodo.html`.
Approval: approved (2026-11-27, by user).
Preview: manual (Playwright no pudo iniciar porque Chrome no está instalado).
Visual verify: manual (2026-11-27). Falta comparar la implementación en computadora y celular con la propuesta; probar selección de mes, cambio de año, Escape y conservación del período de un borrador. También probar en el navegador de Abril.

El selector conserva el valor interno `AAAA-MM`; no selecciona un período automáticamente.
