import { useEffect, useState } from "react";
import { api } from "./client";
import { createGame, parseQuestions, type Question } from "./engine";
interface Bank {
  questions: Question[];
  disabled: number[];
  revision: number;
}
const blank: Question = {
  id: 0,
  category: "",
  points: 100,
  difficulty: "سهل",
  question: "",
  options: ["", "", "", ""],
  correct_answer: "",
  quick_fact: "",
};
export function Admin({ base }: { base: string }) {
  const authHeaders: Record<string, string> = import.meta.env.DEV
    ? { Authorization: "Bearer local-test-only" }
    : {};
  const [bank, setBank] = useState<Bank | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [points, setPoints] = useState("");
  const [edit, setEdit] = useState<Question | null>(null);
  const [saving, setSaving] = useState(false);
  const load = async () => {
    try {
      setBank(
        await api<Bank>(base, "/admin/bank", {
          credentials: "include",
          headers: authHeaders,
        }),
      );
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    if (base) void load();
  }, [base]);
  const save = async (next: Bank) => {
    setSaving(true);
    setError("");
    try {
      parseQuestions(next.questions);
      const res = await api<{ revision: number }>(base, "/admin/bank", {
        method: "PUT",
        credentials: "include",
        headers: authHeaders,
        body: JSON.stringify(next),
      });
      setBank({ ...next, revision: res.revision });
      setEdit(null);
      setNotice("حُفظت التغييرات. المباريات الجارية تحتفظ بأسئلتها.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const exportBank = () => {
    if (!bank) return;
    const blob = new Blob([JSON.stringify(bank, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ain-seen-bank-r${bank.revision}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importBank = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      const questions = parseQuestions(
        Array.isArray(data) ? data : data.questions,
      );
      const disabled = Array.isArray(data.disabled) ? data.disabled : [];
      if (!bank) return;
      if (
        confirm(
          `استيراد ${questions.length} سؤالًا بدل المجموعة الحالية؟ نزّل نسخة احتياطية أولًا إذا احتجتها.`,
        )
      )
        await save({ questions, disabled, revision: bank.revision });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  let capacity = "";
  if (bank)
    try {
      createGame(
        bank.questions.filter((q) => !bank.disabled.includes(q.id)),
        ["أ", "ب"],
        1,
      );
    } catch (e) {
      capacity = (e as Error).message;
    }
  return (
    <main>
      <section className="panel">
        <span className="pill">إدارة خاصة</span>
        <h1>بوابة الأسئلة</h1>
        {capacity && (
          <p className="error" role="alert">
            تنبيه توفر الأسئلة: {capacity}
          </p>
        )}
        <p>إضافة وتعديل وتعطيل، دون تغيير المباريات الجارية.</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        {!bank ? (
          <>
            <p>
              الدخول محمي بـCloudflare Access. افتح رابط تسجيل الدخول للخدمة، ثم
              ارجع وحدّث المجموعة.
            </p>
            <a href={`${base}/admin/bank`} target="_blank" rel="noreferrer">
              تسجيل دخول الإدارة
            </a>
            <button onClick={() => void load()}>تحديث</button>
          </>
        ) : (
          <>
            <div className="toolbar">
              <b>
                {bank.questions.length} سؤال · الإصدار {bank.revision}
              </b>
              <button
                onClick={() =>
                  setEdit({
                    ...blank,
                    id: Math.max(...bank.questions.map((q) => q.id), 0) + 1,
                  })
                }
              >
                إضافة سؤال
              </button>
              <button onClick={exportBank}>تصدير نسخة احتياطية</button>
              <button onClick={() => void load()}>إعادة التحميل</button>
              <label className="upload">
                استيراد JSON
                <input
                  type="file"
                  accept=".json"
                  disabled={saving}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void importBank(f);
                  }}
                />
              </label>
            </div>
            <div className="filters">
              <input
                aria-label="بحث في الأسئلة"
                placeholder="ابحث عن سؤال أو معلومة…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select
                aria-label="الفئة"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">كل الفئات</option>
                {[...new Set(bank.questions.map((q) => q.category))].map(
                  (c) => (
                    <option key={c}>{c}</option>
                  ),
                )}
              </select>
              <select
                aria-label="النقاط"
                value={points}
                onChange={(e) => setPoints(e.target.value)}
              >
                <option value="">كل القيم</option>
                {[100, 200, 300].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
            {edit && (
              <form
                className="editor"
                onSubmit={(e) => {
                  e.preventDefault();
                  try {
                    parseQuestions([edit]);
                    void save({
                      ...bank,
                      questions: bank.questions.some((q) => q.id === edit.id)
                        ? bank.questions.map((q) =>
                            q.id === edit.id ? edit : q,
                          )
                        : [...bank.questions, edit],
                    });
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <h2>معاينة وتحرير السؤال #{edit.id}</h2>
                <label>
                  الفئة
                  <input
                    required
                    value={edit.category}
                    onChange={(e) =>
                      setEdit({ ...edit, category: e.target.value })
                    }
                  />
                </label>
                <label>
                  النقاط
                  <select
                    value={edit.points}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        points: Number(e.target.value) as 100 | 200 | 300,
                      })
                    }
                  >
                    {[100, 200, 300].map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <label>
                  الصعوبة
                  <input
                    required
                    value={edit.difficulty}
                    onChange={(e) =>
                      setEdit({ ...edit, difficulty: e.target.value })
                    }
                  />
                </label>
                <label>
                  نص السؤال
                  <textarea
                    required
                    value={edit.question}
                    onChange={(e) =>
                      setEdit({ ...edit, question: e.target.value })
                    }
                  />
                </label>
                {edit.options.map((v, i) => (
                  <label key={i}>
                    الخيار {i + 1}
                    <input
                      required
                      value={v}
                      onChange={(e) =>
                        setEdit({
                          ...edit,
                          options: edit.options.map((o, n) =>
                            n === i ? e.target.value : o,
                          ),
                          correct_answer:
                            edit.correct_answer === v
                              ? e.target.value
                              : edit.correct_answer,
                        })
                      }
                    />
                  </label>
                ))}
                <label>
                  الإجابة الصحيحة
                  <select
                    required
                    value={edit.correct_answer}
                    onChange={(e) =>
                      setEdit({ ...edit, correct_answer: e.target.value })
                    }
                  >
                    <option value="">اختر الإجابة</option>
                    {edit.options.filter(Boolean).map((v, i) => (
                      <option key={i}>{v}</option>
                    ))}
                  </select>
                </label>
                <label>
                  المعلومة السريعة
                  <textarea
                    required
                    value={edit.quick_fact}
                    onChange={(e) =>
                      setEdit({ ...edit, quick_fact: e.target.value })
                    }
                  />
                </label>
                <button className="primary" disabled={saving}>
                  حفظ السؤال
                </button>
                <button type="button" onClick={() => setEdit(null)}>
                  إلغاء
                </button>
              </form>
            )}
            <div className="question-list">
              {bank.questions
                .filter(
                  (q) =>
                    (!category || q.category === category) &&
                    (!points || q.points === Number(points)) &&
                    `${q.question} ${q.quick_fact}`.includes(query),
                )
                .map((q) => (
                  <article key={q.id} className="bank-row">
                    <span className="pill">
                      #{q.id} · {q.category} · {q.points}
                    </span>
                    <h3>{q.question}</h3>
                    <p>{q.correct_answer}</p>
                    <button onClick={() => setEdit(structuredClone(q))}>
                      تعديل ومعاينة
                    </button>
                    <button
                      disabled={saving}
                      onClick={() =>
                        void save({
                          ...bank,
                          disabled: bank.disabled.includes(q.id)
                            ? bank.disabled.filter((id) => id !== q.id)
                            : [...bank.disabled, q.id],
                        })
                      }
                    >
                      {bank.disabled.includes(q.id) ? "إعادة التفعيل" : "تعطيل"}
                    </button>
                  </article>
                ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
