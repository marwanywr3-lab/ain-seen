import { useState, type FormEvent } from "react";
import { categories } from "./catalog";
import { api } from "./client";

export function QuestionSuggestion({ base }: { base: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [question, setQuestion] = useState("");
  const [hint, setHint] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [answer, setAnswer] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]!.id);
  const [points, setPoints] = useState(200);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      const category = categories.find((item) => item.id === categoryId)!;
      const result = await api<{ aiCheck: { status: string }; emailNotification: string }>(base, "/questions/suggestions", { method: "POST", body: JSON.stringify({ name, email, question: { id: 1, categoryId, category: category.name, question, options, answer, points, difficulty: points === 200 ? "سهل" : points === 400 ? "متوسط" : "صعب", hint } }) });
      const review = result.aiCheck.status === "complete" ? "وصل اقتراحك للمراجعة، وأُرفقت نتيجة الفحص الآلي." : "وصل اقتراحك للمراجعة اليدوية؛ لم يكتمل فحص الذكاء الاصطناعي.";
      setMessage(review + (result.emailNotification === "sent" ? " وأُرسل تنبيه للمراجعة." : " وحُفظ الاقتراح، لكن تنبيه البريد غير مهيأ أو تعذر إرساله."));
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  };
  return <main className="suggestion-page" dir="rtl"><a href="#">العودة للرئيسية</a><section className="panel"><h1>اقترح سؤالًا</h1><p>لن يظهر اسمك أو بريدك للاعبين. نستخدمهما لمراجعة الاقتراح والتواصل عند الحاجة.</p><form className="question-editor" onSubmit={submit}>
    <label>اسمك<input required maxLength={60} autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/></label>
    <label>بريدك الإلكتروني<input required type="email" maxLength={254} autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
    <label className="wide">السؤال<textarea required value={question} onChange={e=>setQuestion(e.target.value)}/></label>
    <label className="wide">تلميح السؤال<textarea required maxLength={500} value={hint} onChange={e=>setHint(e.target.value)} placeholder="اكتب تلميحًا يساعد دون كشف الإجابة"/></label>
    {options.map((option,index)=><label key={index}>الخيار {index+1}<input required value={option} onChange={e=>setOptions(values=>values.map((value,i)=>i===index?e.target.value:value))}/></label>)}
    <label className="wide">الإجابة الصحيحة<select required value={answer} onChange={e=>setAnswer(e.target.value)}><option value="">اختر الإجابة الصحيحة</option>{options.filter(Boolean).map(option=><option key={option}>{option}</option>)}</select></label>
    <label>الفئة<select value={categoryId} onChange={e=>setCategoryId(e.target.value)}>{categories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
    <label>النقاط<select value={points} onChange={e=>setPoints(Number(e.target.value))}>{[200,400,600].map(value=><option key={value}>{value}</option>)}</select></label>
    <button className="primary wide" disabled={busy||!answer}>{busy?"جارٍ الإرسال…":"إرسال للاقتراح"}</button>
  </form>{message&&<p role="status">{message}</p>}</section></main>;
}
