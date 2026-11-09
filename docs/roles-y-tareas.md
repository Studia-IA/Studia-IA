# Reparto de trabajo · Studia-IA

**Actualizado:** 2026-10-26 (tras el commit `Web Base`).

## Cómo leer este documento

Este repo está organizado por **ramas** y **Pull Requests**. Cada miembro del
grupo tiene asignados unos módulos de `assets/js/modules/` para evitar
conflictos. Las directrices de `core/` están protegidas: **nadie toca el núcleo
sin hablarlo antes con el coordinador**.

El objetivo es que al abrir una Issue o una PR, el agente de IA sepa **de
inmediato qué tiene que hacer cada rol** y no se desvíe a tocar cosas de otro.

---

## 1) Reparto actual

### Héctor · Coordinador / Publicación & IA
- **Rama:** `hector`
- **Módulos asignados:** `main.js`, `index.html`, `ai.js`, `dashboard.js`
- **Objetivo actual:** dejar la web publicada y con todas las vistas visibles
  (Premium por defecto para los creadores).
- **Tareas concretas:**
  1. Subir la web a un hosting gratuito con el `.zip` generado:
     `/home/hecpiqbel/studia-ia-web.zip` → Netlify Drop o Cloudflare Pages.
  2. Hacer que la app arranque **siempre en modo Premium** (perfil `premium` por
     defecto) para que se vean todas las funciones sin login.
  3. Crear `.gitignore` básico (sistema operativo, logs).
  4. Revisar y mergear las PRs de los demás.
  5. Crear Issues de seguimiento y vigilar que `node tools/check.js` siempre
     pase.

### Carles · Agenda & Horario
- **Rama:** `carles`
- **Módulos asignados:** `calendar.js`, `schedule.js`
- **Objetivo actual:** pulir calendario y horario, sobre todo en móvil.
- **Tareas concretas:**
  1. Añadir **estados vacíos** con acción en `calendar.js` (por ejemplo:
     "No hay eventos esta semana. Añadir evento").
  2. Añadir estados vacíos en `schedule.js` cuando no haya clases programadas.
  3. Probar en móvil: calendario a 360/390 px y que el scroll horizontal del
     horario siga funcionando con la columna de horas fija.
  4. Revisar la creación/edición de eventos (tipo, fecha, festivos).

### Joan · Estudio & Progreso
- **Rama:** `joan`
- **Módulos asignados:** `study.js`, `progress.js`
- **Objetivo actual:** que el pomodoro sea fiable y el progreso se vea claro.
- **Tareas concretas:**
  1. Probar el pomodoro a fondo: arrancar, recargar página, cerrar pestaña,
     volver, pausar y resetear. (Ya se guarda, pero hay que confirmarlo a mano.)
  2. Revisar `progress.js`: mapa de calor, gráfico diario, horas por asignatura,
     racha y recompensas/hitos.
  3. Que se vean bien los estados con **0 sesiones** y con muchas sesiones.
  4. Revisar que el `dashboard.js` de Héctor coja bien racha/nivel/XP.

### Alex · Organización + Comunidad + Premium
- **Rama:** `alex`
- **Módulos asignados:** `tasks.js`, `subjects.js`, `social.js`, `premium.js`
- **Objetivo actual:** dejar el bloque de "gestión y comunidad" listo para
  presentarlo.
- **Tareas concretas:**
  1. `tasks.js`: filtros por estado/prioridad/asignatura y marcar vencidas.
  2. `subjects.js`: asignaturas y apuntes (enlaces y ficheros ficticios).
  3. `social.js`: foro, me gusta y respuestas.
  4. `premium.js`: dejar claro que ahora mismo es **acceso completo** para los
     creadores, no "activar premium".

---

## 2) Cómo debe trabajar el agente de IA

Cuando un miembro del grupo entre en el repo con su agente de IA y busque
"qué tengo que hacer yo", el agente debe:

1. **Identificar su rol** cuando la persona diga su nombre (Héctor, Carles,
   Joan o Alex) usando la tabla de arriba.
2. **Solo trabajar dentro de los módulos asignados** a ese rol.
3. Si necesita un cambio en `core/` (router, store, db, ui, utils) o en otro
   módulo, **debe abrir una Issue** para el coordinador en lugar de tocarlo.
4. Antes de proponer un commit, ejecutar `node tools/check.js`. Si falla, no
   se puede subir.
5. Al terminar la tarea, preparar un commit claro (no "Web Base") con
   `feat:` o `fix:` y explicar qué se ha hecho en el commit/PR.

---

## 3) Reglas de trabajo

- **No tocar `store.js`, `db.js`, `router.js`, `ui.js`, `utils.js`** salvo que
  lo indique el coordinador. Acabamos de dejar una base estable con
  `Web Base`, no la rompamos sin motivo.
- **No subir directo a `main`.** Siempre desde una rama con Pull Request.
- **Ejecutar `node tools/check.js` antes de cada push.** Si algo falla, se
  arregla antes. Si se toca el núcleo, abrir también `tests.html`.
- **Mensajes de commit útiles:** `feat(calendar): estado vacío cuando no hay eventos` o
  `fix(study): el pomodoro no se recuperaba al recargar`.
- **Si tenéis una duda de arquitectura, preguntad al coordinador** antes de
  implementar algo raro.

---

## 4) Flujo de trabajo (cada miembro)

1. `git checkout main && git pull origin main`
2. `git checkout <tu-nombre>` (la rama ya existe: `hector`, `carles`, `joan` o `alex`)
3. Trabajar **solo** en tus módulos asignados.
4. `node tools/check.js` → que dé verde.
5. `git add .` → `git commit -m "..."` → `git push -u origin ...`
6. Abrir **Pull Request** hacia `main`.
7. Coordinador revisa y mergea.

---

## 5) Publicación actual

- **Repositorio:** `https://github.com/Studia-IA/Studia-IA`
- **Ramas:** `main` (estable) + `hector`, `carles`, `joan`, `alex` (una por persona)
- **Base local:** XAMPP → `http://localhost/htdocs_hecpiqbel/proyecto_grupo_prog/`
- **Zip listo para publicar:** `/home/hecpiqbel/studia-ia-web.zip` (solo web, sin docs ni tests)
