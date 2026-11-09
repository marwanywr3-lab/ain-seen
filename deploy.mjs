import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
const config = JSON.parse(
  (await readFile("wrangler.jsonc", "utf8")).replace(/,\s*([}\]])/g, "$1"),
);
config.account_id = process.env.CLOUDFLARE_ACCOUNT_ID || config.account_id;
config.d1_databases[0].database_id =
  process.env.D1_DATABASE_ID || config.d1_databases[0].database_id;
config.vars = {
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || config.vars.ALLOWED_ORIGINS,
  ACCESS_TEAM_DOMAIN:
    process.env.ACCESS_TEAM_DOMAIN || config.vars.ACCESS_TEAM_DOMAIN,
  ACCESS_AUD: process.env.ACCESS_AUD || config.vars.ACCESS_AUD,
};
if (!/^[a-f0-9]{32}$/.test(config.account_id || ""))
  throw Error("Invalid Cloudflare account ID");
if (!/^[a-f0-9-]{36}$/.test(config.d1_databases[0].database_id || ""))
  throw Error("Invalid D1 database ID");
if (!config.vars.ALLOWED_ORIGINS) throw Error("ALLOWED_ORIGINS is required");
if (Boolean(config.vars.ACCESS_TEAM_DOMAIN) !== Boolean(config.vars.ACCESS_AUD))
  throw Error("Access requires both team domain and audience");
if (!config.vars.ACCESS_AUD)
  console.log(
    "Admin portal stays locked until Cloudflare Access is configured.",
  );
await writeFile("wrangler.deploy.json", JSON.stringify(config, null, 2));
const run = (args) => {
  const result = spawnSync("npx", args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
};
run([
  "wrangler",
  "d1",
  "migrations",
  "apply",
  "ain-seen",
  "--remote",
  "--config",
  "wrangler.deploy.json",
]);
run(["wrangler", "deploy", "--config", "wrangler.deploy.json"]);
