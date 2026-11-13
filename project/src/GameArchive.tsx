import { useEffect, useState } from "react";
import type { GameState, RoundRecord, ScoreAuditLog, TeamId } from "./engine";
import { useAccountLibrary } from "./account";
import { cacheItem, readCachedItems } from "./library-cache";

type ArchiveSource = { phase:string; teams:GameState["teams"]; winner:TeamId|null; result:string; audit:ScoreAuditLog[]; history?:RoundRecord[]; cells:{category:string}[] };
export function useArchiveGame(game:ArchiveSource|null, id:string|undefined, mode:"offline"|"online", startedAt?:number) {
  const account=useAccountLibrary();
  const already=Boolean(id && account.items.some(x=>x.kind==="game" && x.id===id));
  useEffect(()=>{
    if(!game||game.phase!=="FINISHED"||!id||already||!account.authLoaded||!account.ready)return;
    const payload={mode,startedAt:startedAt??null,finishedAt:Date.now(),teams:{red:{name:game.teams.red.name,score:game.teams.red.score},blue:{name:game.teams.blue.name,score:game.teams.blue.score}},winner:game.winner,result:game.result,categories:[...new Set(game.cells.map(c=>c.category))],rounds:game.history??[],historyAvailable:Array.isArray(game.history),audit:game.audit};
    if(account.userId){void account.put("game",id,payload);return;}
    let owner="guest";
    if(!account.enabled && !navigator.onLine)try{owner=localStorage.getItem("ain-account-last-owner")||"guest";}catch{/* guest */}
    void readCachedItems(owner).then(items=>{if(!items.some(x=>x.kind==="game"&&x.id===id))return cacheItem(owner,{kind:"game",id,payload,updatedAt:Date.now()});}).catch(()=>{/* existing offline match remains playable */});
  },[account.enabled,account.authLoaded,account.ready,account.userId,account.put,already,game,id,mode,startedAt]);
}

export function MyGames() {
  const account=useAccountLibrary();
  const [guestGames,setGuestGames]=useState<import("./account").LibraryItem[]>([]);
  const [importing,setImporting]=useState(false);
  useEffect(()=>{if(account.userId)void readCachedItems("guest").then(items=>setGuestGames(items.filter(x=>x.kind==="game"))).catch(()=>setGuestGames([]));},[account.userId]);
  if(!account.userId)return <main className="panel"><h1>ألعابي</h1><p>سجّل الدخول لحفظ مبارياتك ومزامنتها بين أجهزتك.</p><a href="#">العودة للرئيسية</a></main>;
  const games=account.items.filter(x=>x.kind==="game"&&!x.payload.deleted).sort((a,b)=>Number(b.payload.finishedAt||0)-Number(a.payload.finishedAt||0));
  return <main className="panel my-games"><h1>ألعابي</h1><p>المباريات المكتملة بعد تفعيل الميزة تظهر هنا وتُزامن بين أجهزتك. لا تتوفر تفاصيل المباريات الأقدم التي لم تكن محفوظة.</p>{guestGames.length>0&&<button disabled={importing||!account.ready} onClick={async()=>{setImporting(true);let ok=true;for(const game of guestGames)if(!games.some(x=>x.id===game.id)&&!await account.put("game",game.id,game.payload)){ok=false;break;}if(ok)setGuestGames([]);setImporting(false);}}>إضافة مباريات هذا الجهاز إلى حسابي ({guestGames.length})</button>}{account.error&&<p role="alert">{account.error}</p>}{account.syncing&&<p role="status">جارٍ مزامنة ألعابك…</p>}{games.length===0&&<p>ما عندك مباريات محفوظة بعد.</p>}{games.map(item=>{
    const g=item.payload as any, red=g.teams?.red, blue=g.teams?.blue, rounds=Array.isArray(g.rounds)?g.rounds:[];
    return <details className="saved-game" key={item.id}><summary><b>{String(red?.name||"الفريق الأول")} {Number(red?.score||0)} - {Number(blue?.score||0)} {String(blue?.name||"الفريق الثاني")}</b><small>{Number.isFinite(g.finishedAt)?new Date(g.finishedAt).toLocaleString("ar-SA"):""} · {g.mode==="offline"?"أوفلاين":"أونلاين"}</small></summary><p>النتيجة: {String(g.result||"انتهت المباراة")}</p><p>الفئات: {Array.isArray(g.categories)?g.categories.join("، "):""}</p>{!g.historyAvailable&&<p>تفاصيل الأسئلة غير متاحة لهذه المباراة القديمة.</p>}{rounds.map((r:any,i:number)=><section className="saved-round" key={i}><h3>السؤال {i+1} · {String(r.question?.category||"")} · {Number(r.question?.points||0)} نقطة</h3><p>{String(r.question?.question||"")}</p><p><b>الإجابة الصحيحة:</b> {String(r.question?.answer||"")}</p>{Array.isArray(r.question?.options)&&<p><b>الخيارات:</b> {r.question.options.join("، ")}</p>}{Array.isArray(r.attempts)&&r.attempts.map((a:any,j:number)=><p key={j}>{a.team==="red"?String(red?.name||"الأحمر"):String(blue?.name||"الأزرق")}: {a.option===null?"انتهى الوقت":String(a.option)} {a.correct===true?"✓":a.correct===false?"✗":""}</p>)}<p>{String(r.result||"")}{r.double?" · دبل":""}</p>{Array.isArray(r.helpers)&&r.helpers.length>0&&<p>المساعدات: {r.helpers.map((h:any)=>`${h.team==="red"?red?.name:blue?.name}: ${{FREEZE:"عين حارة",SWAP:"تثبيت المخ",FIFTY_FIFTY:"شيل خيارين"}[h.card as "FREEZE"|"SWAP"|"FIFTY_FIFTY"]||h.card}`).join("، ")}</p>}<p>النتيجة بعد الجولة: {Number(r.scores?.red||0)} - {Number(r.scores?.blue||0)}</p></section>)}{Array.isArray(g.audit)&&g.audit.length>0&&<details><summary>سجل النقاط</summary>{g.audit.map((a:any,i:number)=><p key={i}>{a.team==="red"?String(red?.name||"الأحمر"):String(blue?.name||"الأزرق")}: {Number(a.delta||0)} · {String(a.reason||"")}</p>)}</details>}</details>;
  })}<a href="#">العودة للرئيسية</a></main>;
}
