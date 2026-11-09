import { saveRoomToD1, removeRoomFromD1, type RoomEvent } from "./persistence";
import { DurableObject } from "cloudflare:workers";
import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  createGame,
  parseQuestions,
  transition,
  type GameState,
  type Question,
} from "../src/engine";
import {
  allowed,
  project,
  validCommand,
  type Role,
  type Mode,
  type RoomCommand,
  type RoomView,
} from "../src/protocol";
interface Env {
  DB: D1Database;
  ROOMS: DurableObjectNamespace<GameRoom>;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  ALLOWED_ORIGINS: string;
  DEV_ADMIN_TOKEN?: string;
  ENVIRONMENT?: string;
  CREATE_LIMITER: RateLimit;
}
interface Bank {
  questions: Question[];
  disabled: number[];
  revision: number;
}
interface Saved {
  createdAt?: number;
  events?: RoomEvent[];
  code: string;
  mode: Mode;
  names: [string, string];
  keys: Record<Exclude<Role, "viewer">, string>;
  questions: Question[];
  game: GameState | null;
  revision: number;
  paused: boolean;
  expires: number;
  recent: string[];
}
const json = (v: unknown, status = 200) => Response.json(v, { status });
async function body(req: Request): Promise<unknown> {
  if (Number(req.headers.get("Content-Length") || 0) > 2500000)
    throw Error("حجم الطلب كبير");
  const raw = await req.text();
  if (raw.length > 500000) throw Error("حجم الطلب كبير");
  return JSON.parse(raw);
}
const token = () => crypto.randomUUID() + crypto.randomUUID();
async function bank(env: Env): Promise<Bank> {
  const row = await env.DB.prepare(
    "SELECT payload, revision FROM question_bank WHERE id=1",
  ).first<{ payload: string; revision: number }>();
  if (!row) throw Error("قاعدة الأسئلة لم تجهز بعد");
  return { ...JSON.parse(row.payload), revision: row.revision };
}
const jwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
async function isAdmin(req: Request, env: Env) {
  if (
    env.ENVIRONMENT === "development" &&
    env.DEV_ADMIN_TOKEN &&
    req.headers.get("Authorization") === `Bearer ${env.DEV_ADMIN_TOKEN}`
  )
    return true;
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return false;
  const assertion = req.headers.get("Cf-Access-Jwt-Assertion");
  if (!assertion) return false;
  try {
    const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
    let key = jwks.get(issuer);
    if (!key) {
      key = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
      jwks.set(issuer, key);
    }
    await jwtVerify(assertion, key, { issuer, audience: env.ACCESS_AUD });
    return true;
  } catch {
    return false;
  }
}
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get("Origin");
    const origins = (env.ALLOWED_ORIGINS || "").split(",").map((x) => x.trim());
    if (origin && !origins.includes(origin))
      return json({ error: "المصدر غير مسموح" }, 403);
    const cors = {
      "Access-Control-Allow-Origin": origin || origins[0] || "",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
      "Access-Control-Allow-Credentials": "true",
      Vary: "Origin",
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    let res: Response;
    try {
      if (url.pathname === "/health") res = json({ ok: true });
      else if (url.pathname === "/rooms" && req.method === "POST") {
        const limit = await env.CREATE_LIMITER.limit({
          key: req.headers.get("CF-Connecting-IP") || "local",
        });
        if (!limit.success)
          return json({ error: "طلبات كثيرة، حاول بعد قليل" }, 429);
        const b = (await body(req)) as Record<string, unknown>;
        if (
          !Array.isArray(b.names) ||
          b.names.length !== 2 ||
          b.names.some(
            (n) => typeof n !== "string" || !n.trim() || n.length > 32,
          ) ||
          !["single", "phones"].includes(String(b.mode))
        )
          throw Error("أسماء الفريقين أو وضع اللعب غير صالح");
        const data = await bank(env);
        const questions = data.questions.filter(
          (q) => !data.disabled.includes(q.id),
        );
        createGame(questions, b.names as [string, string], 1);
        const code = crypto
          .randomUUID()
          .replaceAll("-", "")
          .slice(0, 10)
          .toUpperCase();
        const keys = { host: token(), red: token(), blue: token() };
        const room: Saved = {
          createdAt: Date.now(),
          events: [
            {
              revision: 0,
              type: "CREATE_ROOM",
              phase: null,
              round: 0,
              at: Date.now(),
            },
          ],
          code,
          keys,
          mode: b.mode as Mode,
          names: b.names as [string, string],
          questions,
          game: null,
          revision: 0,
          paused: false,
          expires: Date.now() + 86400000,
          recent: [],
        };
        res = await env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(
          new Request("https://room/internal", {
            method: "POST",
            body: JSON.stringify(room),
          }),
        );
        if (res.ok) res = json({ code, keys });
      } else if (/^\/rooms\/[A-Z0-9]{10}(\/ws)?$/.test(url.pathname)) {
        const code = url.pathname.split("/")[2]!;
        res = await env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(req);
      } else if (url.pathname === "/admin/bank") {
        if (!(await isAdmin(req, env)))
          res = json({ error: "دخول الإدارة غير مصرح" }, 401);
        else if (req.method === "GET") res = json(await bank(env));
        else if (req.method === "PUT") {
          const v = (await body(req)) as Record<string, unknown>;
          const questions = parseQuestions(v.questions);
          if (
            !Array.isArray(v.disabled) ||
            v.disabled.some((n) => !questions.some((q) => q.id === n)) ||
            !Number.isInteger(v.revision)
          )
            throw Error("بيانات الإدارة غير صالحة");
          const payload = JSON.stringify({ questions, disabled: v.disabled });
          const result = await env.DB.prepare(
            "UPDATE question_bank SET payload=?,revision=revision+1 WHERE id=1 AND revision=?",
          )
            .bind(payload, v.revision)
            .run();
          res = result.meta.changes
            ? json({ revision: Number(v.revision) + 1 })
            : json({ error: "عدّل مستخدم آخر المجموعة؛ أعد تحميلها" }, 409);
        } else res = json({ error: "طريقة غير مدعومة" }, 405);
      } else res = json({ error: "غير موجود" }, 404);
    } catch (e) {
      res = json(
        { error: e instanceof Error ? e.message : "تعذر تنفيذ العملية" },
        400,
      );
    }
    if (res.status === 101) return res;
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(res.body, { status: res.status, headers });
  },
} satisfies ExportedHandler<Env>;
export class GameRoom extends DurableObject<Env> {
  saved: Saved | null = null;
  mirroredRevision = -1;
  mirrorRetryAt: number | null = null;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.saved = (await ctx.storage.get<Saved>("room")) || null;
    });
  }
  private role(key: string): Role {
    if (this.saved)
      for (const role of ["host", "red", "blue"] as const)
        if (this.saved.keys[role] === key) return role;
    return "viewer";
  }
  private presence(): Record<Role, number> {
    const count = { host: 0, red: 0, blue: 0, viewer: 0 };
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as { role?: Role } | null;
      if (a?.role) count[a.role]++;
    }
    return count;
  }
  private view(role: Role): RoomView {
    const s = this.saved!;
    return {
      code: s.code,
      revision: s.revision,
      mode: s.mode,
      names: s.names,
      role,
      game: project(s.game, role),
      paused: s.paused,
      serverTime: Date.now(),
      presence: this.presence(),
    };
  }
  private broadcast() {
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as { role?: Role } | null;
      if (a?.role)
        try {
          ws.send(JSON.stringify({ type: "STATE", ...this.view(a.role) }));
        } catch {
          ws.close(1011, "connection closed");
        }
    }
  }
  private recordEvent(type: string) {
    const s = this.saved!;
    s.events = [
      ...(s.events ?? []).slice(-255),
      {
        revision: s.revision,
        type,
        phase: s.game?.phase ?? null,
        round: s.game?.round ?? 0,
        at: Date.now(),
      },
    ];
  }
  private async persist() {
    await this.ctx.storage.put("room", this.saved);
    const s = this.saved!;
    if (this.mirroredRevision !== s.revision) {
      try {
        await saveRoomToD1(this.env.DB, s);
        this.mirroredRevision = s.revision;
        this.mirrorRetryAt = null;
      } catch {
        this.mirrorRetryAt = Date.now() + 15000;
        console.error("D1 room synchronization pending", s.code, s.revision);
      }
    }
    await this.ctx.storage.setAlarm(
      Math.min(
        s.expires,
        s.game?.deadline ?? Infinity,
        this.mirrorRetryAt ?? Infinity,
        ...this.ctx.getWebSockets().map((ws) => {
          const a = ws.deserializeAttachment() as {
            role?: Role;
            joined: number;
          };
          return a.role ? Infinity : a.joined + 10000;
        }),
      ),
    );
  }
  private expire() {
    const s = this.saved!;
    for (
      let i = 0;
      i < 3 &&
      s.game?.deadline !== null &&
      s.game?.deadline !== undefined &&
      s.game.deadline <= Date.now();
      i++
    ) {
      s.game = transition(
        s.game,
        { type: "EXPIRE_TIMER", timerId: s.game.timerId },
        s.game.deadline,
      );
      s.revision++;
      this.recordEvent("EXPIRE_TIMER");
    }
  }
  async fetch(req: Request) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const url = new URL(req.url);
      if (url.pathname === "/internal" && req.method === "POST") {
        if (this.saved) return json({ error: "غرفة موجودة" }, 409);
        this.saved = (await req.json()) as Saved;
        await this.persist();
        return json({ ok: true });
      }
      if (!this.saved || Date.now() > this.saved.expires)
        return json({ error: "الغرفة غير متاحة أو انتهت صلاحيتها" }, 404);
      this.expire();
      await this.persist();
      if (url.pathname.endsWith("/ws")) {
        if (req.headers.get("Upgrade") !== "websocket")
          return json({ error: "WebSocket required" }, 426);
        if (this.ctx.getWebSockets().length >= 64)
          return json({ error: "الغرفة ممتلئة" }, 429);
        const pair = new WebSocketPair();
        this.ctx.acceptWebSocket(pair[1]);
        pair[1].serializeAttachment({ joined: Date.now() });
        await this.persist();
        return new Response(null, { status: 101, webSocket: pair[0] });
      }
      const key =
        req.headers.get("Authorization")?.replace(/^Bearer /, "") || "";
      const role = this.role(key);
      if (req.method === "GET") return json(this.view(role));
      if (req.method !== "POST")
        return json({ error: "طريقة غير مدعومة" }, 405);
      const msg = (await body(req)) as Record<string, unknown>;
      const result = await this.command(role, msg);
      return result;
    });
  }
  private async command(role: Role, msg: Record<string, unknown>) {
    const s = this.saved!;
    if (!validCommand(msg.action) || !allowed(role, s.mode, msg.action))
      return json({ error: "الإجراء غير مسموح" }, 403);
    if (
      typeof msg.id !== "string" ||
      msg.id.length > 80 ||
      !Number.isInteger(msg.revision)
    )
      return json({ error: "طلب غير صالح" }, 400);
    this.expire();
    if (s.recent.includes(msg.id)) return json(this.view(role));
    if (msg.revision !== s.revision)
      return json(
        { error: "تحدثت المباراة، حاول مرة أخرى", state: this.view(role) },
        409,
      );
    const action = msg.action as RoomCommand;
    if (action.type === "START") {
      if (s.game) return json({ error: "بدأت المباراة بالفعل" }, 409);
      if (s.mode === "phones") {
        const p = this.presence();
        if (!p.red || !p.blue)
          return json({ error: "انتظر اتصال القائدين" }, 409);
      }
      s.game = createGame(
        s.questions,
        s.names,
        crypto.getRandomValues(new Uint32Array(1))[0]!,
      );
    } else if (action.type === "PAUSE") {
      if (s.game && s.game.phase !== "BOARD" && s.game.phase !== "RESOLUTION")
        return json({ error: "الإيقاف بين الجولات فقط" }, 409);
      s.paused = action.paused;
    } else {
      if (!s.game || s.paused)
        return json({ error: "المباراة غير جاهزة" }, 409);
      const next = transition(s.game, action, Date.now());
      if (next === s.game) return json({ error: "الإجراء غير متاح الآن" }, 409);
      s.game = next;
    }
    s.recent = [...s.recent.slice(-127), msg.id];
    s.revision++;
    this.recordEvent(action.type);
    s.expires = Date.now() + 86400000;
    await this.persist();
    this.broadcast();
    return json(this.view(role));
  }
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    await this.ctx.blockConcurrencyWhile(async () => {
      try {
        if (typeof message !== "string" || message.length > 10000)
          throw Error("رسالة غير صالحة");
        const msg = JSON.parse(message) as Record<string, unknown>;
        if (!this.saved || Date.now() > this.saved.expires) {
          ws.close(1008, "room expired");
          return;
        }
        const attachment = ws.deserializeAttachment() as {
          role?: Role;
          joined: number;
        };
        if (msg.type === "HELLO" && !attachment.role) {
          const key = typeof msg.key === "string" ? msg.key : "";
          const role = this.role(key);
          if (key && role === "viewer") {
            ws.close(1008, "invalid credential");
            return;
          }
          if (role === "red" || role === "blue")
            for (const old of this.ctx.getWebSockets())
              if (
                old !== ws &&
                (old.deserializeAttachment() as { role?: Role } | null)
                  ?.role === role
              )
                old.close(1000, "session replaced");
          ws.serializeAttachment({ role, joined: Date.now() });
          this.expire();
          await this.persist();
          this.broadcast();
        } else if (msg.type === "PING" && attachment.role)
          ws.send(JSON.stringify({ type: "PONG", serverTime: Date.now() }));
        else throw Error("اتصال غير مصرح");
      } catch {
        ws.close(1008, "invalid message");
      }
    });
  }
  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean,
  ) {
    ws.close(code, reason);
    this.broadcast();
  }
  async webSocketError(ws: WebSocket) {
    ws.close(1011, "connection error");
  }
  async alarm() {
    await this.ctx.blockConcurrencyWhile(async () => {
      if (!this.saved) return;
      if (Date.now() >= this.saved.expires) {
        for (const ws of this.ctx.getWebSockets())
          ws.close(1000, "room expired");
        await removeRoomFromD1(this.env.DB, this.saved.code);
        await this.ctx.storage.deleteAll();
        this.saved = null;
        return;
      }
      for (const ws of this.ctx.getWebSockets()) {
        const a = ws.deserializeAttachment() as { role?: Role; joined: number };
        if (!a.role && Date.now() >= a.joined + 10000)
          ws.close(1008, "authentication timeout");
      }
      this.expire();
      await this.persist();
      this.broadcast();
    });
  }
}
