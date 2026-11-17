import { parseQuestions, type Question } from "../src/engine";
import { categories, POINTS } from "../src/catalog";

interface QuestionEnv {
  DB: D1Database;
  CREATE_LIMITER?: RateLimit;
  AI_PRECHECK_API_KEY?: string;
  AI_PRECHECK_URL?: string;
  AI_PRECHECK_MODEL?: string;
  RESEND_API_KEY?: string;
  AIN_SEEN_EMAIL_FROM?: string;
  ADMIN_SETUP_OPEN?: string;
}
type AdminCheck = () => Promise<boolean>;
const reportReasons = ["too_easy_or_obvious", "too_hard", "multiple_correct_answers", "selected_answer_wrong", "no_correct_answer", "category_mismatch"];
const ownerEmail = "barboodmarwan@gmail.com";
const json = (value: unknown, status = 200) => Response.json(value, { status });
export async function activeQuestions(db: D1Database) {
  const rows = await db.prepare("SELECT payload,category_id,points,status FROM questions ORDER BY id").all<{payload:string;category_id:string;points:number;status:string}>();
  const counts = new Map<string, Map<number, number>>();
  for (const c of categories) counts.set(c.id, new Map(POINTS.map((p) => [p, 0])));
  for (const row of rows.results) if (row.status === "approved") {
    const bucket = counts.get(row.category_id);
    if (bucket) bucket.set(row.points, (bucket.get(row.points) || 0) + 1);
  }
  const coverage = categories.map((c) => {
    const byPoints = counts.get(c.id)!;
    return { id: c.id, name: c.name, approved: [...byPoints.values()].reduce((a,b)=>a+b,0), byPoints: Object.fromEntries(byPoints) };
  });
  const exclusiveApproved = coverage.every((c) => c.approved >= 10 && POINTS.every((p) => c.byPoints[p] >= 2));
  return {
    exclusiveApproved,
    coverage,
    questions: rows.results.filter((row) => exclusiveApproved ? row.status === "approved" : ["legacy","approved"].includes(row.status)).map((row) => JSON.parse(row.payload) as Question),
  };
}
async function readBody(request: Request): Promise<Record<string, unknown>> {
  const value = await request.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("بيانات الطلب غير صالحة");
  return value as Record<string, unknown>;
}
function validContact(input: Record<string, unknown>) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (name.length < 2 || name.length > 60) throw Error("اكتب اسمًا من حرفين إلى ٦٠ حرفًا");
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error("اكتب بريدًا إلكترونيًا صحيحًا");
  return { name, email };
}
async function notifyOwner(env: QuestionEnv, subject: string, message: string): Promise<"sent" | "failed" | "not_configured"> {
  const settings = await env.DB.prepare("SELECT key,value FROM question_settings WHERE key IN ('notification_api_key','notification_from')").all<{key:string;value:string}>();
  const saved = Object.fromEntries(settings.results.map((row) => [row.key, row.value]));
  const apiKey = env.RESEND_API_KEY || saved.notification_api_key;
  const from = env.AIN_SEEN_EMAIL_FROM || saved.notification_from;
  if (!apiKey || !from) return "not_configured";
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [ownerEmail], subject, text: message }),
      signal: AbortSignal.timeout(10000),
    });
    return response.ok ? "sent" : "failed";
  } catch { return "failed"; }
}
function parsedQuestion(input: unknown, id: number): Question {
  if (!input || typeof input !== "object") throw Error("بيانات السؤال غير صالحة");
  return parseQuestions([{ ...(input as Record<string, unknown>), id }])[0]!;
}
async function precheck(question: Question, env: QuestionEnv) {
  const settings = await env.DB.prepare("SELECT key,value FROM question_settings").all<{key:string;value:string}>();
  const saved = Object.fromEntries(settings.results.map((row) => [row.key, row.value]));
  const apiKey = env.AI_PRECHECK_API_KEY || saved.ai_precheck_api_key;
  if (!apiKey) return { status: "not_configured", notes: "لم يُضف مفتاح فحص الذكاء الاصطناعي بعد." };
  try {
    const response = await fetch(env.AI_PRECHECK_URL || saved.ai_precheck_url || "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.AI_PRECHECK_MODEL || saved.ai_precheck_model || "gemini-3.8-flash",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "قيّم سؤال مسابقة عربية منطقياً. أعد JSON فقط بمفاتيح logical, answerCorrect, clean, notes. القيم الثلاث الأولى boolean، وnotes نص عربي موجز. لا تعتمد السؤال آلياً." },
          { role: "user", content: JSON.stringify({ question: question.question, options: question.options, answer: question.answer, category: question.category, points: question.points }) },
        ],
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return { status: "error", notes: "تعذر إكمال الفحص الآلي (" + response.status + ")." };
    const data = await response.json() as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return { status: "error", notes: "لم يرجع فحص الذكاء الاصطناعي نتيجة مفهومة." };
    return { status: "complete", ...JSON.parse(content) };
  } catch {
    return { status: "error", notes: "تعذر الاتصال بخدمة الفحص الآلي." };
  }
}
async function admin(req: Request, check: AdminCheck) {
  if (!(await check())) return json({ error: "سجّل دخولك للوحة المراجعة أولًا." }, 401);
  return null;
}
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const unb64 = (text: string) => Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - text.length % 4) % 4)), (char) => char.charCodeAt(0));
async function passwordHash(password: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return b64(new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 120000, hash: "SHA-256" }, key, 256)));
}
async function sha256(value: string) { return b64(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))); }
async function sessionCheck(req: Request, db: D1Database) {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token.length < 40) return false;
  const hash = await sha256(token);
  const row = await db.prepare("SELECT expires_at FROM question_admin_sessions WHERE token_hash=?").bind(hash).first<{expires_at:number}>();
  if (!row) return false;
  if (row.expires_at <= Date.now()) {
    await db.prepare("DELETE FROM question_admin_sessions WHERE token_hash=?").bind(hash).run();
    return false;
  }
  return true;
}
function validPassword(value: unknown): value is string { return typeof value === "string" && value.length >= 12 && value.length <= 128; }
export async function questionRoutes(req: Request, env: QuestionEnv, isAdmin: AdminCheck): Promise<Response | null> {
  const url = new URL(req.url);
  if (url.pathname === "/questions" && req.method === "GET") {
    return json(await activeQuestions(env.DB));
  }
  const reportMatch = url.pathname.match(/^\/questions\/(\d+)\/reports$/);
  if (reportMatch && req.method === "POST") {
    const limit = await env.CREATE_LIMITER?.limit({ key: "report:" + (req.headers.get("CF-Connecting-IP") || "local") });
    if (limit && !limit.success) return json({ error: "وصلت إلى حد البلاغات الآن، حاول بعد قليل." }, 429);
    const input = await readBody(req);
    const contact = validContact(input);
    const reason = input.reason;
    if (typeof reason !== "string" || !reportReasons.includes(reason)) throw Error("سبب البلاغ غير صالح");
    const details = typeof input.details === "string" ? input.details.trim().slice(0,1000) : "";
    const active = await activeQuestions(env.DB);
    const reported = active.questions.find((q) => q.id === Number(reportMatch[1]));
    if (!reported) return json({ error: "السؤال غير موجود أو غير متاح" }, 404);
    const result = await env.DB.prepare("INSERT INTO question_reports(question_id,reason,reporter_name,reporter_email,details,created_at) VALUES(?,?,?,?,?,?)")
      .bind(reported.id, reason, contact.name, contact.email, details, Date.now()).run();
    if (!result.meta.changes) return json({ error: "تعذر حفظ البلاغ" }, 500);
    const emailStatus = await notifyOwner(env, "بلاغ سؤال جديد في عين سين", `الاسم: ${contact.name}\nالبريد: ${contact.email}\nالسبب: ${reason}\nالسؤال: ${reported.question}\nالإجابة: ${reported.answer}\nملاحظات: ${details || "لا توجد"}`);
    await env.DB.prepare("UPDATE question_reports SET notification_status=? WHERE id=?").bind(emailStatus, result.meta.last_row_id).run();
    return json({ ok: true, emailNotification: emailStatus }, 201);
  }
  if (url.pathname === "/questions/suggestions" && req.method === "POST") {
    const limit = await env.CREATE_LIMITER?.limit({ key: "suggestion:" + (req.headers.get("CF-Connecting-IP") || "local") });
    if (limit && !limit.success) return json({ error: "وصلت إلى حد الاقتراحات الآن، حاول بعد قليل." }, 429);
    const input = await readBody(req);
    const contact = validContact(input);
    const id = Date.now() * 100 + Math.floor(Math.random() * 100);
    const question = parsedQuestion(input.question, id);
    const checked = await precheck(question, env);
    await env.DB.prepare("INSERT INTO questions(id,category_id,category,points,payload,status,source,ai_check,submitter_name,submitter_email,created_at,updated_at) VALUES(?,?,?,?,?,'pending','player',?,?,?,?,?)")
      .bind(id, question.categoryId, question.category, question.points, JSON.stringify(question), JSON.stringify(checked), contact.name, contact.email, Date.now(), Date.now()).run();
    const emailStatus = await notifyOwner(env, "اقتراح سؤال جديد في عين سين", `الاسم: ${contact.name}\nالبريد: ${contact.email}\nالفئة: ${question.category}\nالنقاط: ${question.points}\nالسؤال: ${question.question}\nالخيارات:\n${question.options.map((option,index)=>`${index+1}. ${option}`).join("\n")}\nالإجابة المقترحة: ${question.answer}\nنتيجة فحص AI: ${JSON.stringify(checked)}`);
    await env.DB.prepare("UPDATE questions SET notification_status=? WHERE id=?").bind(emailStatus,id).run();
    return json({ ok: true, id, aiCheck: checked, emailNotification: emailStatus }, 201);
  }
  if (url.pathname === "/admin/auth/status" && req.method === "GET") {
    const row = await env.DB.prepare("SELECT value FROM question_settings WHERE key='admin_password_hash'").first<{value:string}>();
    return json({ initialized: Boolean(row) });
  }
  if (url.pathname === "/admin/auth/access-check" && req.method === "GET") {
    return await isAdmin() ? json({ ok: true }) : json({ error: "تحقق Cloudflare Access غير مكتمل." }, 401);
  }
  if (url.pathname === "/admin/auth/setup" && req.method === "POST") {
    if (env.ADMIN_SETUP_OPEN !== "true" && !(await isAdmin())) return json({ error: "الدخول غير متاح." }, 401);
    const existing = await env.DB.prepare("SELECT value FROM question_settings WHERE key='admin_password_hash'").first<{value:string}>();
    if (existing) return json({ error: "تم إعداد اللوحة مسبقًا." }, 409);
    const input = await readBody(req);
    const aiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
    if (aiKey.length < 8 || aiKey.length > 500) throw Error("أدخل مفتاح API صالحًا");
    const endpoint = typeof input.url === "string" ? input.url.trim() : "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
    let parsed: URL;
    try { parsed = new URL(endpoint); } catch { throw Error("رابط API غير صالح"); }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw Error("استخدم رابط API آمنًا يبدأ بـ HTTPS");
    const now = Date.now(), saltBytes = crypto.getRandomValues(new Uint8Array(16));
    const salt = b64(saltBytes);
    const bootstrapPassword = b64(crypto.getRandomValues(new Uint8Array(32)));
    const hashed = await passwordHash(bootstrapPassword, saltBytes);
    for (const [key,value] of [["admin_password_salt",salt], ["admin_password_hash",hashed], ["ai_precheck_api_key",aiKey], ["ai_precheck_url",endpoint], ["ai_precheck_model",typeof input.model === "string" && input.model.trim() ? input.model.trim() : "gemini-3.8-flash"]] as const) {
      await env.DB.prepare("INSERT INTO question_settings(key,value,updated_at) VALUES(?,?,?)").bind(key,value,now).run();
    }
    const sessionToken = b64(crypto.getRandomValues(new Uint8Array(32)));
    await env.DB.prepare("INSERT INTO question_admin_sessions(token_hash,created_at,expires_at) VALUES(?,?,?)").bind(await sha256(sessionToken),now,now+7*86400000).run();
    return json({ ok: true, initialized: true, token: sessionToken, expiresAt: now+7*86400000 });
  }
  if (url.pathname === "/admin/auth/login" && req.method === "POST") {
    const limit = await env.CREATE_LIMITER?.limit({ key: "admin-login:" + (req.headers.get("CF-Connecting-IP") || "local") });
    if (limit && !limit.success) return json({ error: "محاولات كثيرة، انتظر قليلًا ثم حاول مجددًا." }, 429);
    const input = await readBody(req);
    if (typeof input.password !== "string" || input.password.length > 128) return json({ error: "كلمة المرور غير صحيحة." }, 401);
    const rows = await env.DB.prepare("SELECT key,value FROM question_settings WHERE key IN ('admin_password_salt','admin_password_hash')").all<{key:string;value:string}>();
    const saved = Object.fromEntries(rows.results.map((row) => [row.key,row.value]));
    if (!saved.admin_password_salt || !saved.admin_password_hash) return json({ error: "لم تتم تهيئة لوحة الإدارة بعد." }, 409);
    const actual = unb64(await passwordHash(input.password,unb64(saved.admin_password_salt)));
    const expected = unb64(saved.admin_password_hash);
    let diff = actual.length ^ expected.length;
    for (let i=0;i<Math.max(actual.length,expected.length);i++) diff |= (actual[i]||0) ^ (expected[i]||0);
    if (diff !== 0) return json({ error: "كلمة المرور غير صحيحة." }, 401);
    const token = b64(crypto.getRandomValues(new Uint8Array(32)));
    const hash = await sha256(token), now = Date.now();
    await env.DB.prepare("INSERT INTO question_admin_sessions(token_hash,created_at,expires_at) VALUES(?,?,?)").bind(hash,now,now+7*86400000).run();
    return json({ ok: true, token, expiresAt: now+7*86400000 });
  }
  if (url.pathname === "/admin/auth/logout" && req.method === "POST") {
    const auth = req.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (token) await env.DB.prepare("DELETE FROM question_admin_sessions WHERE token_hash=?").bind(await sha256(token)).run();
    return json({ ok: true });
  }
  if (!url.pathname.startsWith("/admin/questions") && !url.pathname.startsWith("/admin/reports") && !url.pathname.startsWith("/admin/settings")) return null;
  const denied = await admin(req, async () => (await sessionCheck(req,env.DB)) || (await isAdmin()));
  if (denied) return denied;
  if (url.pathname === "/admin/settings/ai" && req.method === "GET") {
    const settings = await env.DB.prepare("SELECT key,value FROM question_settings WHERE key IN ('ai_precheck_api_key','ai_precheck_url','ai_precheck_model')").all<{key:string;value:string}>();
    const saved = Object.fromEntries(settings.results.map((row) => [row.key, row.value]));
    return json({ configured: Boolean(env.AI_PRECHECK_API_KEY || saved.ai_precheck_api_key), url: saved.ai_precheck_url || env.AI_PRECHECK_URL || "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", model: saved.ai_precheck_model || env.AI_PRECHECK_MODEL || "gemini-3.8-flash", mailConfigured: Boolean(env.RESEND_API_KEY || saved.notification_api_key), mailFrom: saved.notification_from || env.AIN_SEEN_EMAIL_FROM || "" });
  }
  if (url.pathname === "/admin/settings/ai" && req.method === "PUT") {
    const input = await readBody(req);
    const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
    const endpoint = typeof input.url === "string" ? input.url.trim() : "";
    const model = typeof input.model === "string" ? input.model.trim() : "";
    const mailApiKey = typeof input.mailApiKey === "string" ? input.mailApiKey.trim() : "";
    const mailFrom = typeof input.mailFrom === "string" ? input.mailFrom.trim() : "";
    if (apiKey && (apiKey.length < 8 || apiKey.length > 500)) throw Error("مفتاح API غير صالح");
    if (endpoint) {
      let parsed: URL;
      try { parsed = new URL(endpoint); } catch { throw Error("رابط API غير صالح"); }
      if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw Error("استخدم رابط API آمنًا يبدأ بـ HTTPS");
    }
    if (model.length > 120) throw Error("اسم النموذج طويل جدًا");
    if (mailApiKey && (mailApiKey.length < 8 || mailApiKey.length > 500)) throw Error("مفتاح خدمة البريد غير صالح");
    if (mailFrom && (mailFrom.length > 254 || /[\r\n]/.test(mailFrom) || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(mailFrom.replace(/^.*<([^<>]+)>$/, "$1")))) throw Error("استخدم بريد إرسال صالحًا وموثقًا لدى Resend");
    const now = Date.now();
    for (const [key,value] of [["ai_precheck_api_key",apiKey], ["ai_precheck_url",endpoint], ["ai_precheck_model",model], ["notification_api_key",mailApiKey], ["notification_from",mailFrom]] as const) {
      if (value) await env.DB.prepare("INSERT INTO question_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(key,value,now).run();
    }
    return json({ ok: true, configured: Boolean(apiKey || env.AI_PRECHECK_API_KEY), mailConfigured: Boolean(mailApiKey || env.RESEND_API_KEY) });
  }
  if (url.pathname === "/admin/questions/summary" && req.method === "GET") {
    const grouped = await env.DB.prepare("SELECT status,source,COUNT(*) AS total FROM questions GROUP BY status,source").all<{status:string;source:string;total:number}>();
    const reportCount = await env.DB.prepare("SELECT COUNT(*) AS total FROM question_reports WHERE status='open'").first<{total:number}>();
    const pending = grouped.results.filter((r) => r.source === "bank" && ["legacy","pending"].includes(r.status)).reduce((n,r)=>n+r.total,0);
    const suggestions = grouped.results.filter((r) => r.source === "player" && r.status === "pending").reduce((n,r)=>n+r.total,0);
    const approved = grouped.results.filter((r) => r.status === "approved").reduce((n,r)=>n+r.total,0);
    const active = await activeQuestions(env.DB);
    return json({ counts: { pending, approved, reports: reportCount?.total || 0, suggestions }, exclusiveApproved: active.exclusiveApproved, approvedTotal: active.coverage.reduce((n,c)=>n+c.approved,0), requiredTotal: categories.length * 10, coverage: active.coverage });
  }
  if (url.pathname === "/admin/questions/coverage" && req.method === "GET") {
    const active = await activeQuestions(env.DB);
    return json({ exclusiveApproved: active.exclusiveApproved, coverage: active.coverage, approvedTotal: active.coverage.reduce((n,c)=>n+c.approved,0), requiredTotal: categories.length * 10 });
  }
  if (url.pathname === "/admin/reports" && req.method === "GET") {
    const rows = await env.DB.prepare("SELECT r.id,r.question_id,r.reason,r.status,r.reporter_name,r.reporter_email,r.details,r.notification_status,r.created_at,q.payload,COUNT(*) OVER(PARTITION BY r.question_id) AS report_count FROM question_reports r JOIN questions q ON q.id=r.question_id WHERE r.status='open' ORDER BY r.created_at DESC").all();
    return json({ reports: rows.results });
  }
  if (url.pathname === "/admin/questions" && req.method === "GET") {
    const status = url.searchParams.get("status") || "pending";
    const source = url.searchParams.get("source") || "all";
    if (!["pending", "approved", "rejected"].includes(status)) throw Error("حالة المراجعة غير صالحة");
    const condition = status === "pending" ? "q.status IN ('pending','legacy')" : "q.status=?";
    const query = "SELECT q.*,COUNT(r.id) AS report_count FROM questions q LEFT JOIN question_reports r ON r.question_id=q.id AND r.status='open' WHERE " + condition + " AND (?='all' OR q.source=?) AND (q.status!='legacy' OR q.source='bank') GROUP BY q.id ORDER BY q.created_at,q.id";
    const args = status === "pending" ? [source, source] : [status, source, source];
    const rows = await env.DB.prepare(query).bind(...args).all();
    return json({ questions: rows.results });
  }
  if (url.pathname === "/admin/questions" && req.method === "POST") {
    const input = await readBody(req);
    const id = Date.now() * 100 + Math.floor(Math.random() * 100);
    const question = parsedQuestion(input.question, id);
    await env.DB.prepare("INSERT INTO questions(id,category_id,category,points,payload,status,source,created_at,updated_at) VALUES(?,?,?,?,?,'approved','admin',?,?)")
      .bind(id, question.categoryId, question.category, question.points, JSON.stringify(question), Date.now(), Date.now()).run();
    return json({ ok: true, question }, 201);
  }
  const questionMatch = url.pathname.match(/^\/admin\/questions\/(\d+)$/);
  if (questionMatch && req.method === "PUT") {
    const input = await readBody(req);
    const old = await env.DB.prepare("SELECT payload,status FROM questions WHERE id=?").bind(Number(questionMatch[1])).first<{ payload: string; status: string }>();
    if (!old) return json({ error: "السؤال غير موجود" }, 404);
    const question = parsedQuestion(input.question, Number(questionMatch[1]));
    const status = typeof input.status === "string" && ["pending","approved","rejected"].includes(input.status) ? input.status : old.status;
    const result = await env.DB.prepare("UPDATE questions SET category_id=?,category=?,points=?,payload=?,status=?,updated_at=? WHERE id=?")
      .bind(question.categoryId, question.category, question.points, JSON.stringify(question), status, Date.now(), question.id).run();
    return json({ ok: result.meta.changes > 0, question, status });
  }
  const reportUpdate = url.pathname.match(/^\/admin\/reports\/(\d+)$/);
  if (reportUpdate && req.method === "PUT") {
    const input = await readBody(req);
    if (!["closed", "ignored"].includes(String(input.status))) throw Error("حالة البلاغ غير صالحة");
    await env.DB.prepare("UPDATE question_reports SET status=?,closed_at=? WHERE id=?").bind(input.status, Date.now(), Number(reportUpdate[1])).run();
    return json({ ok: true });
  }
  const statusUpdate = url.pathname.match(/^\/admin\/questions\/(\d+)\/status$/);
  if (statusUpdate && req.method === "PUT") {
    const input = await readBody(req);
    if (!["pending", "approved", "rejected"].includes(String(input.status))) throw Error("حالة السؤال غير صالحة");
    await env.DB.prepare("UPDATE questions SET status=?,updated_at=? WHERE id=?").bind(input.status, Date.now(), Number(statusUpdate[1])).run();
    return json({ ok: true });
  }
  return json({ error: "العملية غير مدعومة" }, 405);
}
