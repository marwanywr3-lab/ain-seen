import bundledQuestions from "./questions.json";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createGame,
  parseQuestions,
  other,
  type Question,
  type JokerCard,
  type TeamId,
} from "./engine";
import { useAinSeenEngine } from "./useAinSeenEngine";
import "./style.css";
const icon = new URL("../icon.png", import.meta.url).href;
const wordmark = new URL("../wordmark.png", import.meta.url).href;
const cardNames: Record<JokerCard, string> = {
  FREEZE: "عين حارة",
  SWAP: "تثبيت المخ",
  FIFTY_FIFTY: "شيل خيارين",
};
function App() {
  const { state: s, start, reset, dispatch, remaining } = useAinSeenEngine();
  const [questions, setQuestions] = useState<Question[]>(() =>
    parseQuestions(bundledQuestions),
  );
  const [names, setNames] = useState<[string, string]>([
    "الفريق الأحمر",
    "الفريق الأزرق",
  ]);
  const [error, setError] = useState("");
  const [animation, setAnimation] = useState<
    "intro" | "match" | "turn" | "end" | null
  >("intro");
  const [view, setView] = useState<"host" | "display">("host");
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    if (!animation) return;
    const timer = setTimeout(
      () => setAnimation(null),
      animation === "turn" ? 2400 : 2100,
    );
    return () => clearTimeout(timer);
  }, [animation]);
  useEffect(() => {
    setSelected(null);
  }, [s?.current?.id]);
  useEffect(() => {
    setSelected(null);
    if (s?.phase === "BOARD" && s.round > 0) setAnimation("turn");
    if (s?.phase === "FINISHED") setAnimation("end");
  }, [s?.phase, s?.round]);
  const load = async (file: File) => {
    try {
      setQuestions(parseQuestions(JSON.parse(await file.text())));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر قراءة الملف");
    }
  };
  const begin = () => {
    try {
      start(
        createGame(
          questions,
          names,
          crypto.getRandomValues(new Uint32Array(1))[0]!,
        ),
      );
      setAnimation("match");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const categories = s ? [...new Set(s.cells.map((c) => c.category))] : [];
  const seconds = Math.ceil(remaining / 1000);
  const duration =
    s?.phase === "MAIN" ? 20000 : s?.phase === "SUDDEN_ANSWER" ? 5000 : 7000;
  const answerEnabled =
    s && ["MAIN", "STEAL_ANSWER", "SUDDEN_ANSWER"].includes(s.phase);
  const host = view === "host";
  return (
    <>
      <header>
        <img src={wordmark} alt="عين سين" />
        <nav>
          <span className="pill">
            المرحلة الأولى · جلسة المقدم على جهاز واحد
          </span>
          {s && (
            <button onClick={() => setView(host ? "display" : "host")}>
              {host ? "شاشة العرض" : "لوحة المقدم"}
            </button>
          )}
        </nav>
      </header>
      {!s ? (
        <main className="setup">
          <section className="hero">
            <span className="pill">مسابقة • تشاور • خطف</span>
            <h1>
              عين على السؤال،
              <br />
              <em>وسين على الفوز.</em>
            </h1>
            <p>فريقان، مقدم واحد، و٣٦ فرصة تقلب النتيجة.</p>
            <img className="hero-icon" src={icon} alt="أيقونة عين سين" />
          </section>
          <section className="panel">
            <h2>جهّز الجلسة</h2>
            <label>
              اسم الفريق الأحمر
              <input
                value={names[0]}
                maxLength={32}
                onChange={(e) => setNames([e.target.value, names[1]])}
              />
            </label>
            <label>
              اسم الفريق الأزرق
              <input
                value={names[1]}
                maxLength={32}
                onChange={(e) => setNames([names[0], e.target.value])}
              />
            </label>
            <label className="upload">
              استبدال مجموعة الأسئلة (اختياري)
              <input
                type="file"
                accept=".json,application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void load(file);
                }}
              />
            </label>
            <small>
              {questions.length
                ? `${questions.length} سؤالًا جاهزًا للمباراة`
                : "استخدم مجموعة الأسئلة المعتمدة: ١٢ فئة، وسؤالان أو أكثر لكل قيمة."}
            </small>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button
              className="primary"
              disabled={!questions.length}
              onClick={begin}
            >
              ابدأ القيم ←
            </button>
            <p className="note">
              جلسة المرحلة الأولى يديرها المقدم من هذا الجهاز. ربط الجوالات
              والغرف في المرحلة الثانية.
            </p>
          </section>
        </main>
      ) : (
        <main>
          <div className="scores">
            {(["red", "blue"] as const).map((team) => (
              <section
                key={team}
                className={`score ${team} ${s.turn === team ? "current" : ""}`}
              >
                <span>{s.teams[team].name}</span>
                <strong key={s.teams[team].score}>
                  {s.teams[team].score.toLocaleString("ar-SA")}
                </strong>
                <small>
                  {s.phase === "BOARD" && s.turn === team
                    ? "عليه الاختيار"
                    : team === "red"
                      ? "الفريق الأحمر"
                      : "الفريق الأزرق"}
                </small>
              </section>
            ))}
          </div>
          <div className="toolbar">
            <span>
              {s.cells.filter((c) => c.status === "exhausted").length} / ٣٦
              سؤالًا
            </span>
            <b>
              {s.phase === "BOARD"
                ? `الدور على ${s.teams[s.turn].name}`
                : s.phase === "SUDDEN_BUZZ"
                  ? "مخمخ وفاصل"
                  : s.result || "عينك على السؤال"}
            </b>
            {host && s.phase !== "FINISHED" && (
              <button
                onClick={() => {
                  if (confirm("إنهاء المباراة الحالية؟"))
                    dispatch({ type: "END_MATCH" });
                }}
              >
                إنهاء المباراة
              </button>
            )}
          </div>
          {s.phase === "BOARD" ? (
            <section className="board">
              {categories.map((category, i) => (
                <article className={`category tint-${i % 4}`} key={category}>
                  <h3>
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    {category}
                  </h3>
                  {s.cells
                    .filter((c) => c.category === category)
                    .map((c) => (
                      <button
                        disabled={!host || c.status !== "available"}
                        key={c.id}
                        onClick={() =>
                          dispatch({
                            type: "SELECT_CELL",
                            cellId: c.id,
                            team: s.turn,
                          })
                        }
                      >
                        {c.status === "exhausted"
                          ? "✓"
                          : c.points.toLocaleString("ar-SA")}
                      </button>
                    ))}
                </article>
              ))}
            </section>
          ) : s.phase === "FINISHED" ? (
            <section className="panel finish">
              <span className="pill">ختام القيم</span>
              <h1>
                {s.winner
                  ? `الفائز: ${s.teams[s.winner].name}`
                  : "انتهت المباراة"}
              </h1>
              <p>{s.result}</p>
              {(["red", "blue"] as TeamId[])
                .sort((a, b) => s.teams[b].score - s.teams[a].score)
                .map((team) => (
                  <div className={`final-row ${team}`} key={team}>
                    <b>{s.teams[team].name}</b>
                    <strong>
                      {s.teams[team].score.toLocaleString("ar-SA")} نقطة
                    </strong>
                  </div>
                ))}
              {host && (
                <button className="primary" onClick={reset}>
                  جلسة جديدة
                </button>
              )}
            </section>
          ) : (
            <section className="question panel">
              <div className="question-top">
                <span className="pill">{s.current?.category}</span>
                <span className="pill">
                  {s.current?.points} نقطة {s.double ? "× ٢" : ""}
                </span>
              </div>
              {s.phase === "PREPARE" ? (
                <div className="prepare">
                  <h1>جاهزين للتحدي؟</h1>
                  <p>قرار عين التحدي قبل ما ينكشف السؤال.</p>
                  {host && (
                    <>
                      <button
                        disabled={s.teams[s.turn].doubleUsed}
                        onClick={() =>
                          dispatch({
                            type: "TRIGGER_DOUBLE_DOWN",
                            team: s.turn,
                          })
                        }
                      >
                        {s.double
                          ? "عين التحدي مفعّلة × ٢"
                          : s.teams[s.turn].doubleUsed
                            ? "استُخدمت عين التحدي"
                            : "فعّل عين التحدي × ٢"}
                      </button>
                      <button
                        className="primary"
                        onClick={() => dispatch({ type: "REVEAL_QUESTION" })}
                      >
                        اكشف السؤال وابدأ الوقت
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <h2>{s.current?.question}</h2>
                  {s.deadline !== null && (
                    <div className={`timer ${seconds < 5 ? "urgent" : ""}`}>
                      <strong>{seconds.toLocaleString("ar-SA")}</strong>
                      <div className="track">
                        <i
                          style={{
                            width: `${Math.min(100, (remaining / duration) * 100)}%`,
                          }}
                        />
                      </div>
                      <small>
                        {s.phase === "STEAL_BUZZ"
                          ? "انتظار بزر الخطف"
                          : s.answerTeam
                            ? `إجابة ${s.teams[s.answerTeam].name}`
                            : ""}
                      </small>
                    </div>
                  )}
                  <div className="options">
                    {s.current?.options.map((option, index) => (
                      <button
                        className={`${selected === index ? "selected" : ""} ${s.phase === "RESOLUTION" && option === s.current?.correct_answer ? "correct" : ""}`}
                        key={index}
                        disabled={
                          !host || !answerEnabled || s.hidden.includes(index)
                        }
                        style={{
                          visibility: s.hidden.includes(index)
                            ? "hidden"
                            : "visible",
                        }}
                        onClick={() => setSelected(index)}
                      >
                        <span>{["أ", "ب", "ج", "د"][index]}</span>
                        {option}
                      </button>
                    ))}
                  </div>
                  {host && answerEnabled && (
                    <button
                      className="primary"
                      disabled={selected === null}
                      onClick={() => {
                        if (selected !== null)
                          dispatch({
                            type: "SUBMIT_ANSWER",
                            team: s.answerTeam!,
                            index: selected,
                          });
                      }}
                    >
                      اعتماد إجابة {s.teams[s.answerTeam!].name}
                    </button>
                  )}
                  {s.phase === "STEAL_BUZZ" && (
                    <div className="steal">
                      <h2>فرصة الخطف!</h2>
                      {host && (
                        <button
                          className={`buzzer ${other(s.turn)}`}
                          onClick={() =>
                            dispatch({
                              type: "BUZZ_STEAL",
                              team: other(s.turn),
                            })
                          }
                        >
                          بزر {s.teams[other(s.turn)].name}
                        </button>
                      )}
                    </div>
                  )}
                  {s.phase === "SUDDEN_BUZZ" && (
                    <div className="steal">
                      <h2>مخمخ وفاصل — أول بزر يحسم</h2>
                      {host &&
                        (["red", "blue"] as const).map((team) => (
                          <button
                            className={`buzzer ${team}`}
                            key={team}
                            onClick={() =>
                              dispatch({ type: "BUZZ_SUDDEN", team })
                            }
                          >
                            {s.teams[team].name}
                          </button>
                        ))}
                    </div>
                  )}
                  {s.phase === "RESOLUTION" && (
                    <div className="resolution">
                      <h2>{s.result}</h2>
                      <b>الإجابة: {s.current?.correct_answer}</b>
                      <p>{s.current?.quick_fact}</p>
                      {host && (
                        <button
                          className="primary"
                          onClick={() => dispatch({ type: "RESOLVE_ROUND" })}
                        >
                          التالي ←
                        </button>
                      )}
                    </div>
                  )}
                  {host && s.phase === "MAIN" && (
                    <div className="trays">
                      {(["red", "blue"] as const).map((team) => (
                        <div className={`tray ${team}`} key={team}>
                          <b>{s.teams[team].name}</b>
                          {(["FREEZE", "SWAP", "FIFTY_FIFTY"] as const).map(
                            (card) => (
                              <button
                                key={card}
                                disabled={
                                  !s.teams[team].inventory.includes(card) ||
                                  (card === "FREEZE"
                                    ? team === s.turn
                                    : team !== s.turn)
                                }
                                onClick={() =>
                                  dispatch({ type: "USE_JOKER", team, card })
                                }
                              >
                                {cardNames[card]}{" "}
                                {!s.teams[team].inventory.includes(card) && "✓"}
                              </button>
                            ),
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>
          )}
          {host && s.audit.length > 0 && (
            <details className="audit">
              <summary>سجل النقاط ({s.audit.length})</summary>
              {s.audit.map((log, i) => (
                <p key={i}>
                  الجولة {log.round} · {s.teams[log.team].name} · {log.reason} ·{" "}
                  {log.delta > 0 ? "+" : ""}
                  {log.delta} ← {log.after}
                </p>
              ))}
            </details>
          )}
        </main>
      )}
      <footer>عين سين · خذوا راحتكم بالتشاور، والقرار للقائد.</footer>
      {animation && (
        <div className={`animation ${animation}`} aria-hidden="true">
          <img src={animation === "intro" ? icon : wordmark} alt="" />
          {animation === "turn" && s && (
            <div className={`turn-title ${s.turn}`}>
              <small>الدور الآن</small>
              <h1>{s.teams[s.turn].name}</h1>
            </div>
          )}
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
