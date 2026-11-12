import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
async function list(dir) {
  const rows = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      rows.map((r) =>
        r.isDirectory() ? list(`${dir}/${r.name}`) : `${dir}/${r.name}`,
      ),
    )
  ).flat();
}
const files = (await list("dist"))
  .filter((p) => !p.endsWith("/sw.js"))
  .map((p) => p.slice(5));
const version = createHash("sha256")
  .update(
    (await Promise.all(files.map((p) => readFile(`dist/${p}`))))
      .map((b) => createHash("sha256").update(b).digest("hex"))
      .join(""),
  )
  .digest("hex")
  .slice(0, 16);
await writeFile(
  "dist/sw.js",
  `const CACHE='ain-seen-v3-${version}';const FILES=${JSON.stringify(["./", ...files.map((p) => "./" + p)])};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('ain-seen-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;e.respondWith((async()=>{const cached=await caches.match(e.request);if(e.request.mode==='navigate'){try{return await fetch(e.request)}catch{return cached||await caches.match('./index.html')}}return cached||fetch(e.request)})())});
`,
);
console.log("Offline cache:", version, files.length, "files");
