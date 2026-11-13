import type { LibraryItem } from "./account";

type Stored = LibraryItem & { owner:string };
let dbPromise: Promise<IDBDatabase> | undefined;
function openDb(): Promise<IDBDatabase> { return dbPromise ??= new Promise<IDBDatabase>((resolve,reject)=>{
  if(typeof indexedDB === "undefined") { reject(Error("التخزين المحلي غير متاح")); return; }
  const request=indexedDB.open("ain-seen-account-cache",1);
  request.onupgradeneeded=()=>{const store=request.result.createObjectStore("items",{keyPath:["owner","kind","id"]});store.createIndex("owner","owner");};
  request.onerror=()=>reject(request.error);
  request.onsuccess=()=>resolve(request.result);
}); }
export async function readCachedItems(owner:string):Promise<LibraryItem[]> {
  const db=await openDb();
  return new Promise((resolve,reject)=>{const tx=db.transaction("items","readonly");const req=tx.objectStore("items").index("owner").getAll(IDBKeyRange.only(owner));req.onsuccess=()=>resolve((req.result as Stored[]).map(({owner:_,...item})=>item));req.onerror=()=>reject(req.error);});
}
export async function cacheItem(owner:string,item:LibraryItem):Promise<void> {
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction("items","readwrite"),store=tx.objectStore("items"),get=store.get([owner,item.kind,item.id]);
    get.onsuccess=()=>{const old=get.result as Stored|undefined;if(!old||item.updatedAt>=old.updatedAt)store.put({...item,owner});};
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error("فشل حفظ البيانات"));
  });
}
