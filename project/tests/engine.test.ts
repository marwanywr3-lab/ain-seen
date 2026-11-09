import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  transition,
  parseQuestions,
  other,
  type Question,
} from "../src/engine.ts";
// Generated fixtures exercise rules only; no fixture is shipped as game content.
const questions: Question[] = Array.from({ length: 12 }, (_, category) =>
  [100, 200, 300].flatMap((points) =>
    Array.from({ length: 3 }, (_, n) => ({
      id: category * 100 + points * 3 + n,
      category: category === 0 ? "ألغاز" : `فئة ${category}`,
      points: points as 100 | 200 | 300,
      difficulty: "اختبار",
      question: `سؤال ${category} ${points} ${n}`,
      options: ["صحيح", "خطأ ١", "خطأ ٢", "خطأ ٣"],
      correct_answer: "صحيح",
      quick_fact: "اختبار",
    })),
  ),
).flat();
const game = () => createGame(questions, ["أحمر", "أزرق"], 42);
function main() {
  let s = game();
  s = transition(
    s,
    { type: "SELECT_CELL", team: s.turn, cellId: s.cells[0]!.id },
    0,
  );
  return transition(s, { type: "REVEAL_QUESTION" }, 0);
}
test("schema rejects duplicate ids and invalid answers", () => {
  assert.throws(() => parseQuestions([questions[0], questions[0]]));
  assert.throws(() =>
    parseQuestions([{ ...questions[0], correct_answer: "ناقص" }]),
  );
});
test("same seed produces same board and reserves unused sudden question", () => {
  const a = game();
  assert.deepEqual(a, game());
  assert.ok(
    a.cells.every(
      (c) => c.question.id !== a.sudden.id && c.fallback.id !== a.sudden.id,
    ),
  );
});
test("late correct answer expires main round without credit", () => {
  const s = main();
  const n = transition(
    s,
    { type: "SUBMIT_ANSWER", team: s.turn, index: 0 },
    20000,
  );
  assert.equal(n.phase, "STEAL_BUZZ");
  assert.equal(n.teams[s.turn].score, 0);
});
test("double down penalty and steal half penalty are applied exactly once", () => {
  let s = game();
  s = transition(
    s,
    { type: "SELECT_CELL", team: s.turn, cellId: s.cells[0]!.id },
    0,
  );
  const team = s.turn;
  s = transition(s, { type: "TRIGGER_DOUBLE_DOWN", team }, 0);
  s = transition(s, { type: "REVEAL_QUESTION" }, 0);
  s = transition(s, { type: "SUBMIT_ANSWER", team, index: 1 }, 100);
  assert.equal(s.teams[team].score, -200);
  s = transition(s, { type: "BUZZ_STEAL", team: other(team) }, 200);
  const timer = s.timerId;
  s = transition(s, { type: "EXPIRE_TIMER", timerId: timer }, 7200);
  assert.equal(s.teams[other(team)].score, -50);
  assert.strictEqual(
    transition(s, { type: "EXPIRE_TIMER", timerId: timer }, 8000),
    s,
  );
});
test("freeze halves remaining time and is single use", () => {
  let s = main();
  const team = other(s.turn);
  s = transition(s, { type: "USE_JOKER", team, card: "FREEZE" }, 10000);
  assert.equal(s.deadline, 15000);
  assert.strictEqual(
    transition(s, { type: "USE_JOKER", team, card: "FREEZE" }, 11000),
    s,
  );
});
test("fifty fifty hides two wrong indices and swap clears hidden options", () => {
  let s = main();
  const team = s.turn;
  s = transition(s, { type: "USE_JOKER", team, card: "FIFTY_FIFTY" }, 100);
  assert.equal(new Set(s.hidden).size, 2);
  assert.ok(!s.hidden.includes(0));
  const prior = s.current!.id;
  s = transition(s, { type: "USE_JOKER", team, card: "SWAP" }, 200);
  assert.notEqual(s.current!.id, prior);
  assert.deepEqual(s.hidden, []);
  assert.equal(s.deadline, 20000);
});
test("buzzer locks and stale timers cannot expire new answer phase", () => {
  let s = main();
  const team = other(s.turn);
  s = transition(s, { type: "SUBMIT_ANSWER", team: s.turn, index: 1 }, 100);
  const timer = s.timerId;
  s = transition(s, { type: "BUZZ_STEAL", team }, 200);
  assert.strictEqual(transition(s, { type: "BUZZ_STEAL", team }, 201), s);
  assert.strictEqual(
    transition(s, { type: "EXPIRE_TIMER", timerId: timer }, 7100),
    s,
  );
});
test("final tie enters sudden death; first buzzer has exclusive answer and timeout loses", () => {
  let s = main();
  s = transition(s, { type: "SUBMIT_ANSWER", team: s.turn, index: 1 }, 100);
  s = transition(s, { type: "EXPIRE_TIMER", timerId: s.timerId }, 7100);
  s = {
    ...s,
    cells: s.cells.map((c) =>
      c.id === s.activeId ? c : { ...c, status: "exhausted" },
    ),
  };
  s = transition(s, { type: "RESOLVE_ROUND" }, 7200);
  assert.equal(s.phase, "SUDDEN_BUZZ");
  s = transition(s, { type: "BUZZ_SUDDEN", team: "red" }, 7300);
  assert.strictEqual(
    transition(s, { type: "BUZZ_SUDDEN", team: "blue" }, 7301),
    s,
  );
  s = transition(s, { type: "EXPIRE_TIMER", timerId: s.timerId }, 12300);
  assert.equal(s.winner, "blue");
  assert.equal(s.phase, "FINISHED");
});

test("approved 120 questions support 100 seeds with complete boards and reserved sudden questions", async () => {
  const { readFile } = await import("node:fs/promises");
  const real = parseQuestions(
    JSON.parse(
      await readFile(new URL("../src/questions.json", import.meta.url), "utf8"),
    ),
  );
  assert.equal(real.length, 120);
  for (let seed = 0; seed < 100; seed++) {
    const s = createGame(real, ["أ", "ب"], seed);
    assert.equal(s.cells.length, 36);
    assert.equal(new Set(s.cells.map((c) => c.id)).size, 36);
    for (const c of s.cells) {
      assert.notEqual(c.question.id, c.fallback.id);
      assert.notEqual(c.question.id, s.sudden.id);
      assert.notEqual(c.fallback.id, s.sudden.id);
      assert.equal(c.question.category, c.fallback.category);
      assert.equal(c.question.points, c.fallback.points);
    }
  }
});
