import { useEffect, useRef, useState } from "react";
import { categories, POINTS, SOLO_DURATION_SECONDS, SOLO_QUESTION_COUNT } from "./catalog";
import { parseQuestions, type Question } from "./engine";

type Stage = "loading" | "intro" | "playing" | "finished";
function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
function buildDeck(bank: Question[]): Question[] {
  const eligible = categories.filter((category) =>
    POINTS.every((points) => bank.some((q) => q.categoryId === category.id && q.points === points)),
  );
  if (eligible.length < 6) throw new Error("لا توجد فئات كافية لبدء التحدي");
  const picked = shuffle([...eligible]).slice(0, 6);
  const deck = picked.flatMap((category) =>
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
        setStage("intro");
      }
    }).catch((error: unknown) => {
      if (live) {
        setLoadError(error instanceof Error ? error.message : "تعذّر تحميل الأسئلة");
        setStage("intro");
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
    if (!bank) return;
    try {
      setDeck(buildDeck(bank));
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
      {stage === "intro" && (
        <section className="solo-card">
          <span className="solo-kicker">تحدي فردي</span>
          <h1>كم سؤالًا تقدر تحل؟</h1>
          <p>أجب عن أكبر عدد من ١٨ سؤالًا من ٦ فئات خلال ٣ دقائق. ستُختار الفئات والأسئلة عشوائيًا في كل محاولة.</p>
          <p>تُضاف نقاط السؤال عند الإجابة الصحيحة، ولا تُخصم نقاط عند الخطأ. يمكنك تخطي السؤال ومتابعة التحدي.</p>
          {loadError && <p className="error" role="alert">{loadError}</p>}
          <button className="primary" disabled={!bank} onClick={start}>ابدأ التحدي</button>
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
            <a className="solo-back" href="#">العودة للقائمة الرئيسية</a>
          </div>
        </section>
      )}
    </main>
  );
}
