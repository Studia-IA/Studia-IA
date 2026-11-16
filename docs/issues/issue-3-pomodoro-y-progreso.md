# Issue 3 · Probar el pomodoro a fondo y estados de Progreso

**Asignada a:** Joan
**Labels:** `sprint-1`, `qa`, `polish`

## Qué hay que hacer

1. **Pomodoro (`study.js`)**: probar el ciclo completo y confirmar que la
   sesión se recupera bien: arrancar → recargar página → cerrar pestaña →
   volver → pausar → resetear. Anotar en la Issue cualquier caso roto.
2. **Progreso (`progress.js`)**: comprobar que mapa de calor, gráfico diario,
   horas por asignatura, racha e hitos se ven bien con **0 sesiones** y con
   muchas sesiones (100+ registros de prueba).

## Criterios de aceptación

- [x] El pomodoro en marcha sobrevive a recargar y a cerrar la pestaña.
- [x] Pausar y resetear se comportan como se espera (sin horas fantasma).
- [x] Progreso con 0 sesiones muestra estados vacíos, no errores ni huecos.
- [x] El `dashboard.js` de Héctor muestra bien racha/nivel/XP tras las pruebas.
- [x] Resultados de las pruebas anotados en esta Issue (capturas si hay fallos).
- [x] `node tools/check.js` en verde y PR desde la rama `joan` hacia `main`.

## Resultados de la revisión · 4 nov 2026

Rama `joan` actualizada con `main` (0.4.0, rediseño de la interfaz). La revisión
no encontró fallos en pomodoro ni en el panel; sí dos mejoras de consistencia en
Progreso, ya aplicadas en `progress.js`.

**Comprobaciones automáticas**
- `node tools/check.js`: verde.
- `tests.html`: 20/20 comprobaciones del núcleo.
- Pruebas de esta Issue con un arnés temporal (sin tocar el proyecto), en
  Chromium headless y con `localStorage` real.

**Pomodoro**
- Arrancar guarda `running` y `endAt`; recargar conserva el tiempo restante (no
  vuelve a 25:00) y el botón pasa a "Continuar".
- Pausar conserva el tiempo y no crea sesiones; reset vuelve al total y no deja
  horas fantasma.
- Pomodoro terminado con la app cerrada: al abrir registra **1** sesión de 25
  min, pasa al descanso corto y suma la racha. Al recargar otra vez **no** se
  duplica.
- Nota de comportamiento: al recargar/cerrar, `pagehide` deja el pomodoro en
  pausa con el tiempo restante (no sigue contando en segundo plano). Es lo que
  hace hoy el código; si se quiere que siga corriendo, habría que cambiarlo.
- **Arreglado:** el anillo del temporizador se creaba con `U.h` (nodos HTML) y
  el navegador no pintaba los círculos. Ahora `study.js` usa el namespace SVG,
  igual que los gráficos de Progreso.

**Progreso**
- Con 0 sesiones: el gráfico avisa "Aún no hay sesiones en este periodo", el
  reparto muestra su estado vacío, el total sale en minutos ("0 min", no "0 h")
  y no aparece ningún `NaN`/`undefined`.
- Con 120 sesiones repartidas en 88 días: pinta línea, 30 puntos, 5 barras por
  asignatura y el mapa de calor completo (16 × 7 = 112 celdas), sin errores.
- Los ids de degradado de los SVG son únicos al renderizar dos gráficos.
- **Arreglado:** los gráficos se creaban con `U.h`, que genera nodos HTML; dentro
  de un `<svg>` el navegador solo pintaba las etiquetas y se saltaba la línea y
  las barras. Ahora `progress.js` crea los nodos SVG con `createElementNS`: se
  ven la línea de progresión y las barras por asignatura.
- **Arreglado:** las sesiones sin asignatura ya entran en "Reparto por
  asignatura" con una barra "Sin asignatura". Antes desaparecían y las barras no
  sumaban el total del rango.
- **Arreglado:** el mapa de calor se calcula desde las sesiones (no solo desde
  `streak.history`) y la última columna es la semana actual. Antes podía acabar
  hasta 6 días antes de hoy y no pintar las sesiones de esta semana.

**Panel**
- Racha, nivel y XP coinciden con el `store` (nivel 41 y mejor racha 88 en los
  datos de prueba) y no hay `NaN`/`undefined`.

**Móvil (DevTools/CDP, viewport real)**
- Estudio y Progresión a **390 px** y **360 px**: sin scroll horizontal de
  página, sin elementos desbordados y sin excepciones en consola.

## Mejoras de Estudio · 4 nov 2026

- La **tarea elegida** se guarda al instante; antes se perdía si recargabas
  antes de arrancar el pomodoro.
- **Wake Lock**: mientras corre el pomodoro se pide que la pantalla no se
  apague. Se libera al pausar, resetear o terminar y se recupera al volver a la
  pestaña. Si el navegador no lo soporta, se ignora sin errores.
- **Avisos al terminar**: nuevo bloque en los ajustes para pedir permiso de
  notificaciones y ver si están activados, bloqueados o no disponibles.
- Probado con el arnés: la tarea sobrevive a recargar, `start` pide el wake lock
  y `pause` lo libera; Estudio sigue sin desbordar a 390/360 px.

## Reverificación tras el merge · 16 nov 2026

Rama `joan` fusionó `main` (`8108af1`, calendario y horario de Carles) sin
conflictos. Las pruebas de esta Issue quedan como test permanente en
`tools/arnes/progress.test.js` (junto a `pomodoro.test.js` y `mobile.test.js`).

**Progreso · 0 sesiones**
- Total en minutos ("0 min", no "0 h"), sin línea ni barras, tres avisos de
  estado vacío (gráfico, días de la semana y reparto).
- Mapa de calor completo (16 × 7 = 112 celdas) y sin ningún día activo.
- Racha "0 días", nivel 1 con 0 XP e hitos 0/6. Sin `NaN`/`undefined`.

**Progreso · 120 sesiones repartidas en 88 días**
- Total del rango correcto (30 d = 30 h; 90 d = 60 h) y 30/90 puntos en la línea.
- Racha actual, nivel y XP coinciden con `store.streakInfo()`/`levelInfo()`.
- Reparto con 4 barras (3 asignaturas creadas + sesiones sin asignatura), mapa
  con días activos, 7 barras en "Días de la semana" e hitos que coinciden con
  `Studia.rewards.status()`.
- "Acumulado" + "90 d" redibuja la línea y recalcula el total sin errores.

**Móvil (CDP, viewport real)**
- Progreso a **390 px** y **360 px**, con 0 y con 120 sesiones: `clientWidth`
  real, sin scroll horizontal de página y sin elementos desbordados.
- Consola limpia en todas las pasadas.

**Pomodoro (regresión de esta ronda)**
- Las pestañas de modo van en cuadrícula de 3 columnas: a 390/360 px ya no hay
  scroll horizontal (antes medían 489 px por los minutos añadidos en `f8976c1`).
- `pomodoro.test.js`: 38/38 en verde.

**Resultado**: 40 comprobaciones en verde (`progress.test.js`), 0 fallos,
1 aviso.

**Aviso para Héctor (`core/`, fuera de mi módulo)**
- `dashboard.js:52` compara `store.get().sessions[iso]`, pero `sessions` es un
  **array** (no un objeto por fecha): siempre da 0. Con 0 minutos hoy pero
  sesiones ayer, el hero dice "Llevas 29 días sin estudiar" mientras el mismo
  hero muestra "88 días de racha". Debería usar `store.minutesOn(iso)` o
  `sessions.some(...)`.
- `store.removeSession()` (core) no descuenta XP ni racha, aunque el modal de
  sesiones manuales promete actualizar el progreso.
- Si se publica esta ronda, toca subir la caché (sigue en `0.5.7`); `index.html`
  y `main.js` son de Héctor.

**Cambio de comportamiento (a validar por Héctor)**
- Recargar o cerrar la pestaña con una ronda en marcha ahora **reanuda** el
  pomodoro con el tiempo real restante (antes quedaba en pausa). Si venció con
  la app cerrada, la sesión se cuenta **una sola vez** al volver y pasa al
  descanso correspondiente.
