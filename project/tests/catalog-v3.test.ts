import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createGame, parseQuestions, transition } from "../src/engine.ts";
const read = (p: string) =>
  JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const bank = parseQuestions(read("../src/questions.json"));
test("offline completes all 36 rounds with unique questions", async () => {
  const { project } = await import("../src/protocol.ts");
  let s = createGame(bank, ["a", "b"], 44);
  const seen = new Set<number>();
  for (let i = 0; i < 36; i++) {
    assert.equal(s.phase, "BOARD");
    const cell = s.cells.find((c) => c.status === "available")!;
    s = transition(
      s,
      { type: "SELECT_CELL", team: s.turn, cellId: cell.id },
      i * 1000,
    );
    assert.equal(project(s, "viewer")!.current, null);
    s = transition(s, { type: "REVEAL_QUESTION" }, i * 1000);
    assert.equal(project(s, "viewer")!.current?.answer, undefined);
    assert.ok(!seen.has(s.current!.id));
    seen.add(s.current!.id);
    s = transition(
      s,
      {
        type: "SUBMIT_ANSWER",
        team: s.turn,
        index: s.current!.options.indexOf(s.current!.answer),
      },
      i * 1000 + 10,
    );
    assert.equal(s.phase, "RESOLUTION");
    s = transition(s, { type: "RESOLVE_ROUND" }, i * 1000 + 20);
  }
  assert.equal(seen.size, 36);
  assert.ok(["FINISHED", "SUDDEN_BUZZ"].includes(s.phase));
});
test("v3 migration replaces bank and rollback restores exact payload", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { sqlStatements } = await import("../scripts/sql-statements.mjs");
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE question_bank(id INTEGER PRIMARY KEY,payload TEXT,revision INTEGER); CREATE TABLE question_bank_versions(version TEXT PRIMARY KEY,payload TEXT,revision INTEGER,saved_at TEXT); CREATE TABLE game_rooms(status TEXT,deadline INTEGER,schema_version INTEGER); INSERT INTO question_bank VALUES(1,'{\"old\":true}',1);",
  );
  for (const statement of sqlStatements(
    readFileSync(
      new URL("../migrations/0005_catalog_v3.sql", import.meta.url),
      "utf8",
    ),
  )) {
    assert.ok(Buffer.byteLength(statement) < 100000);
    db.exec(statement);
  }
  const payload = JSON.parse(
    db.prepare("SELECT payload FROM question_bank").get()!.payload as string,
  );
  assert.equal(payload.schemaVersion, 3);
  assert.equal(payload.questions.length, 760);
  db.exec(
    readFileSync(
      new URL("../scripts/rollback-catalog-v3.sql", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(
    db.prepare("SELECT payload FROM question_bank").get()!.payload,
    '{"old":true}',
  );
  db.close();
});
