import { useState, type FormEvent } from "react";
import { api } from "./client";

const reasons = [
  ["too_easy_or_obvious", "سهل جدًا أو واضح"],
  ["too_hard", "صعب جدًا"],
  ["multiple_correct_answers", "أكثر من إجابة صحيحة"],
  ["selected_answer_wrong", "الإجابة المحددة غير صحيحة"],
  ["no_correct_answer", "لا توجد إجابة صحيحة"],
  ["category_mismatch", "السؤال لا يتناسب مع الفئة المحددة"],
  ["other", "بلاغ آخر"],
] as const;

export function QuestionReport({ base, questionId }: { base: string; questionId: number }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ emailNotification: string }>(
        base,
        `/questions/${questionId}/reports`,
        { method: "POST", body: JSON.stringify({ name, email, reason, details }) },
      );
      setMessage(result.emailNotification === "sent"
        ? "وصل البلاغ للمراجعة وأُرسل تنبيه البريد."
        : "حُفظ البلاغ في موقع المراجعة، لكن البريد غير مهيأ أو تعذر إرساله.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="question-report">
      <summary aria-label="الإبلاغ عن السؤال" title="الإبلاغ عن السؤال"><span aria-hidden="true">⚠</span><span>إبلاغ</span></summary>
      <form onSubmit={submit}>
        <strong>إبلاغ عن سؤال</strong>
        <label>اسمك<input required minLength={2} maxLength={60} autoComplete="name" value={name} onChange={event=>setName(event.target.value)} /></label>
        <label>بريدك الإلكتروني<input required type="email" maxLength={254} autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)} /></label>
        <label>سبب البلاغ<select required value={reason} onChange={event=>setReason(event.target.value)}><option value="">اختر السبب</option>{reasons.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label>تفاصيل إضافية{reason==="other"&&<span aria-hidden="true"> · مطلوبة</span>}<textarea required={reason==="other"} maxLength={1000} value={details} onChange={event=>setDetails(event.target.value)} placeholder={reason==="other"?"اشرح سبب البلاغ":"اختياري"} /></label>
        <button className="primary" disabled={busy}>{busy?"جارٍ الإرسال…":"إرسال البلاغ"}</button>
        {message&&<p role="status">{message}</p>}
      </form>
    </details>
  );
}
