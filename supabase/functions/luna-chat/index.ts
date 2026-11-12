// ============================================================
// Studia-IA · Edge Function "luna-chat" (Fase A)
// ------------------------------------------------------------
// El frontend NO conoce la clave de Groq: llama aquí con el JWT
// del usuario logado (Supabase Auth) y esta función hace la
// llamada a Groq con GROQ_API_KEY (secreto del proyecto).
//
// Despliegue (con la CLI de Supabase, desde la carpeta del repo):
//   supabase functions deploy luna-chat
//
// La función se despliega con verify_jwt ACTIVADO (el valor por
// defecto): el gateway de Supabase valida el JWT antes de que corra
// este código y devuelve 401 si falta o no es válido. Por eso el
// `auth.getUser()` de más abajo es una doble comprobación (defensa
// en profundidad), no la única barrera.
//
// Secrets del proyecto (Dashboard → Edge Functions → Secrets):
//   GROQ_API_KEY     → la clave del proyecto Studia-IA
//   SUPABASE_URL     → la URL del proyecto
//   SUPABASE_ANON_KEY→ la anon key (pública, la misma del frontend)
//   ALLOWED_ORIGINS  → "http://localhost,https://studia-ia.netlify.app"
//
// Petición  POST  { messages: [{role:'me'|'ai', text:string}, ...] }
//   (los últimos ≤ 8 mensajes; el frontend manda también `context`
//    con los datos de estudio del usuario)
// Respuesta 200   { text: "..." }
//           400   { error: 'mensaje_no_valido' }
//           401   { error: 'no_autenticado' }
//           403   { error: 'origen_no_permitido' }
//           502   { error: 'luna_no_disponible' }
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-20b";
const MAX_MESSAGES = 8;
const MAX_TOTAL_CHARS = 4000;
const GROQ_TIMEOUT_MS = 25000;

// ------------------------------------------------------------
// CORS y orígenes
// ------------------------------------------------------------
function allowedOrigins(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS") || "";
  const list = raw.split(",").map((o) => o.trim()).filter(Boolean);
  // En local (XAMPP) el origen puede llevar puerto: se normaliza para
  // que "http://localhost:8080" también valga con ALLOWED_ORIGINS=http://localhost.
  return list;
}

function originAllowed(origin: string | null): boolean {
  if (!origin) return false;
  const list = allowedOrigins();
  if (list.includes(origin)) return true;
  try {
    const u = new URL(origin);
    const base = u.protocol + "//" + u.hostname;
    return list.includes(base);
  } catch {
    return false;
  }
}

function corsHeaders(origin: string | null): Record<string, string> {
  // Sin Origin (curl, extensiones, same-origin): no mandamos CORS.
  const allow = originAllowed(origin) ? (origin as string) : "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(status: number, body: unknown, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

// ------------------------------------------------------------
// System prompt de Luna (mismo espíritu que el motor local)
// ------------------------------------------------------------
function lunaSystem(context: Record<string, unknown>): string {
  const profile = (context.profile ?? {}) as Record<string, string>;
  const subjects = (context.subjects ?? []) as Array<{ name?: string }>;
  const openTasks = (context.openTasks ?? []) as Array<{ title?: string; due?: string }>;
  const nextExam = context.nextExam as { title?: string; date?: string } | null;
  const minutes = context.minutesToday ?? 0;

  const lines = [
    "Eres Luna, la asistente de estudio de la app Studia-IA.",
    "Idioma: español, en todo momento y sin excepciones. Tutea al estudiante.",
    "Responde SIEMPRE de forma directa, como si hablaras con un compañero. 2-4 frases o una lista de 3-5 puntos.",
    "PROHIBIDO escribir tu razonamiento, tus notas internas o comentarios sobre cómo vas a responder. Solo la respuesta final.",
    "Usas SOLO los datos del contexto; no inventes tareas, fechas ni asignaturas.",
    `Perfil: ${profile.name || "estudiante"}, curso ${profile.course || "-"}.`,
    `Minutos de estudio de hoy: ${minutes}.`,
    `Asignaturas: ${subjects.map((s) => s.name).filter(Boolean).join(", ") || "ninguna"}.`,
    nextExam
      ? `Próximo examen: ${nextExam.title} el ${nextExam.date}.`
      : "No hay exámenes próximos.",
    openTasks.length
      ? `Tareas abiertas: ${openTasks.map((t) => `${t.title} (vence ${t.due})`).join("; ")}.`
      : "No hay tareas abiertas.",
    "Si piden un plan, da pasos realizables con pomodoros de 25 minutos.",
  ];
  return lines.join("\n");
}

// ------------------------------------------------------------
// Validación de la entrada del cliente
// ------------------------------------------------------------
function cleanMessages(raw: unknown): Array<{ role: string; content: string }> {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) return [];
  const msgs: Array<{ role: string; content: string }> = [];
  let total = 0;
  for (const m of raw) {
    if (!m || typeof m !== "object") return [];
    const role = m.role === "ai" ? "assistant" : m.role === "me" ? "user" : null;
    const text = typeof m.text === "string" ? m.text.trim() : "";
    if (!role || !text) return [];
    total += text.length;
    if (total > MAX_TOTAL_CHARS) return [];
    msgs.push({ role, content: text });
  }
  // el último tiene que ser del usuario
  if (msgs[msgs.length - 1].role !== "user") return [];
  return msgs;
}

// ------------------------------------------------------------
// Groq
// ------------------------------------------------------------
async function askGroq(
  messages: Array<{ role: string; content: string }>,
  signal?: AbortSignal,
): Promise<string> {
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) throw new Error("Falta el secreto GROQ_API_KEY");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature: 0.6,
        max_tokens: 400,
      }),
    });
    if (!res.ok) throw new Error(`Groq ${res.status}`);
    const data = await res.json();
    const choice = data?.choices?.[0]?.message;
    const content = String(choice?.content || "").replace(/<\|[^|>]*\|>/g, "").trim();
    if (!content) throw new Error("respuesta vacía de Groq");
    return content;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

// ------------------------------------------------------------
// Handler
// ------------------------------------------------------------
Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    if (origin && !originAllowed(origin)) return json(403, { error: "origen_no_permitido" }, origin);
    // 200 (no 204) para evitar el "null body status": una respuesta 204
    // no admite cuerpo y Deno lanza si se pasa uno. Sin cuerpo + 200 es
    // lo más seguro para el preflight CORS.
    return new Response(null, { status: 200, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json(405, { error: "metodo_no_permitido" }, origin);
  }

  if (origin && !originAllowed(origin)) {
    return json(403, { error: "origen_no_permitido" }, origin);
  }

  // 1) Autenticación: JWT del usuario, verificado en el servidor
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return json(401, { error: "no_autenticado" }, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!supabaseUrl || !anonKey) {
    return json(500, { error: "funcion_no_configurada" }, origin);
  }

  const admin = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}`, apikey: anonKey } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let userId: string | null = null;
  try {
    const { data, error } = await admin.auth.getUser(token);
    if (!error && data?.user) userId = data.user.id;
  } catch {
    /* token inválido → abajo devolvemos 401 */
  }
  if (!userId) return json(401, { error: "no_autenticado" }, origin);

  // 2) Entrada validada
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "mensaje_no_valido" }, origin);
  }

  const history = cleanMessages(body.messages);
  if (!history.length) return json(400, { error: "mensaje_no_valido" }, origin);

  const context =
    body.context && typeof body.context === "object"
      ? (body.context as Record<string, unknown>)
      : {};

  const messages = [
    { role: "system", content: lunaSystem(context) },
    ...history,
  ];

  // 3) Groq, con cancelación si el cliente aborta
  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort());

  try {
    const text = await askGroq(messages, abort.signal);
    return json(200, { text }, origin);
  } catch (err) {
    console.error("luna-chat:", userId, (err as Error).message);
    try {
      return json(502, { error: "luna_no_disponible" }, origin);
    } catch {
      // el cliente canceló la petición: no hay a quién responder
      return new Response(null, { status: 502 });
    }
  }
});
