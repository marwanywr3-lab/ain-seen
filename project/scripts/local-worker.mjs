import { Miniflare } from "miniflare";
import { readFile } from "node:fs/promises";
export const mf = new Miniflare({
  host: "127.0.0.1",
  port: 8787,
  name: "ain-seen-api",
  modules: true,
  scriptPath: ".worker-build/index.js",
  compatibilityDate: "2026-11-01",
  durableObjects: { ROOMS: { className: "GameRoom", useSQLite: true } },
  d1Databases: ["DB"],
  ratelimits: {
    CREATE_LIMITER: {
      namespace_id: "1001",
      simple: { limit: 1000, period: 60 },
    },
  },
  bindings: {
    ALLOWED_ORIGINS: "http://terminal.local:4173,http://localhost:5173",
    ENVIRONMENT: "development",
    DEV_ADMIN_TOKEN: "local-test-only",
  },
});
await mf.ready;
const db = await mf.getD1Database("DB");
await db
  .prepare(
    "CREATE TABLE IF NOT EXISTS question_bank(id INTEGER PRIMARY KEY,payload TEXT NOT NULL,revision INTEGER NOT NULL)",
  )
  .run();
const questions = JSON.parse(await readFile("src/questions.json", "utf8"));
await db
  .prepare("INSERT OR IGNORE INTO question_bank VALUES(1,?,1)")
  .bind(JSON.stringify({ questions, disabled: [] }))
  .run();
const roomsSchema = await readFile(
  "migrations/0002_rooms_and_matches.sql",
  "utf8",
);
for (const statement of roomsSchema
  .replace(/--[^\n]*/g, "")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean))
  await db.prepare(statement).run();
for (const statement of (
  await readFile("migrations/0003_room_members.sql", "utf8")
)
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean))
  await db.prepare(statement).run();
console.log(`Local Worker ready at ${await mf.ready}`);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await mf.dispose();
    process.exit(0);
  });
