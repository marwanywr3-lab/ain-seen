import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const remote = process.argv.includes("--remote");
const db = process.env.D1_DATABASE_NAME || "ain-seen";
const config = process.env.WRANGLER_CONFIG || "wrangler.jsonc";
const questions = JSON.parse(await readFile("src/questions.json", "utf8"));
if (!Array.isArray(questions) || !questions.length) throw Error("Question bank is empty");
const sql = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const run = (rows) => {
  const result = spawnSync("npx", [
    "wrangler", "d1", "execute", db, ...(remote ? ["--remote"] : ["--local"]),
    "--config", config, "--command", rows,
  ], { stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
};
for (let offset = 0; offset < questions.length; offset += 10) {
  const rows = questions.slice(offset, offset + 10).map((q) => {
    const payload = JSON.stringify(q);
    const created = Date.now();
    return "INSERT INTO questions(id,category_id,category,points,payload,status,source,created_at,updated_at) VALUES(" +
      Number(q.id) + "," + sql(q.categoryId) + "," + sql(q.category) + "," +
      Number(q.points) + "," + sql(payload) + ",'legacy','bank'," +
      created + "," + created + ") ON CONFLICT(id) DO NOTHING;";
  }).join("\n");
  run(rows);
  console.log("Imported " + Math.min(offset + 10, questions.length) + " / " + questions.length);
}
