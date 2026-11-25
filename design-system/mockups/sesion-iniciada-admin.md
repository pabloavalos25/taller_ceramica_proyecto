# Mockup: sesión iniciada de administradora

Sistema de diseño: revisión 2 aprobada.
Pantalla: estado posterior al inicio de sesión, para administradora.
Audiencia y tarea: la administradora necesita entrar a la gestión de alumnas o revisar la protección de los datos de este dispositivo.
Propuesta: mantener la composición aprobada del login con columna verde; mostrar el acceso exitoso como estado breve y presentar “Gestionar alumnas” como acción principal y “Cuidar datos de este dispositivo” como acción secundaria con superficie, borde, flecha y estados de foco/hover. “Cerrar sesión” queda como acción terciaria.
Responsive: escritorio 1440 × 900 y móvil 390 × 844.
Referencias: `login-columna-verde.html`, `app/login-form.jsx`, `design-system/tokens.css`.

Approval: approved (25/11/2026, by user).
Preview: manual (25/11/2026). No se pudo iniciar Playwright porque Chrome no está instalado; Edge headless terminó con un error del proceso GPU. Abrir `sesion-iniciada-admin.html` directamente en Edge o Chrome para inspeccionar escritorio y móvil.
Visual verify: pending.

La previsualización no tiene funcionalidad real: los enlaces y el botón son ilustrativos. El cambio propuesto se limita a la presentación del estado posterior al login.
