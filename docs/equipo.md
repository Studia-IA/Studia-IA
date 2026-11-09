# Equipo · Studia-IA

**Repositorio:** <https://github.com/Studia-IA/Studia-IA>

## Roles

| Persona | Rol | Zona del código | Rama |
|---|---|---|---|
| **Héctor** | Coordinador · Publicación y Luna (IA) | `index.html`, `main.js`, `core/`, `ai.js`, `dashboard.js` | `hector` |
| **Alex** | Organización, Comunidad y Premium | `tasks.js`, `subjects.js`, `social.js`, `premium.js` | `alex` |
| **Joan** | Estudio y Progreso | `study.js`, `progress.js` | `joan` |
| **Carles** | Calendario y Horario | `calendar.js`, `schedule.js` | `carles` |

Cada miembro revisa y mergea sus propias PRs con ayuda del coordinador, que es
el que tiene la última palabra sobre el núcleo (`core/`) y sobre lo que entra
en `main`.

## Cuatro reglas para trabajar juntos

1. **Solo tocas tu zona.** Si necesitas cambiar `core/`, `index.html` o el
   módulo de otra persona, no lo toques: abre una Issue o avisa en el chat y
   propone el cambio.
2. **Nada entra en `main` directamente.** Se trabaja en la rama de cada uno
   (`hector`, `carles`, `joan`, `alex`) y todo se integra con **Pull Request**
   revisada.
3. **`node tools/check.js` en verde antes de cada push.** Si falla, se arregla
   antes de commit. Si se toca el núcleo, además se comprueba `tests.html`.
4. **Comunicación antes que conflicto:** commits descriptivos en español
   (`feat(calendar): …`, `fix(study): …`), dudas preguntadas antes de inventar
   comportamiento, y los problemas de fuera de tu zona se describen, no se
   arreglan por tu cuenta.

El detalle completo del reparto está en [`roles-y-tareas.md`](roles-y-tareas.md)
y las normas técnicas en [`../AGENTS.md`](../AGENTS.md).

