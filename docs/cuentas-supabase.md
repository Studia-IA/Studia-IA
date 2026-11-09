# Empezar a usar la app con tu cuenta (Supabase)

Guía para los miembros del grupo. A partir de ahora la app **exige iniciar
sesión**: cada uno usa su propia cuenta y sus datos se guardan en la nube
(Supabase), no en el navegador.

> Estado actual: este cambio está en la rama `hector` y **aún no en `main`**.
> Sigue esta guía cuando el grupo apruebe el cambio y lo fusionemos.

---

## 1. Qué ha cambiado

| Antes | Ahora |
|---|---|
| Se abría con doble clic (`file://`) | Solo vía **XAMPP** o **Netlify** |
| Sin cuentas; todo en `localStorage` | **Login obligatorio** con email/contraseña |
| Datos de ejemplo para todos | Usuario nuevo arranca **vacío** |
| Clave de Groq en el navegador | Clave en un secreto de Supabase (Edge Function) |

La clave de la IA ya **no** viaja en el navegador: la Edge Function `luna-chat`
la usa internamente. Tú no tienes que configurar nada para hablar con Luna.

---

## 2. Requisitos previos

- Tener el repo actualizado en tu ordenador (o Codespaces).
- **XAMPP** arrancado, o usar el **Deploy Preview de Netlify**.

La URL local es:

```
http://localhost/htdocs_hecpiqbel/proyecto_grupo_prog/
```

(Recuerda: `file://` ya no funciona porque Supabase necesita un servidor.)

---

## 3. Pasos de cada compañero

### 3.1. Traer el código

Cuando el cambio esté en `main`:

```bash
git checkout main
git pull origin main
git checkout tu-rama        # hector, carles, joan o alex
git merge main
```

### 3.2. Crear tu cuenta (primera vez)

1. Abre la app en XAMPP o Netlify.
2. En la pantalla de acceso pulsa **"Crear cuenta"**.
3. Escribe tu **email personal** (el mismo que usamos en el grupo) y una
   contraseña (mínimo 6 caracteres).
4. Pulsa **"Crear cuenta"**.

Se crea la cuenta con rol **`free`** automáticamente (un *trigger* en
Supabase crea tu perfil). Empezarás con la app **vacía**: sin horarios ni
asignaturas de otro, como debe ser.

### 3.3. Iniciar sesión (días siguientes)

1. Abre la app.
2. En "Entrar", escribe tu email y contraseña.

La sesión se guarda en el navegador: si no cierras sesión, al volver entras
directamente.

### 3.4. Cerrar sesión

Avatar (arriba a la derecha) → **"Cerrar sesión"**. Tus datos quedan
guardados en tu cuenta.

---

## 4. Tus datos: vacíos la primera vez, y la migración del prototipo

- **Usuario nuevo** → arranca vacío (nada de datos de ejemplo).
- **Si ya habías probado el prototipo en ese navegador** → la primera vez que
  entres, tus datos locales de prueba se suben **una sola vez** a tu cuenta
  (verás un aviso "Tus datos de prueba se han subido a tu cuenta").

Todo lo que guardes a partir de ahí va a la nube y lo verás en cualquier
dispositivo donde entres con tu cuenta.

---

## 5. Roles: free, premium y admin

| Rol | Quién | Qué puede |
|---|---|---|
| `free` | cualquier usuario nuevo (por defecto) | Usar la app normal |
| `premium` | reservado para el futuro sistema de pago | — |
| `admin` | **los 4 creadores** (nosotros) | Se asigna a mano, no automático |

Los roles **no** se cambian desde la app (ni siquiera por nosotros). Para
hacernos `admin`, Héctor ejecuta una sola vez en el SQL Editor de Supabase:

```sql
update public.profiles set role = 'admin'
where user_id in (
  select id from auth.users
  where email in ('correo1', 'correo2', 'correo3', 'correo4')
);
```

(Esa línea con correos vive solo en el panel de Supabase, nunca en el repo.)

---

## 6. Luna (IA real)

- Luna responde con IA real a través de la Edge Function de Supabase.
- **No hace falta configurar nada**: la clave de Groq está en los *Secrets* del
  proyecto, no en tu navegador.
- Si la IA falla (sin conexión o límite temporal de Groq), Luna responde en
  **modo local** con un aviso; el chat nunca se queda vacío.

---

## 7. Notas rápidas

- **Cada uno en su rama, como siempre.** No trabajes sobre `main`.
- Antes de subir cambios: `node tools/check.js` en verde.
- La `ANON_KEY` de Supabase sí va en el código (es pública por diseño); la
  **`service_role`** no aparece por ningún sitio.
