import { useEffect, useRef, useState } from "react";
import { categories, POINTS, SOLO_DURATION_SECONDS, SOLO_QUESTION_COUNT } from "./catalog";
import { parseQuestions, type Question } from "./engine";

type Stage = "loading" | "selecting" | "playing" | "finished";
function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
function buildDeck(bank: Question[], selectedIds: string[]): Question[] {
  if (selectedIds.length !== 6 || new Set(selectedIds).size !== 6)
    throw new Error("اختر ٦ فئات مختلفة لبدء التحدي");
  const picked = selectedIds.map((id) => categories.find((category) => category.id === id));
  if (picked.some((category) => !category)) throw new Error("إحدى الفئات غير متاحة");
  const selected = picked as (typeof categories)[number][];
  if (selected.some((category) => POINTS.some((points) => !bank.some((q) => q.categoryId === category.id && q.points === points))))
    throw new Error("تحتاج إحدى الفئات إلى أسئلة إضافية لبدء التحدي");
  const deck = selected.flatMap((category) =>
    POINTS.map((points) => {
      const pool = bank.filter((q) => q.categoryId === category.id && q.points === points);
      const question = pool[Math.floor(Math.random() * pool.length)]!;
      return { ...question, options: shuffle(question.options) };
    }),
  );
  return shuffle(deck);
}
function timeText(seconds: number) {
  const mm = Math.floor(seconds / 60).toLocaleString("ar-SA");
  const ss = String(seconds % 60).padStart(2, "0").replace(/\d/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[Number(digit)]!);
  return `${mm}:${ss}`;
}

export function SoloChallenge() {
  const [bank, setBank] = useState<Question[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [stage, setStage] = useState<Stage>("loading");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deck, setDeck] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(SOLO_DURATION_SECONDS);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [correct, setCorrect] = useState(0);
  const deadline = useRef(0);

  useEffect(() => {
    let live = true;
    void import("./questions.json").then((module) => {
      if (live) {
        setBank(parseQuestions(module.default));
        setStage("selecting");
      }
    }).catch((error: unknown) => {
      if (live) {
        setLoadError(error instanceof Error ? error.message : "تعذّر تحميل الأسئلة");
        setStage("selecting");
      }
    });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (stage !== "playing") return;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setSeconds(remaining);
      if (remaining === 0) setStage("finished");
    };
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [stage]);

  const start = () => {
    if (!bank || selectedIds.length !== 6) return;
    try {
      setDeck(buildDeck(bank, selectedIds));
      setIndex(0);
      setChosen(null);
      setScore(0);
      setAnswered(0);
      setCorrect(0);
      setSeconds(SOLO_DURATION_SECONDS);
      deadline.current = Date.now() + SOLO_DURATION_SECONDS * 1000;
      setStage("playing");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "تعذّر بدء التحدي");
    }
  };
  const question = deck[index];
  const choose = (option: string) => {
    if (!question || chosen !== null || Date.now() >= deadline.current) return;
    setChosen(option);
    setAnswered((value) => value + 1);
    if (option === question.answer) {
      setCorrect((value) => value + 1);
      setScore((value) => value + question.points);
    }
  };
  const advance = () => {
    if (index + 1 >= deck.length) setStage("finished");
    else {
      setIndex((value) => value + 1);
      setChosen(null);
    }
  };

  return (
    <main className="solo-page">
      <a className="solo-back" href="#">العودة للقائمة الرئيسية</a>
      {stage === "loading" && <section className="solo-card" role="status">جارٍ تجهيز بنك الأسئلة…</section>}
      {stage === "selecting" && (
        <section className="solo-card">
          <span className="solo-kicker">تحدي فردي</span>
          <h1>اختر فئات التحدي</h1>
          <p>اختر ٦ فئات من أصل ٣٨. سيضم التحدي ١٨ سؤالًا من اختياراتك، ووقته ٣ دقائق.</p>
          <div className="solo-picker-heading"><b>الفئات المختارة</b><strong role="status">{selectedIds.length.toLocaleString("ar-SA")} / ٦</strong></div>
          <div className="solo-category-grid">
            {categories.map((category) => {
              const selected = selectedIds.includes(category.id);
              return (
                <button
                  type="button"
                  key={category.id}
                  className={selected ? "solo-category-choice chosen" : "solo-category-choice"}
                  aria-pressed={selected}
                  disabled={!selected && selectedIds.length === 6}
                  onClick={() => setSelectedIds((current) => selected ? current.filter((id) => id !== category.id) : [...current, category.id])}
                >
                  <img src={"./redesign/categories/" + category.id + ".webp"} alt="" loading="lazy" width="96" height="96" />
                  <span>{category.name.split(" (")[0]}</span>
                  <b aria-hidden="true">{selected ? "✓" : "+"}</b>
                </button>
              );
            })}
          </div>
          <p>كل فئة تمنحك سؤالًا بقيمة ٢٠٠ وآخر بـ٤٠٠ وثالثًا بـ٦٠٠ نقطة. الإجابة الخاطئة أو التخطي لا يخصم نقاطًا.</p>
          {loadError && <p className="error" role="alert">{loadError}</p>}
          <button className="primary" disabled={!bank || selectedIds.length !== 6} onClick={start}>ابدأ التحدي</button>
        </section>
      )}
      {stage === "playing" && question && (
        <section className="solo-card">
          <div className="solo-stats">
            <span>السؤال { (index + 1).toLocaleString("ar-SA") } / { SOLO_QUESTION_COUNT.toLocaleString("ar-SA") }</span>
            <span>النقاط {score.toLocaleString("ar-SA")}</span>
            <strong className={seconds <= 20 ? "urgent" : ""} role="timer" aria-live="off">{timeText(seconds)}</strong>
          </div>
          <div className="solo-progress" aria-label={`السؤال ${index + 1} من ${SOLO_QUESTION_COUNT}`}><i style={{ width: `${((index + 1) / SOLO_QUESTION_COUNT) * 100}%` }} /></div>
          <p className="solo-category">{question.category} <span>· {question.points.toLocaleString("ar-SA")} نقطة</span></p>
          <h1 className="solo-question">{question.question}</h1>
          <div className="solo-options">
            {question.options.map((option, optionIndex) => (
              <button
                key={option}
                disabled={chosen !== null}
                className={chosen === option ? option === question.answer ? "correct" : "incorrect" : chosen !== null && option === question.answer ? "correct" : ""}
                onClick={() => choose(option)}
              >
                <span>{String.fromCharCode(65 + optionIndex)}</span>{option}
              </button>
            ))}
          </div>
          <div className="solo-actions">
            {chosen === null ? (
              <button onClick={advance}>تخطي السؤال ←</button>
            ) : (
              <>
                <p className={chosen === question.answer ? "solo-right" : "solo-wrong"} role="status">
                  {chosen === question.answer ? `إجابة صحيحة! أُضيفت ${question.points.toLocaleString("ar-SA")} نقطة.` : `الإجابة الصحيحة: ${question.answer}`}
                </p>
                <button className="primary" onClick={advance}>السؤال التالي ←</button>
              </>
            )}
          </div>
        </section>
      )}
      {stage === "finished" && (
        <section className="solo-card solo-result">
          <span className="solo-kicker">انتهى التحدي</span>
          <h1>{score.toLocaleString("ar-SA")} نقطة</h1>
          <p>إجابات صحيحة: {correct.toLocaleString("ar-SA")} · أُجيب عن {answered.toLocaleString("ar-SA")} من {SOLO_QUESTION_COUNT.toLocaleString("ar-SA")} سؤالًا</p>
          <p>الوقت: {timeText(seconds)}</p>
          <div className="solo-actions">
            <button className="primary" onClick={start}>العب مرة أخرى</button>
            <button onClick={() => setStage("selecting")}>اختيار فئات جديدة</button>
            <a className="solo-back" href="#">العودة للقائمة الرئيسية</a>
          </div>
        </section>
      )}
    </main>
  );
}
