import { useEffect, useState, type FormEvent } from "react";
import { categories } from "./catalog";
import { api } from "./client";
import type { Question } from "./engine";

type Row = { payload: string; status: string; source: string; id?: number; question_id?: number };
const labels = ["قيد المراجعة", "تمت المراجعة", "إضافة سؤال جديد"];
const points = [200, 400, 600] as const;
const blank = (): Question => ({ id: 0, category: categories[0]!.name, categoryId: categories[0]!.id, points: 200, difficulty: "سهل", question: "", options: ["", "", "", ""], answer: "", hint: "" });

function AdminEntry({base,mode,onReady}:{base:string;mode:"setup"|"login";onReady:()=>void}) {
 const [password,setPassword]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const submit=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setError("");try{if(mode==="setup"){const session=await api<{token:string}>(base,"/admin/auth/setup",{method:"POST",body:JSON.stringify({password})});sessionStorage.setItem("ain-seen-admin-session",session.token);setPassword("");onReady();return;}const session=await api<{token:string}>(base,"/admin/auth/login",{method:"POST",body:JSON.stringify({password})});sessionStorage.setItem("ain-seen-admin-session",session.token);setPassword("");onReady();}catch(err){setError((err as Error).message);}finally{setBusy(false);}};
 return <main className="admin-entry" dir="rtl"><img src="./redesign/brand/wordmark-nav.svg" alt="عين سين"/><h1>{mode==="setup"?"تهيئة لوحة الإدارة":"دخول الإدارة"}</h1>{mode==="setup"?<p>أنشئ كلمة مرور الإدارة (١٢ حرفًا على الأقل) لفتح لوحة مراجعة الأسئلة.</p>:<p>أدخل كلمة مرور الإدارة أو أكمل الدخول عبر بوابة الحماية.</p>}<form className="admin-entry-form" onSubmit={submit}><label>كلمة مرور الإدارة<input type="password" required minLength={12} maxLength={128} autoComplete={mode==="setup"?"new-password":"current-password"} value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary" disabled={busy}>{busy?"جارٍ الحفظ…":mode==="setup"?"حفظ كلمة المرور وفتح اللوحة":"دخول"}</button></form>{error&&<p className="error" role="alert">{error}</p>}</main>;
}

function QuestionEditor({ value, onSave, onCancel }: {value:Question;onSave:(q:Question)=>void;onCancel:()=>void}) {
 const [q,setQ]=useState<Question>({...value,options:[...value.options]});
 return <form className="question-editor" onSubmit={e=>{e.preventDefault();onSave(q);}}>
  <label>الفئة<select value={q.categoryId} onChange={e=>{const c=categories.find(x=>x.id===e.target.value)!;setQ({...q,categoryId:c.id,category:c.name});}}>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
  <label>النقاط<select value={q.points} onChange={e=>setQ({...q,points:Number(e.target.value) as Question["points"]})}>{points.map(p=><option key={p}>{p}</option>)}</select></label>
  <label className="wide">السؤال<textarea required value={q.question} onChange={e=>setQ({...q,question:e.target.value})}/></label>
  {q.options.map((o,i)=><label key={i}>الخيار {i+1}<input required value={o} onChange={e=>{const options=[...q.options];options[i]=e.target.value;setQ({...q,options});}}/></label>)}
  <label className="wide">الإجابة الصحيحة<select required value={q.answer} onChange={e=>setQ({...q,answer:e.target.value})}><option value="">اختر الإجابة الصحيحة</option>{q.options.filter(Boolean).map(o=><option key={o}>{o}</option>)}</select></label>
  <div className="toolbar wide"><button className="primary" type="submit">حفظ</button><button type="button" onClick={onCancel}>إلغاء</button></div>
 </form>;
}

export function QuestionDashboard({base}:{base:string}) {
 const [tab,setTab]=useState(0),[rows,setRows]=useState<Row[]>([]),[pos,setPos]=useState(0),[edit,setEdit]=useState<Question|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[authMode,setAuthMode]=useState<"loading"|"setup"|"login"|"ready">("loading"),[summary,setSummary]=useState<{counts:Record<string,number>;approvedTotal:number;requiredTotal:number;exclusiveApproved:boolean;coverage:{id:string;name:string;approved:number;byPoints:Record<number,number>}[]}>({counts:{},approvedTotal:0,requiredTotal:380,exclusiveApproved:false,coverage:[]});
 const route="/admin/questions?status="+(tab===1?"approved":"pending")+"&source="+(tab===1?"all":"bank");
 useEffect(()=>{if(!base)return;let live=true;void api<{initialized:boolean}>(base,"/admin/auth/status").then(async state=>{if(!live)return;if(!state.initialized){setAuthMode("setup");return;}const token=sessionStorage.getItem("ain-seen-admin-session");if(token){try{await api(base,"/admin/questions/summary");if(live){setAuthMode("ready");return;}}catch{sessionStorage.removeItem("ain-seen-admin-session");}}try{await api(base,"/admin/auth/access-check");if(live){setAuthMode("ready");return;}}catch{}if(live)setAuthMode("login");}).catch(e=>{if(live){setError((e as Error).message);setAuthMode("login");}});return()=>{live=false;};},[base]);
 const load=async()=>{try{const totals=await api<typeof summary>(base,"/admin/questions/summary");setSummary(totals);if(tab<2){const result=await api<{questions?:Row[]}>(base,route);setRows(result.questions||[]);setPos(0);}setError("");}catch(e){setError((e as Error).message);}};
 useEffect(()=>{if(authMode==="ready")void load();},[base,tab,authMode]);
 const row=rows[pos], q=row?JSON.parse(row.payload) as Question:null;
 const save=async(question:Question,status?:string)=>{setBusy(true);try{if(question.id){await api(base,"/admin/questions/"+question.id,{method:"PUT",body:JSON.stringify({question,status})});}else{await api(base,"/admin/questions",{method:"POST",body:JSON.stringify({question})});}setEdit(null);await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const setStatus=async(status:string)=>{if(!q)return;await api(base,"/admin/questions/"+q.id+"/status",{method:"PUT",body:JSON.stringify({status})});await load();};
 const key=(e:KeyboardEvent)=>{if(tab!==0||edit||!q||document.activeElement instanceof HTMLInputElement||document.activeElement instanceof HTMLTextAreaElement)return;if(e.key.toLowerCase()==="e")setEdit(q);if(e.key==="Enter"||e.key===" "){e.preventDefault();void setStatus("approved");}};
 useEffect(()=>{window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);});
 if(authMode==="loading")return <main className="admin-entry" dir="rtl"><p>جارٍ فتح لوحة المراجعة…</p></main>;
 if(authMode==="setup"||authMode==="login")return <AdminEntry base={base} mode={authMode} onReady={()=>setAuthMode("ready")}/>;
 return <main className="question-dashboard" dir="rtl"><h1>لوحة مراجعة الأسئلة</h1><p>اعتماد السؤال يضيفه للمباريات الجديدة، والدخول محمي عبر بوابة الإدارة.</p><button className="admin-logout" onClick={async()=>{try{await api(base,"/admin/auth/logout",{method:"POST"});}catch{}sessionStorage.removeItem("ain-seen-admin-session");setAuthMode("login");}}>تسجيل الخروج</button>
  <section className="approval-progress"><b>{summary.exclusiveApproved?"اكتمل اعتماد جميع الفئات؛ اللعبة تعرض الأسئلة المعتمدة فقط.":"ما زالت الأسئلة الحالية متاحة حتى اعتماد ١٠ أسئلة لكل فئة."}</b><p>المعتمد: {summary.approvedTotal.toLocaleString("ar-SA")} / {summary.requiredTotal.toLocaleString("ar-SA")} · اكتملت {summary.coverage.filter(c=>c.approved>=10&&[200,400,600].every(p=>c.byPoints[p]>=2)).length} من ٣٨ فئة. ويتطلب التحويل سؤالين على الأقل لكل قيمة نقاط في كل فئة.</p><progress value={summary.coverage.reduce((n,c)=>n+Math.min(c.approved,10),0)} max={summary.requiredTotal}/><details><summary>تفاصيل اعتماد الفئات</summary><div className="approval-category-grid">{summary.coverage.map(c=><div key={c.id}><b>{c.name}</b><span>{c.approved}/10</span><small>٢٠٠: {c.byPoints[200]||0} · ٤٠٠: {c.byPoints[400]||0} · ٦٠٠: {c.byPoints[600]||0}</small></div>)}</div></details></section>
  <nav className="question-tabs">{labels.map((name,i)=><button key={name} className={tab===i?"active":""} onClick={()=>{setTab(i);setEdit(null);}}>{name}{i===0?" · "+(summary.counts.pending||0).toLocaleString("ar-SA"):i===1?" · "+(summary.counts.approved||0).toLocaleString("ar-SA"):""}</button>)}</nav>
  {error&&<p className="error" role="alert">{error}</p>}
  {tab===2&&<section className="panel"><QuestionEditor value={blank()} onSave={q=>void save(q)} onCancel={()=>{}}/></section>}
  {tab<2 ? q&&<article className="moderation-card">{edit?<QuestionEditor value={edit} onSave={v=>void save(v)} onCancel={()=>setEdit(null)}/>:<><div className="toolbar"><b>{q.category}</b><span>{q.points} نقطة</span></div><h2>{q.question}</h2>{q.options.map(o=><p className={o===q.answer?"answer-correct":""} key={o}>{o===q.answer?"✓ ":""}{o}</p>)}<div className="toolbar"><button onClick={()=>setEdit(q)}>تعديل (E)</button>{tab===0?<button className="primary" disabled={busy} onClick={()=>void setStatus("approved")}>تمت المراجعة (Enter / Space)</button>:<button onClick={()=>void setStatus("pending")}>إعادة للمراجعة</button>}<button disabled={pos===0} onClick={()=>setPos(pos-1)}>السابق</button><button disabled={pos+1>=rows.length} onClick={()=>setPos(pos+1)}>التالي</button></div></>}</article>:null}
  {tab<2&&rows.length===0&&<section className="panel">لا توجد عناصر في هذا القسم.</section>}
  {tab===1&&<button onClick={()=>{const blob=new Blob([JSON.stringify(rows.map(r=>JSON.parse(r.payload)),null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="ain-seen-approved.json";a.click();URL.revokeObjectURL(a.href);}}>تصدير نسخة JSON</button>}
  <button onClick={()=>void load()}>تحديث القائمة</button></main>;
}
