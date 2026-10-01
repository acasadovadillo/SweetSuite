# HANDOFF.md — Estado actual

*Última actualización: 2026-10-01 · Fase 1 terminada y con ajustes pedidos por el usuario; pendiente del OK para pasar a la Fase 2.*

## Hecho (Fase 1: base y datos)

- Estructura del proyecto, build en un único HTML (`npm run build` → `dist/webkit_asociaciones.html`, unos 138 KB) y tests (`npm test`: 41 en verde).
- Acceso: crear contraseña, desbloquear, recuperar una copia, demostración y «he olvidado la contraseña».
- Datos cifrados en IndexedDB (con localStorage de respaldo), esquema versionado con migraciones y repositorio asíncrono.
- Copias de seguridad: cifrada (con la misma contraseña) o sin cifrar con aviso, recuperación y franja de aviso «cambios sin copia».
- Módulos: Inicio, Asociación (datos de la entidad con validación de NIF, IBAN, correo y CP; domicilio por partes —tipo de vía, nombre, número, km, bloque, portal, escalera, planta, puerta, otros datos— con provincia automática por CP, aviso si no casan y vista previa de cómo se escribirá; junta directiva con histórico de cargos), Copia de seguridad y Ajustes (tema, bloqueo por inactividad, borrar al cerrar sesión, cambiar la contraseña, privacidad y RGPD).
- Diseño adaptado al móvil (menú lateral desplegable), tema claro/oscuro/automático, accesibilidad (etiquetas, foco en el título al navegar, enlace «saltar al contenido», Esc cierra el menú, diálogos nativos).
- Repositorio: README, CONTRIBUTING, plantillas de issues, `.gitignore` y workflow de integración continua. Repositorio git inicializado, **sin ningún commit**.

## Cambios pedidos tras la Fase 1

- Quitado el campo «Fines» (vendrán de los estatutos, que se adjuntarán más adelante).
- Domicilio social por partes. Esquema v2 con migración: la dirección antigua de una línea se reparte sola (`Direccion.desdeTexto`) y lo que no se entiende va a «Otros datos». Probado con datos v1 cifrados en el navegador.

## Verificado

- `npm test` (41 tests) y `npm run comprobar` en verde.
- En el navegador, sobre localhost: crear, guardar, comprobar que en IndexedDB solo hay datos cifrados, que el HTML se escapa (nombre con `<b>`), bloquear, desbloquear con contraseña buena y mala, recargar, copia y restauración, cambio de contraseña, borrar al salir, demostración, móvil y tema oscuro.
- Con `file://` real en Brave (Chromium) sin interfaz: contexto seguro, cifrado e IndexedDB disponibles, y los datos sobreviven a recargar. Script de prueba: no se guardó en el repositorio (ver NEXT_STEPS).

## Sin verificar

- Safari y Firefox abriendo el archivo con `file://`.
- Lectores de pantalla reales (solo se revisó la estructura).

## Decisiones pendientes del usuario

- **Licencia**: decidida el 2026-10-01 → privativa, todos los derechos reservados (`LICENSE`). Si se sube a GitHub, repositorio privado.
- Si se hace el primer commit y se sube a GitHub (y con qué nombre de repositorio).
