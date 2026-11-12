# Hoja de ruta: pendiente y mejoras futuras

Estado tras la publicación de la 0.5.5 (login obligatorio + Supabase + IA real).
Aquí queda apuntado lo que toca después, para cuando el grupo lo decida.

---

## 1. Qué ya está hecho

- **Autenticación** con Supabase (email + contraseña), login obligatorio.
- **Base de datos**: blob `state` por usuario con Row Level Security (RLS).
- **Roles y plan**: `profiles.role` (free/premium/admin) y `profiles.plan`
  (free/premium); los admins se asignan a mano desde el panel.
- **Luna con IA real**: Edge Function `luna-chat` llama a Groq con la clave en
  un secreto de Supabase (el navegador no la ve), con caída al motor local.
- **Onboarding** de bienvenida (nombre, curso, asignaturas, objetivo, centro y
  comunidad autónoma), repetible desde Ajustes.
- **Ajustes** reorganizados en 4 secciones (Mi cuenta, Preferencias de estudio,
  Plan, Información), recuperación de contraseña, "Empezar de cero".
- **17 comunidades autónomas** para los festivos.

---

## 2. Pendiente de configuración (grupo, no código)

- Activar la **confirmación de email** en Supabase antes de publicar en serio.
  (Hoy está desactivada; con ella activada el reset de contraseña es fiable.)
- Comprobar que los 4 creadores tienen `role = 'admin'` y `plan = 'premium'`
  desde el panel (SQL al final de `sql/supabase/01_esquema.sql`).

---

## 3. Mejoras futuras

### 3.1. Gating real por plan (prioridad alta cuando se definan funciones)

Hoy "Free/Premium" es solo informativo: nadie tiene funciones restringidas.
Cuando el grupo decida qué entra en cada plan (ver `docs/planes.md`):

- Límite de mensajes a Luna para `free` en la Edge Function (tabla `ai_usage`).
- Ocultar/activar vistas o botones según `profiles.plan` en el frontend.
- Pasar `plan` del perfil al contexto de la Edge Function.

### 3.2. Confirmación de email y reset fiable

- Activar confirmación de email en Auth → Settings.
- Validar el flujo completo de "he olvidado mi contraseña" (redirect a la app,
  pantalla de nueva contraseña). El `redirectTo` ya apunta al origen correcto.

### 3.3. Onboarding ampliado (opcional)

- Código de asignatura, aula, profesor/a y créditos al crearlas en el wizard.
- Preguntar festivos por centro/universidad si se quiere más precisión.

### 3.4. Login social (opcional, más adelante)

- Google / GitHub con Supabase Auth (en el plan free solo Google está limitado
  a dominios). Requiere configurarlo en el panel y añadir los botones al login.

### 3.5. Panel de administración (opcional)

- Vista solo para `role='admin'` que liste usuarios y permita cambiar plan.
- Requiere una política RLS nueva (admin lee/escribe todo) — ver nota en
  `sql/supabase/01_esquema.sql`.

---

## 4. Orden sugerido

1. Que el grupo pruebe la 0.5.5 y dé feedback.
2. Activar confirmación de email.
3. Definir funciones por plan (reunión) y montar el gating real.
4. El resto, según prioridad del grupo.
