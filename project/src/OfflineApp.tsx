import { GameBoard } from "./GameBoard";
import { useEffect, useState } from "react";
import { CategoryPicker } from "./CategoryPicker";
import { categoryFor } from "./catalog";
import { createGame, parseQuestions, type GameAction, other } from "./engine";
import { useAinSeenEngine } from "./useAinSeenEngine";

export function OfflineApp() {
  const { state: s, start, reset, dispatch, remaining } = useAinSeenEngine();
  const [names, setNames] = useState<[string, string]>([
    "الفريق الأحمر",
    "الفريق الأزرق",
  ]);
  const [ids, setIds] = useState<string[]>([]);
  const [seconds, setSeconds] = useState(20);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [cached, setCached] = useState(false);
  const [reveal, setReveal] = useState(false);
  useEffect(() => {
    void import("./questions.json")
      .then(() => setReady(true))
      .catch(() => setError("حمّل ملفات وضع الأوفلاين أثناء الاتصال أولًا."));
  }, []);
  useEffect(() => setReveal(false), [s?.current?.id, s?.phase]);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let alive = true;
    void navigator.serviceWorker.ready.then(() => {
      if (alive) setCached(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  const begin = async () => {
    try {
      const bank = await import("./questions.json");
      start(
        createGame(
          parseQuestions(bank.default),
          names,
          crypto.getRandomValues(new Uint32Array(1))[0]!,
          ids,
          seconds,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const send = (a: GameAction) => dispatch(a);
  return (
    <main>
      <div className="toolbar">
        <h1>أوفلاين · شاشة واحدة</h1>
        <a href="#">الرئيسية</a>
      </div>
      <p>
        مقدم وفريقان على الجهاز نفسه، دون غرف أو جوالات. يمكن للمقدم المشاركة مع
        أي فريق؛ الإجابة الصحيحة مخفية حتى انتهاء السؤال.
      </p>
      <p role="status">
        {cached
          ? "تم تجهيز ملفات اللعب دون إنترنت على هذا الجهاز."
          : "لأول استخدام: افتح اللعبة بالإنترنت وانتظر اكتمال تجهيز الملفات قبل قطع الاتصال."}
      </p>
      {error && <p role="alert">{error}</p>}
      {!s ? (
        <>
          <section className="panel">
            <h2>جهّز القيم</h2>
            {names.map((name, i) => (
              <label key={i}>
                اسم الفريق {i + 1}
                <input
                  maxLength={32}
                  value={name}
                  onChange={(e) =>
                    setNames(
                      i === 0
                        ? [e.target.value, names[1]]
                        : [names[0], e.target.value],
                    )
                  }
                />
              </label>
            ))}
            <label>
              مدة الدور: {seconds} ثانية
              <input
                aria-label="مدة الدور أوفلاين"
                type="range"
                min={20}
                max={120}
                value={seconds}
                onChange={(e) => setSeconds(Number(e.target.value))}
              />
            </label>
            <p>
              {ready
                ? "بنك الأسئلة جاهز على هذا الجهاز."
                : "جارٍ تجهيز الأسئلة…"}
            </p>
          </section>
          <CategoryPicker value={ids} onChange={setIds}>
            <button
              disabled={
                !ready || ids.length !== 6 || names.some((n) => !n.trim())
              }
              onClick={() => void begin()}
            >
              ابدأ مباراة أوفلاين · ٣٦ سؤالًا
            </button>
          </CategoryPicker>
        </>
      ) : (
        <>
          <div className="scores">
            {(["red", "blue"] as const).map((t) => (
              <section className={`score ${t}`} key={t}>
                <b>{s.teams[t].name}</b>
                <strong>{s.teams[t].score}</strong>
              </section>
            ))}
          </div>
          <div className="toolbar">
            <b>الدور: {s.teams[s.turn].name}</b>
            <span>
              {s.cells.filter((c) => c.status === "exhausted").length} / ٣٦
            </span>
            <button onClick={() => send({ type: "END_MATCH" })}>
              إنهاء المباراة
            </button>
          </div>
          {s.phase === "BOARD" ? (
            <GameBoard
              cells={s.cells}
              enabled={true}
              onSelect={(cellId) =>
                send({ type: "SELECT_CELL", team: s.turn, cellId })
              }
            />
          ) : s.phase === "FINISHED" ? (
            <section className="panel">
              <h2>
                {s.winner ? `الفائز: ${s.teams[s.winner].name}` : "انتهى القيم"}
              </h2>
              <button onClick={reset}>مباراة جديدة</button>
            </section>
          ) : (
            <section className="panel question">
              {s.phase === "PREPARE" ? (
                <>
                  <h2>
                    {s.current?.category} · {s.current?.points}
                  </h2>
                  <button
                    onClick={() =>
                      send({ type: "TRIGGER_DOUBLE_DOWN", team: s.turn })
                    }
                    disabled={s.double || s.teams[s.turn].doubleUsed}
                  >
                    مضاعفة قبل السؤال
                  </button>
                  <button
                    className="primary"
                    onClick={() => send({ type: "REVEAL_QUESTION" })}
                  >
                    إظهار السؤال وبدء الوقت
                  </button>
                </>
              ) : (
                <>
                  <h2>{s.current?.question}</h2>
                  {s.deadline !== null && (
                    <p role="timer">
                      الوقت: {Math.ceil(remaining / 1000)} ثانية
                    </p>
                  )}
                  {["MAIN", "STEAL_ANSWER", "SUDDEN_ANSWER"].includes(
                    s.phase,
                  ) &&
                    s.answerTeam && (
                      <>
                        <p>
                          إجابة فريق {s.teams[s.answerTeam].name}؛ يختارها
                          الفريق أو المقدم نيابة عنه.
                        </p>
                        <div className="options">
                          {s.current?.options.map((o, i) => (
                            <button
                              key={i}
                              disabled={s.hidden.includes(i)}
                              onClick={() =>
                                send({
                                  type: "SUBMIT_ANSWER",
                                  team: s.answerTeam!,
                                  index: i,
                                })
                              }
                            >
                              {o}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  {s.phase === "MAIN" && (
                    <div className="toolbar">
                      <button
                        disabled={
                          !s.teams[s.turn].inventory.includes("FIFTY_FIFTY")
                        }
                        onClick={() =>
                          send({
                            type: "USE_JOKER",
                            team: s.turn,
                            card: "FIFTY_FIFTY",
                          })
                        }
                      >
                        شيل خيارين
                      </button>
                      <button
                        disabled={!s.teams[s.turn].inventory.includes("SWAP")}
                        onClick={() =>
                          send({
                            type: "USE_JOKER",
                            team: s.turn,
                            card: "SWAP",
                          })
                        }
                      >
                        تثبيت المخ
                      </button>
                      <button
                        disabled={
                          !s.teams[other(s.turn)].inventory.includes("FREEZE")
                        }
                        onClick={() =>
                          send({
                            type: "USE_JOKER",
                            team: other(s.turn),
                            card: "FREEZE",
                          })
                        }
                      >
                        عين حارة للمنافس
                      </button>
                    </div>
                  )}
                  {s.phase === "STEAL_BUZZ" && (
                    <button
                      onClick={() =>
                        send({ type: "BUZZ_STEAL", team: other(s.turn) })
                      }
                    >
                      خطف: {s.teams[other(s.turn)].name}
                    </button>
                  )}
                  {s.phase === "SUDDEN_BUZZ" &&
                    (["red", "blue"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => send({ type: "BUZZ_SUDDEN", team: t })}
                      >
                        {s.teams[t].name} · بزر الفاصل
                      </button>
                    ))}
                  {s.phase === "RESOLUTION" && (
                    <>
                      <h2>{s.result}</h2>
                      <button onClick={() => setReveal(!reveal)}>
                        {reveal ? "إخفاء الإجابة" : "كشف الإجابة الصحيحة"}
                      </button>
                      {reveal && <p>{s.current?.answer}</p>}
                      <button
                        className="primary"
                        onClick={() => send({ type: "RESOLVE_ROUND" })}
                      >
                        التالي
                      </button>
                    </>
                  )}
                </>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
