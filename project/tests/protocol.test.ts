import { test } from "node:test";
import assert from "node:assert/strict";
import { allowed, project, validCommand } from "../src/protocol.ts";
import { createGame, parseQuestions, transition } from "../src/engine.ts";
import { readFileSync } from "node:fs";
const q = parseQuestions(
  JSON.parse(
    readFileSync(new URL("../src/questions.json", import.meta.url), "utf8"),
  ),
);
test("captains cannot act for rivals or control host transitions", () => {
  assert.equal(
    allowed("red", "phones", { type: "SUBMIT_ANSWER", team: "blue", index: 0 }),
    false,
  );
  assert.equal(allowed("red", "phones", { type: "REVEAL_QUESTION" }), false);
  assert.equal(
    allowed("host", "phones", { type: "SUBMIT_ANSWER", team: "red", index: 0 }),
    false,
  );
  assert.equal(
    allowed("host", "single", { type: "BUZZ_SUDDEN", team: "blue" }),
    true,
  );
  assert.equal(allowed("viewer", "single", { type: "START" }), false);
});
test("projection never leaks bank, fallback, seed or unrevealed answers", () => {
  let s = createGame(q, ["a", "b"], 1);
  let p = project(s, "viewer")!;
  assert.equal("sudden" in p, false);
  assert.equal("seed" in p, false);
  assert.equal("question" in p.cells[0]!, false);
  s = transition(
    s,
    { type: "SELECT_CELL", team: s.turn, cellId: s.cells[0]!.id },
    0,
  );
  assert.equal(project(s, "viewer")!.current, null);
  assert.ok(project(s, "host")!.current?.correct_answer);
  s = transition(s, { type: "REVEAL_QUESTION" }, 0);
  p = project(s, "red")!;
  assert.equal("correct_answer" in p.current!, false);
  assert.equal("quick_fact" in p.current!, false);
});
test("wire validation rejects timer injection and invalid team/index/card", () => {
  assert.equal(validCommand({ type: "EXPIRE_TIMER", timerId: 1 }), false);
  assert.equal(
    validCommand({ type: "SUBMIT_ANSWER", team: "host", index: 0 }),
    false,
  );
  assert.equal(
    validCommand({ type: "SUBMIT_ANSWER", team: "red", index: 9 }),
    false,
  );
  assert.equal(
    validCommand({ type: "USE_JOKER", team: "red", card: "FAKE" }),
    false,
  );
});
