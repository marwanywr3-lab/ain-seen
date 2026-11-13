import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {verifyUser,userLibrary} from '../worker/user-library.ts';

test('account library requires a valid Clerk signature, issuer and authorized origin', async()=>{
 const {publicKey,privateKey}=await generateKeyPair('RS256');
 const jwk=await exportJWK(publicKey);jwk.kid='test';jwk.alg='RS256';
 const keys=createLocalJWKSet({keys:[jwk]});
 const make=(issuer,azp,expiration='2h')=>new SignJWT({azp}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer(issuer).setSubject('user_a').setIssuedAt().setExpirationTime(expiration).sign(privateKey);
 const issuer='https://clerk.marwanbarbood.com',origin='https://ain-seen.marwanbarbood.com';
 assert.equal(await verifyUser(await make(issuer,origin),keys),'user_a');
 await assert.rejects(verifyUser(await make(issuer,'https://other.example'),keys));
 await assert.rejects(verifyUser(await make('https://other.example',origin),keys));
 await assert.rejects(verifyUser(await make(issuer,origin,'-1h'),keys));
});
test('account data is private to its verified owner',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE user_library(user_id TEXT,kind TEXT,item_id TEXT,payload TEXT,updated_at INTEGER,PRIMARY KEY(user_id,kind,item_id))');
 const d1={prepare(sql){return {bind(...params){return {async all(){return {results:db.prepare(sql).all(...params)}},async run(){db.prepare(sql).run(...params)}}}}}};
 const verify=async token=>{if(!['a','b'].includes(token))throw Error();return token};
 const request=(token,method='GET',body)=>new Request('https://example.com/account/library',{method,headers:token?{Authorization:`Bearer ${token}`}:{},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await userLibrary(request(null),d1,verify)).status,401);
 assert.equal((await userLibrary(request('a','PUT',{kind:'favorite',id:'one',payload:{name:'خاص'},updatedAt:Date.now()}),d1,verify)).status,200);
 assert.equal((await (await userLibrary(request('b'),d1,verify)).json()).items.length,0);
 assert.equal((await (await userLibrary(request('a'),d1,verify)).json()).items[0].payload.name,'خاص');
 assert.equal((await userLibrary(request('invalid'),d1,verify)).status,401);
});
