'use strict';
// Guards the journal screen lock: the passcode must never be stored or synced in readable form.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
function section(a,b){const start=html.indexOf(a);assert(start>=0,a);const end=html.indexOf(b,start);assert(end>start,b);return html.slice(start,end);}
function loadCrypto(){
 const env={crypto:require('node:crypto').webcrypto,TextEncoder,btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary')};
 env.backupEncoder=new TextEncoder();
 vm.runInNewContext(section('function bytesToBase64(','function backupCryptoReady(')+section('const JOURNAL_LOCK_ITERATIONS','function backupData(){'),env);
 return env;
}

test('a passcode is stored only as a salted PBKDF2 fingerprint, never in readable form',async()=>{
 const env=loadCrypto();
 const lock=await env.makeJournalLock('4271');
 assert.equal(lock.kdf,'PBKDF2-SHA256');
 assert.equal(lock.iterations,310000,'iteration count must stay at the OWASP floor');
 assert(html.includes('const JOURNAL_LOCK_ITERATIONS=310000;'),'the constant must stay pinned in the source');
 const serialized=JSON.stringify(lock);
 assert(!serialized.includes('4271'),'the passcode must not appear anywhere in the stored lock');
 assert(lock.salt&&lock.hash&&lock.salt!==lock.hash);
});

test('the same passcode produces a different fingerprint every time (random salt)',async()=>{
 const env=loadCrypto();
 const a=await env.makeJournalLock('4271'),b=await env.makeJournalLock('4271');
 assert.notEqual(a.salt,b.salt);
 assert.notEqual(a.hash,b.hash,'a shared salt would let one leak unlock every account');
});

test('the correct passcode verifies and wrong ones are refused',async()=>{
 const env=loadCrypto();
 const lock=await env.makeJournalLock('4271');
 assert.equal(await env.verifyJournalLock('4271',lock),true);
 for(const wrong of ['4272','427','42710','',' 4271']) assert.equal(await env.verifyJournalLock(wrong,lock),false,wrong);
 assert.equal(await env.verifyJournalLock('4271',null),false);
 assert.equal(await env.verifyJournalLock('4271',{salt:lock.salt}),false);
});

test('nothing bound for the cloud may carry a readable passcode',async()=>{
 const env=loadCrypto();
 const people=[{id:'a',name:'Clara',jpass:'4271'},{id:'b',name:'Abigail',jlock:{v:1}},null];
 const clean=env.stripJournalSecrets(people);
 assert(!JSON.stringify(clean).includes('4271'),'legacy plaintext must be stripped before it leaves the device');
 assert.equal(clean[0].name,'Clara','stripping must not disturb the rest of the record');
 assert.deepEqual(clean[1].jlock,{v:1},'the hashed lock still syncs');
 assert.equal(people[0].jpass,'4271','the live record must not be mutated by sanitising');
});

test('every cloud send site is sanitised and no code path writes a readable passcode',()=>{
 const sends=html.match(/p_people:[^,]+,/g)||[];
 assert(sends.length>=6,'expected every cloud send site to be found, saw '+sends.length);
 for(const s of sends) assert(s.startsWith('p_people:stripJournalSecrets('),'unsanitised cloud send: '+s);
 assert(html.includes('people:stripJournalSecrets(people),'),'the legacy keepsakes upsert must be sanitised too');
 assert(!/\bp\.jpass\s*=\s*[^=]/.test(html),'no code path may assign a readable passcode');
 assert(html.includes('await migrateJournalLocks()'),'saving must convert legacy passcodes first');
});
