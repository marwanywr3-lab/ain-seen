import { createRemoteJWKSet, jwtVerify } from "jose";

const issuer = "https://clerk.marwanbarbood.com";
const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
const allowedOrigins = new Set(["https://ain-seen.marwanbarbood.com", "https://marwanywr3-lab.github.io"]);

export async function verifyUser(bearer: string, keys: Parameters<typeof jwtVerify>[1] = jwks): Promise<string> {
    const { payload } = await jwtVerify(bearer, keys, { issuer, algorithms: ["RS256"], requiredClaims: ["sub", "exp", "iat", "azp"] });
    if (!payload.sub || typeof payload.azp !== "string" || !allowedOrigins.has(payload.azp)) throw Error("invalid token");
    return payload.sub;
}
export async function userLibrary(req: Request, db: D1Database, verify: (token:string)=>Promise<string> = verifyUser): Promise<Response> {
  const bearer = req.headers.get("Authorization")?.match(/^Bearer ([^ ]+)$/)?.[1];
  if (!bearer) return Response.json({ error: "سجّل الدخول للمزامنة" }, { status: 401 });
  let userId: string;
  try {
    userId = await verify(bearer);
  } catch { return Response.json({ error: "تعذّر التحقق من الجلسة" }, { status: 401 }); }
  if (req.method === "GET") {
    const url=new URL(req.url), afterKind=url.searchParams.get("afterKind")||"", afterId=url.searchParams.get("afterId")||"";
    if ((afterKind && !["favorite","game"].includes(afterKind)) || (afterId && !/^[a-zA-Z0-9_-]{1,100}$/.test(afterId)) || Boolean(afterKind)!==Boolean(afterId)) return Response.json({error:"مؤشر غير صالح"},{status:400});
    const rows = await db.prepare("SELECT kind,item_id,payload,updated_at FROM user_library WHERE user_id=? AND (kind>? OR (kind=? AND item_id>?)) ORDER BY kind,item_id LIMIT 51").bind(userId,afterKind,afterKind,afterId).all<{kind:string;item_id:string;payload:string;updated_at:number}>();
    const page=rows.results.slice(0,50),last=page.at(-1);
    return Response.json({ items: page.map(r => ({ kind:r.kind, id:r.item_id, payload:JSON.parse(r.payload), updatedAt:r.updated_at })), next:rows.results.length>50 && last ? {kind:last.kind,id:last.item_id}:null });
  }
  if (req.method !== "PUT") return Response.json({ error: "طريقة غير مدعومة" }, { status: 405 });
  let value: any;
  try { const text=await req.text(); if(text.length>150000)return Response.json({error:"البيانات كبيرة جدًا"},{status:413});value=JSON.parse(text); } catch { return Response.json({ error:"بيانات غير صالحة" }, { status:400 }); }
  if (!value || !["favorite", "game"].includes(value.kind) || typeof value.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(value.id) || !Number.isSafeInteger(value.updatedAt) || value.updatedAt < 0 || value.updatedAt > Date.now() + 300000 || typeof value.payload !== "object" || value.payload === null || Array.isArray(value.payload)) return Response.json({ error:"بيانات غير صالحة" }, { status:400 });
  const payload = JSON.stringify(value.payload);
  if (payload.length > 120000) return Response.json({ error:"البيانات كبيرة جدًا" }, { status:413 });
  await db.prepare("INSERT INTO user_library(user_id,kind,item_id,payload,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id,kind,item_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at WHERE excluded.updated_at > user_library.updated_at").bind(userId,value.kind,value.id,payload,value.updatedAt).run();
  return Response.json({ ok:true });
}
