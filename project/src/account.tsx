import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@clerk/react";
import { useServiceUrl } from "./client";
import { cacheItem, readCachedItems } from "./library-cache";

export type LibraryItem = { kind:"favorite"|"game"; id:string; payload:Record<string, unknown>; updatedAt:number };
type Library = { enabled:boolean; authLoaded:boolean; ready:boolean; userId:string|null; items:LibraryItem[]; error:string; syncing:boolean; put:(kind:LibraryItem["kind"],id:string,payload:Record<string,unknown>)=>Promise<boolean>; refresh:()=>void };
const AccountContext=createContext<Library>({enabled:false,authLoaded:true,ready:true,userId:null,items:[],error:"",syncing:false,put:async()=>false,refresh:()=>{}});
export const useAccountLibrary=()=>useContext(AccountContext);
const itemKey=(x:LibraryItem)=>`${x.kind}:${x.id}`;
function tokenBelongsTo(token:string,userId:string) {
  try { const part=token.split(".")[1]!.replace(/-/g,"+").replace(/_/g,"/"); return JSON.parse(atob(part)).sub===userId; } catch { return false; }
}
function mergeItems(first:LibraryItem[],second:LibraryItem[]) {
  const merged=new Map(first.map(x=>[itemKey(x),x]));
  for(const x of second){const key=itemKey(x),old=merged.get(key);if(!old||x.updatedAt>old.updatedAt)merged.set(key,x);}
  return [...merged.values()];
}
export function AccountLibraryProvider({children}:{children:ReactNode}) {
  const {isLoaded,isSignedIn,userId,getToken}=useAuth();
  const {base}=useServiceUrl();
  const owner=isLoaded && isSignedIn && userId ? userId : null;
  const [items,setItems]=useState<LibraryItem[]>([]), [loadedOwner,setLoadedOwner]=useState<string|null>(null), [error,setError]=useState(""), [syncing,setSyncing]=useState(false), [tick,setTick]=useState(0);
  const ref=useRef<LibraryItem[]>([]), ownerRef=useRef<string|null>(null);
  const put=useCallback(async(kind:LibraryItem["kind"],id:string,payload:Record<string,unknown>)=>{
    const user=ownerRef.current;if(!user||user!==owner||loadedOwner!==user)return false;
    const updatedAt=Math.max(Date.now(),...ref.current.filter(x=>x.kind===kind&&x.id===id).map(x=>x.updatedAt+1));
    const item:LibraryItem={kind,id,payload,updatedAt};
    try { await cacheItem(user,item); }
    catch { if(ownerRef.current===user)setError("تعذر حفظ بيانات الحساب على الجهاز؛ تحقق من مساحة التخزين.");return false; }
    if(ownerRef.current!==user)return true;
    const next=mergeItems(ref.current,[item]);ref.current=next;setItems(next);setTick(x=>x+1);return true;
  },[owner,loadedOwner]);
  useEffect(()=>{
    let active=true;ownerRef.current=owner;setLoadedOwner(null);setItems([]);ref.current=[];setError("");setSyncing(false);
    if(isLoaded){try {if(owner)localStorage.setItem("ain-account-last-owner",owner);else localStorage.removeItem("ain-account-last-owner");}catch{/* optional */}}
    if(!owner)return ()=>{active=false;};
    const load=async()=>{
      try {
        let local=await readCachedItems(owner);
        const flag=`ain-account-imported-v1:${owner}`;
        if(!localStorage.getItem(flag)){
          const groups=JSON.parse(localStorage.getItem("ain-favorite-groups-v2")||"null");
          const legacy=JSON.parse(localStorage.getItem("ain-favorite-categories-v1")||"[]");
          const initial=Array.isArray(groups)?groups:Array.isArray(legacy)&&legacy.length===6?[{id:crypto.randomUUID(),name:"المفضلة السابقة",categories:legacy}]:[];
          const imported:LibraryItem[]=initial.filter((x:any)=>x&&typeof x.id==="string"&&typeof x.name==="string"&&Array.isArray(x.categories)&&x.categories.length===6).map((x:any)=>({kind:"favorite",id:x.id==="previous"?crypto.randomUUID():x.id,payload:{name:x.name,categories:x.categories},updatedAt:Date.now()}));
          for(const item of imported)await cacheItem(owner,item);
          local=mergeItems(local,imported);localStorage.setItem(flag,"1");
        }
        if(!active||ownerRef.current!==owner)return;
        ref.current=local;setItems(local);setLoadedOwner(owner);setTick(x=>x+1);
      }catch{if(active&&ownerRef.current===owner){setError("تعذر فتح بيانات الحساب على هذا الجهاز.");setLoadedOwner(owner);}}
    };
    void load();return()=>{active=false;if(ownerRef.current===owner)ownerRef.current=null;};
  },[owner,isLoaded]);
  useEffect(()=>{
    if(!owner||loadedOwner!==owner||!base||!navigator.onLine)return;
    let active=true;
    const sync=async()=>{
      setSyncing(true);
      try {
        const token=await getToken();
        if(!active||ownerRef.current!==owner)return;
        if(!token||!tokenBelongsTo(token,owner))throw Error("انتهت الجلسة، سجّل الدخول مجددًا.");
        const headers={Authorization:`Bearer ${token}`,"Content-Type":"application/json"};
        const remoteItems:LibraryItem[]=[];let cursor:{kind:string;id:string}|null=null;
        do {
          const params=cursor?`?${new URLSearchParams({afterKind:cursor.kind,afterId:cursor.id})}`:"";
          const response=await fetch(`${base}/account/library${params}`,{headers,cache:"no-store"});
          if(!response.ok)throw Error("تعذّرت المزامنة؛ بياناتك تبقى على هذا الجهاز.");
          const page=await response.json() as {items:LibraryItem[];next:{kind:string;id:string}|null};
          if(!active||ownerRef.current!==owner)return;
          if(!Array.isArray(page.items))throw Error("تعذّرت قراءة بيانات المزامنة.");
          remoteItems.push(...page.items);cursor=page.next;
        } while(cursor);
        const remote=new Map(remoteItems.map(x=>[itemKey(x),x]));
        for(const item of [...ref.current]){
          const old=remote.get(itemKey(item));
          if(!old||item.updatedAt>old.updatedAt){
            if(!active||ownerRef.current!==owner)return;
            const res=await fetch(`${base}/account/library`,{method:"PUT",headers,body:JSON.stringify(item)});
            if(!res.ok)throw Error("تعذّر رفع بعض البيانات؛ ستُعاد المحاولة عند الاتصال.");
          }
        }
        for(const item of remoteItems)await cacheItem(owner,item);
        if(!active||ownerRef.current!==owner)return;
        const next=mergeItems(remoteItems,ref.current);ref.current=next;setItems(next);setError("");
      }catch(e){if(active&&ownerRef.current===owner)setError(e instanceof Error?e.message:"تعذرت المزامنة.");}
      finally{if(active)setSyncing(false);}
    };
    void sync();return()=>{active=false;};
  },[owner,loadedOwner,base,getToken,tick]);
  useEffect(()=>{const retry=()=>setTick(x=>x+1);window.addEventListener("online",retry);window.addEventListener("focus",retry);const timer=window.setInterval(retry,60000);return()=>{window.removeEventListener("online",retry);window.removeEventListener("focus",retry);clearInterval(timer);};},[]);
  return <AccountContext.Provider value={{enabled:true,authLoaded:isLoaded,ready:!owner||loadedOwner===owner,userId:owner,items:loadedOwner===owner?items:[],error,syncing,put,refresh:()=>setTick(x=>x+1)}}>{children}</AccountContext.Provider>;
}
