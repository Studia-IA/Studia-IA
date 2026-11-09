# Notas de revisión · Studia-IA

Héctor revisa lo que llega a `main` y deja aquí lo que falta o se puede mejorar.
**Cada persona lee solo su sección** antes de empezar. Si no aparece tu nombre,
no tienes nada pendiente.

Última revisión: tras el PR #4 de Carles (versión 0.3.1).

---

## Carles · Calendario y Horario

**Verificado y correcto (no rehacer):**
- Horario `L–D`: cabecera y columnas quedan alineadas al píxel (7/7).
- Botones de editar/eliminar a 36 px en móvil: correcto.
- Estado vacío de la agenda: el botón "Añadir evento" funciona.

**Pendiente / fallos:**
> ⚠️ **Acción inmediata para tu agente (Carles)**: ejecuta primero
> `git checkout carles && git merge main`. `main` ya trae el arreglo de
> `core/ui.js` (versión 0.3.2). **Sin eso no sigas**: el botón "Eliminar
> evento" solo funciona en tu rama después de traer `main`. Después aplica
> los dos ajustes siguientes y abre PR.
- [ ] Con `main` ya fusionado, **tu botón de eliminar funciona tal cual**
      (verificado en local y en producción). Aun así, limpia el apaño: quita
      el `onOpen` de `openEventForm` y pasa el botón con
      `ui.formModal({ ..., beforeBody: barraConBotonEliminar, ... })`, que es
      la forma estable.
- [ ] `removeEvent(e)` desde la lista de eventos deja el modal de edición
      abierto encima (el `refresh()` pasa antes de que se resuelva el
      confirm). Añade `ui.closeAllModals()` dentro del `.then()`, justo antes
      de `store.remove(...)`, y quita el parámetro `modalApi` (ya no hace
      falta).
- [ ] El botón de "Añadir evento" solo está en el estado vacío de la agenda;
      en móvil el panel del día queda con "Sin eventos este día." sin botón
      (a 390 px el calendario es de puntos y no se ve). Añádelo también ahí.
- [ ] Mensajes de commit **en español** (lo pide `AGENTS.md`).

---

> **Nota de Héctor (IA real Groq, 0.4.x):** he fusionado `main` en mi rama y he
> probado el merge con tu rama `carles`: **sin conflictos** en git. Como el merge
> toca ficheros compartidos (`base.css`, `layout.css`, `views.css`, `main.js`,
> `index.html`, `tests.html`, `package.json`), al abrir tu PR hacia `main` mira
> que el CI (`tools/check.js`) salga en verde; si algo de mi parte te pisa una
> norma que tú cambiaste, dímelo y lo hablamos antes de fusionar.


## Alex · Tareas, Asignaturas, Comunidad y Premium

**Verificado y correcto (no rehacer):**
- Filtro por prioridad: funciona (oculta las demás prioridades).
- Posponer vencida 7 días: funciona y actualiza la fecha.
- Guard `inited`: evita suscriptores duplicados al volver a la vista.
- Selector `.segmented.task-filters`, `aria-label` del select de prioridad y
  `premium.js` en modo creadores: **arreglado y comprobado**. Nada pendiente
  de la revisión anterior.

**Siguiente paso (lo que toca ahora):**
- [ ] Antes de nada: `git checkout alex && git merge main` (así tienes el
      arreglo de `core/ui.js` de la 0.3.2 y sigues las reglas de ramas).
- [ ] Quedan vistas de tu rol sin revisar: `subjects.js` (asignaturas y
      apuntes) y `social.js` (foro, me gusta, respuestas). Revisa estados
      vacíos y que en móvil (360/390 px) no se descuadre nada.
- [ ] En la PR de cada mejora, cuenta en 2 líneas qué hace (para revisarla
      rápido).

---

## Joan · Estudio y Progreso

**Estado:** la rama `joan` todavía no tiene commits propios.

**Para empezar:**
- [ ] `git checkout main && git pull` y luego `git checkout joan`.
- [ ] `git merge main` para traer los últimos cambios (tareas, calendario...).
- [ ] Empieza por lo de `docs/roles-y-tareas.md`: pomodoro (arrancar, pausar,
      recargar, cerrar pestaña) y estados con 0 sesiones en `progress.js`.
- [ ] Prueba el pomodoro en un móvil real o en DevTools a 390 px.

---

## General

- Antes de cada push: `node tools/check.js` en verde.
- Si tocas `core/`: abre además `tests.html` y confirma que pasa.
- Al abrir un PR, avisa a Héctor. No fusiones tú a `main`.
- No toques archivos de otra persona: si hace falta un cambio ahí, avisa.
