const ITERATIONS = 210000;
const SESSION_DAYS = 7;
const USERNAME_RE = /^[a-zA-Z0-9_-]{3,20}$/;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });
}
function fail(message, status = 400) { return json({ error: message }, status); }
function nowIso() { return new Date().toISOString(); }
function randomId() { return crypto.randomUUID(); }
function bytesToB64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function b64ToBytes(value) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToB64(new Uint8Array(digest));
}
async function passwordHash(password, saltB64, iterations = ITERATIONS, onStage = null) {
  onStage?.("hachage_generation_sel");
  const salt = saltB64 ? b64ToBytes(saltB64) : crypto.getRandomValues(new Uint8Array(16));

  onStage?.("hachage_importation_cle");
  const passwordBytes = new TextEncoder().encode(password);
  const material = await crypto.subtle.importKey(
    "raw",
    passwordBytes,
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  onStage?.("hachage_derive_bits");
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: { name: "SHA-256" }, salt, iterations },
    material,
    256
  );

  onStage?.("hachage_encodage_resultat");
  return { hash: bytesToB64(new Uint8Array(bits)), salt: bytesToB64(salt), iterations };
}
function cookieValue(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  for (const part of cookie.split(";")) {
    const pair = part.trim().split("=");
    if (pair.shift() === name) return pair.join("=");
  }
  return null;
}
function setCookie(token) {
  return "sid=" + token + "; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=" + (SESSION_DAYS * 86400);
}
function clearCookie() { return "sid=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"; }
async function bodyJson(request) {
  const raw = await request.text();
  if (raw.length > 100000) throw new Error("Données trop volumineuses.");
  try { return JSON.parse(raw || "{}"); } catch { throw new Error("Format JSON invalide."); }
}
function cleanText(value, max = 5000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
async function auth(request, env) {
  const token = cookieValue(request, "sid");
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(
    "SELECT u.id, u.username, u.role, u.score FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?"
  ).bind(tokenHash, nowIso()).first();
  return row || null;
}
function requireOrigin(request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}
function validateSections(sections) {
  if (!Array.isArray(sections) || sections.length < 1 || sections.length > 25) return null;
  const result = [];
  for (const section of sections) {
    const name = cleanText(section?.name, 120);
    const rule = cleanText(section?.rule, 4000);
    const exception = cleanText(section?.exception, 2000);
    if (!name || !rule) return null;
    result.push({ name, rule, exception });
  }
  return result;
}
function validateQuestions(questions) {
  if (!Array.isArray(questions) || questions.length < 3 || questions.length > 30) return null;
  const result = [];
  for (const q of questions) {
    const type = q?.type;
    const prompt = cleanText(q?.prompt, 1000);
    const explanation = cleanText(q?.explanation, 1200);
    if (!prompt || !["choice", "boolean", "text"].includes(type)) return null;
    if (type === "choice") {
      if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6) return null;
      const options = q.options.map(v => cleanText(v, 300));
      if (options.some(v => !v) || !Number.isInteger(q.answer) || q.answer < 0 || q.answer >= options.length) return null;
      result.push({ type, prompt, options, answer: q.answer, explanation });
    } else if (type === "boolean") {
      if (typeof q.answer !== "boolean") return null;
      result.push({ type, prompt, answer: q.answer, explanation });
    } else {
      const accepted = Array.isArray(q.accepted) ? q.accepted.map(v => cleanText(v, 300)).filter(Boolean) : [];
      if (!accepted.length && typeof q.answer === "string" && q.answer.trim()) accepted.push(q.answer.trim());
      if (!accepted.length) return null;
      result.push({ type, prompt, accepted: [...new Set(accepted)], explanation });
    }
  }
  return result;
}
function publicQuestion(q) {
  if (q.type === "choice") return { type: q.type, prompt: q.prompt, options: q.options };
  return { type: q.type, prompt: q.prompt };
}
function normalizeAnswer(value) {
  return String(value ?? "").normalize("NFC").trim().toLocaleLowerCase("fr").replace(/\s+/g, " ");
}
function isCorrect(question, answer) {
  if (question.type === "choice") return Number.isInteger(answer) && answer === question.answer;
  if (question.type === "boolean") return typeof answer === "boolean" && answer === question.answer;
  return typeof answer === "string" && question.accepted.some(expected => normalizeAnswer(expected) === normalizeAnswer(answer));
}
async function handle(request, env) {
  if (!env.DB) return fail("La base de données D1 n’est pas encore reliée. Consulte le guide d’installation.", 503);
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method.toUpperCase();
  if (method === "GET" && path === "/api/health") return json({ ok: true });
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && !requireOrigin(request)) return fail("Origine de requête non autorisée.", 403);

  if (method === "GET" && path === "/api/me") {
    const current = await auth(request, env);
    const admin = await env.DB.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").first();
    return json({
      user: current ? { id: current.id, username: current.username, role: current.role, score: current.score } : null,
      adminSetupAvailable: !admin && Boolean(env.ADMIN_SETUP_KEY && env.ADMIN_USERNAME)
    });
  }

  if (method === "POST" && path === "/api/admin/setup") {
    let stage = "lecture";

    try {
      const body = await bodyJson(request);

      stage = "configuration";
      if (!env.ADMIN_SETUP_KEY || !env.ADMIN_USERNAME || !body.setupKey || body.setupKey !== env.ADMIN_SETUP_KEY) {
        return fail("Clé d’initialisation incorrecte.", 403);
      }

      stage = "verification_admin";
      const existing = await env.DB.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").first();
      if (existing) return fail("Le compte administrateur est déjà initialisé.", 409);

      stage = "validation";
      const username = cleanText(body.username, 20);
      const password = typeof body.password === "string" ? body.password : "";
      if (username.toLocaleLowerCase("fr") !== String(env.ADMIN_USERNAME).toLocaleLowerCase("fr")) {
        return fail("Utilise le nom d’administrateur défini dans la configuration.", 400);
      }
      if (!USERNAME_RE.test(username) || password.length < 10 || password.length > 200) {
        return fail("Nom invalide ou mot de passe trop court (10 caractères minimum).", 400);
      }

      stage = "verification_identifiant";
      const nameExists = await env.DB.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE").bind(username).first();
      if (nameExists) return fail("Ce nom est déjà utilisé.", 409);

      stage = "hachage_mot_de_passe";
      const hashed = await passwordHash(password, undefined, ITERATIONS, value => { stage = value; });

      stage = "insertion_base_de_donnees";
      const id = randomId();
      await env.DB.prepare("INSERT INTO users (id, username, password_hash, password_salt, password_iterations, role, score, created_at) VALUES (?, ?, ?, ?, ?, 'admin', 0, ?)")
        .bind(id, username, hashed.hash, hashed.salt, hashed.iterations, nowIso()).run();

      return json({ ok: true, message: "Compte administrateur créé. Tu peux maintenant te connecter." }, 201);
    } catch (error) {
      console.error("ADMIN SETUP ERROR:", stage, error?.stack || error);
      return json({
        error: "Erreur pendant l'initialisation.",
        stage,
        errorType: error?.name || "UnknownError"
      }, 500);
    }
  }

  if (method === "POST" && path === "/api/auth/register") {
    const body = await bodyJson(request);
    const username = cleanText(body.username, 20);
    const password = typeof body.password === "string" ? body.password : "";
    if (!USERNAME_RE.test(username)) return fail("L’identifiant doit contenir 3 à 20 caractères (lettres, chiffres, _ ou -).");
    if (env.ADMIN_USERNAME && username.toLocaleLowerCase("fr") === String(env.ADMIN_USERNAME).toLocaleLowerCase("fr")) return fail("Cet identifiant est réservé.");
    if (password.length < 8 || password.length > 200) return fail("Le mot de passe doit contenir au moins 8 caractères.");
    const hashed = await passwordHash(password);
    const id = randomId();
    try {
      await env.DB.prepare("INSERT INTO users (id, username, password_hash, password_salt, password_iterations, role, score, created_at) VALUES (?, ?, ?, ?, ?, 'student', 0, ?)")
        .bind(id, username, hashed.hash, hashed.salt, hashed.iterations, nowIso()).run();
    } catch { return fail("Cet identifiant est déjà utilisé.", 409); }
    const token = bytesToB64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
      .bind(await sha256(token), id, new Date(Date.now() + SESSION_DAYS * 86400000).toISOString(), nowIso()).run();
    return json({ user: { id, username, role: "student", score: 0 } }, 201, { "set-cookie": setCookie(token) });
  }

  if (method === "POST" && path === "/api/auth/login") {
    const body = await bodyJson(request);
    const username = cleanText(body.username, 40);
    const password = typeof body.password === "string" ? body.password : "";
    const found = await env.DB.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").bind(username).first();
    if (!found || password.length > 200) return fail("Identifiant ou mot de passe incorrect.", 401);
    const candidate = await passwordHash(password, found.password_salt, found.password_iterations);
    if (candidate.hash !== found.password_hash) return fail("Identifiant ou mot de passe incorrect.", 401);
    const token = bytesToB64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
      .bind(await sha256(token), found.id, new Date(Date.now() + SESSION_DAYS * 86400000).toISOString(), nowIso()).run();
    return json({ user: { id: found.id, username: found.username, role: found.role, score: found.score } }, 200, { "set-cookie": setCookie(token) });
  }

  if (method === "POST" && path === "/api/auth/logout") {
    const token = cookieValue(request, "sid");
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
    return json({ ok: true }, 200, { "set-cookie": clearCookie() });
  }

  const currentUser = await auth(request, env);
  if (path.startsWith("/api/admin/") && path !== "/api/admin/setup") {
    if (!currentUser) return fail("Connecte-toi pour continuer.", 401);
    if (currentUser.role !== "admin") return fail("Accès réservé à l’administration.", 403);
  }

  if (method === "GET" && path === "/api/rules") {
    const rows = await env.DB.prepare("SELECT id, title, sections_json, created_at, updated_at FROM rules ORDER BY created_at DESC").all();
    return json({ rules: (rows.results || []).map(r => ({ id: r.id, title: r.title, sections: JSON.parse(r.sections_json), createdAt: r.created_at, updatedAt: r.updated_at })) });
  }
  if (method === "GET" && path === "/api/exercises") {
    const rows = await env.DB.prepare("SELECT e.id, e.rule_id, e.title, e.description, e.created_at, r.title AS rule_title FROM exercise_sets e JOIN rules r ON r.id = e.rule_id ORDER BY e.created_at DESC").all();
    return json({ exercises: rows.results || [] });
  }
  if (method === "GET" && path === "/api/leaderboard") {
    const rows = await env.DB.prepare("SELECT username, score FROM users ORDER BY score DESC, username COLLATE NOCASE ASC LIMIT 20").all();
    return json({ leaderboard: rows.results || [] });
  }
  if (method === "GET" && path === "/api/admin/users") {
    const rows = await env.DB.prepare("SELECT username, role, score, created_at FROM users ORDER BY created_at ASC").all();
    return json({ users: rows.results || [] });
  }

  if (method === "POST" && path === "/api/quiz/start") {
    if (!currentUser) return fail("Connecte-toi pour commencer un quiz.", 401);
    const body = await bodyJson(request);
    const set = await env.DB.prepare("SELECT id, questions_json FROM exercise_sets WHERE id = ?").bind(cleanText(body.exerciseSetId, 80)).first();
    if (!set) return fail("Cette série d’exercices n’existe plus.", 404);
    const questions = JSON.parse(set.questions_json);
    const id = randomId();
    await env.DB.prepare("INSERT INTO quiz_sessions (id, user_id, exercise_set_id, questions_json, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(id, currentUser.id, set.id, JSON.stringify(questions), nowIso()).run();
    return json({ sessionId: id, questions: questions.map(publicQuestion) }, 201);
  }

  if (method === "POST" && path === "/api/quiz/submit") {
    if (!currentUser) return fail("Connecte-toi pour envoyer tes réponses.", 401);
    const body = await bodyJson(request);
    const sessionId = cleanText(body.sessionId, 80);
    const answers = Array.isArray(body.answers) ? body.answers : [];
    const quiz = await env.DB.prepare("SELECT * FROM quiz_sessions WHERE id = ? AND user_id = ?").bind(sessionId, currentUser.id).first();
    if (!quiz) return fail("Session de quiz introuvable.", 404);
    if (quiz.submitted_at) return fail("Ce quiz a déjà été corrigé.", 409);
    const questions = JSON.parse(quiz.questions_json);
    if (answers.length !== questions.length) return fail("Le nombre de réponses ne correspond pas au quiz.");
    const results = questions.map((q, index) => ({
      index,
      correct: isCorrect(q, answers[index]),
      explanation: q.explanation || "",
      expected: q.type === "choice" ? q.options[q.answer] : q.type === "boolean" ? (q.answer ? "Vrai" : "Faux") : q.accepted[0]
    }));
    const total = results.reduce((sum, item) => sum + (item.correct ? 1 : -1), 0);
    const finalized = await env.DB.prepare("UPDATE quiz_sessions SET submitted_at = ? WHERE id = ? AND submitted_at IS NULL").bind(nowIso(), sessionId).run();
    if (!finalized.meta || finalized.meta.changes !== 1) return fail("Ce quiz a déjà été corrigé.", 409);
    const operations = results.map(item => env.DB.prepare(
      "INSERT INTO score_events (id, user_id, quiz_session_id, question_index, is_correct, delta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(randomId(), currentUser.id, sessionId, item.index, item.correct ? 1 : 0, item.correct ? 1 : -1, nowIso()));
    operations.push(env.DB.prepare("UPDATE users SET score = score + ? WHERE id = ?").bind(total, currentUser.id));
    await env.DB.batch(operations);
    const updated = await env.DB.prepare("SELECT score FROM users WHERE id = ?").bind(currentUser.id).first();
    return json({ results, total, score: updated.score });
  }

  if (method === "POST" && path === "/api/admin/rules") {
    const body = await bodyJson(request);
    const title = cleanText(body.title, 160);
    const sections = validateSections(body.sections);
    if (!title || !sections) return fail("Ajoute un titre et au moins une partie avec son nom et sa règle.");
    const totalRules = await env.DB.prepare("SELECT COUNT(*) AS total FROM rules").first();
    if (Number(totalRules?.total || 0) >= 60) return fail("La limite de 60 règles est atteinte.", 409);
    const id = randomId();
    await env.DB.prepare("INSERT INTO rules (id, title, sections_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .bind(id, title, JSON.stringify(sections), nowIso(), nowIso()).run();
    return json({ ok: true, id }, 201);
  }

  const ruleMatch = path.match(/^\/api\/admin\/rules\/([a-zA-Z0-9-]+)$/);
  if (ruleMatch && ["PUT", "DELETE"].includes(method)) {
    const id = ruleMatch[1];
    if (method === "DELETE") {
      await env.DB.prepare("DELETE FROM rules WHERE id = ?").bind(id).run();
      return json({ ok: true });
    }
    const body = await bodyJson(request);
    const title = cleanText(body.title, 160);
    const sections = validateSections(body.sections);
    if (!title || !sections) return fail("Ajoute un titre et au moins une partie avec son nom et sa règle.");
    await env.DB.prepare("UPDATE rules SET title = ?, sections_json = ?, updated_at = ? WHERE id = ?").bind(title, JSON.stringify(sections), nowIso(), id).run();
    return json({ ok: true });
  }

  if (method === "POST" && path === "/api/admin/exercises") {
    const body = await bodyJson(request);
    const ruleId = cleanText(body.ruleId, 80);
    const title = cleanText(body.title, 160);
    const description = cleanText(body.description, 500);
    const questions = validateQuestions(body.questions);
    const rule = await env.DB.prepare("SELECT id FROM rules WHERE id = ?").bind(ruleId).first();
    if (!rule || !title || !questions) return fail("Vérifie la règle, le titre et les exercices (3 à 30 questions valides).");
    const id = randomId();
    await env.DB.prepare("INSERT INTO exercise_sets (id, rule_id, title, description, questions_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, ruleId, title, description, JSON.stringify(questions), nowIso()).run();
    return json({ ok: true, id }, 201);
  }

  const exerciseMatch = path.match(/^\/api\/admin\/exercises\/([a-zA-Z0-9-]+)$/);
  if (exerciseMatch && method === "DELETE") {
    await env.DB.prepare("DELETE FROM exercise_sets WHERE id = ?").bind(exerciseMatch[1]).run();
    return json({ ok: true });
  }
  return fail("Route introuvable.", 404);
}

export async function onRequest(context) {
  try {
    return await handle(context.request, context.env);
  } catch (error) {
    console.error("API ERROR:", error?.stack || error);
    return json({ error: "Une erreur serveur est survenue. Vérifie la configuration et réessaie." }, 500);
  }
}
