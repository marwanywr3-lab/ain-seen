import { readFile, writeFile } from "node:fs/promises";
const data = JSON.parse(await readFile("src/data.json", "utf8"));
const payload = JSON.stringify({
  schemaVersion: 3,
  questions: data.categories.flatMap((c) => c.questions),
  disabled: [],
});
const chunks = payload.match(/[\s\S]{1,6000}/g) || [];
const sql =
  "INSERT OR IGNORE INTO question_bank_versions SELECT 'pre-catalog-v3',payload,revision,datetime('now') FROM question_bank WHERE id=1;\nCREATE TABLE question_bank_import_chunks(sequence INTEGER PRIMARY KEY,data TEXT NOT NULL);\n" +
  chunks
    .map(
      (s, i) =>
        `INSERT INTO question_bank_import_chunks VALUES(${i},'${s.replaceAll("'", "''")}');\n`,
    )
    .join("") +
  "UPDATE question_bank SET payload=(SELECT group_concat(data,'') FROM (SELECT data FROM question_bank_import_chunks ORDER BY sequence)),revision=revision+1 WHERE id=1;\nDROP TABLE question_bank_import_chunks;\nUPDATE game_rooms SET status='finished',deadline=NULL WHERE schema_version<3;\n";
await writeFile("migrations/0005_catalog_v3.sql", sql);
