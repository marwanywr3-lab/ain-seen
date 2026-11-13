import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

test('new question migration preserves the bank, excludes exact text duplicates, and keeps choices',()=>{
 const all=JSON.parse(readFileSync(new URL('../src/questions.json',import.meta.url),'utf8'));
 const original=all.slice(0,1510),added=all.slice(1510),duplicate={...added[0],id:3000};
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE question_bank(id INTEGER PRIMARY KEY,payload TEXT,revision INTEGER); CREATE TABLE question_bank_versions(version TEXT PRIMARY KEY,payload TEXT,revision INTEGER,created_at TEXT);');
 const previous=JSON.stringify({schemaVersion:3,questions:[...original,duplicate],disabled:[]});
 db.prepare('INSERT INTO question_bank VALUES(1,?,1)').run(previous);
 db.exec(readFileSync(new URL('../migrations/0010_new_760.sql',import.meta.url),'utf8'));
 const result=JSON.parse(db.prepare('SELECT payload FROM question_bank').get().payload);
 assert.equal(result.questions.length,original.length+added.length);
 assert.equal(result.questions.filter(q=>q.question===duplicate.question).length,1);
 assert.deepEqual(result.questions.find(q=>q.question===added[1].question).options,added[1].options);
 assert.equal(db.prepare('SELECT payload FROM question_bank_versions WHERE version=?').get('pre-new-760-20261113').payload,previous);
 db.close();
});
