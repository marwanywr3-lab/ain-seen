import { readFile, writeFile } from "node:fs/promises";
const questions = JSON.parse(
  await readFile(new URL("../src/questions.json", import.meta.url), "utf8"),
);
const payload = JSON.stringify({ questions, disabled: [] }).replaceAll(
  "'",
  "''",
);
await writeFile(
  new URL("../migrations/0001_questions.sql", import.meta.url),
  `CREATE TABLE IF NOT EXISTS question_bank (id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1);\nINSERT OR IGNORE INTO question_bank(id,payload,revision) VALUES(1,'${payload}',1);\n`,
);
