'use strict';
// The Secret Place screen lock must guard every entrance, not just the front door.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
function body(name){
 const i=html.indexOf(name);assert(i>=0,'missing: '+name);
 return html.slice(i,html.indexOf('\nfunction ',i+name.length));
}

test('every entrance to private material passes through the gate', ()=>{
 // The two functions that actually reveal prayers and journal entries.
 assert(/function openSecretRoom\(\)\{if\(!requireSecretUnlock\(/.test(html),
   'openSecretRoom must gate before revealing the room');
 assert(/function openJournal\(\)\{if\(!requireSecretUnlock\(/.test(html),
   'openJournal must gate before rendering entries');
 // The side doors that could otherwise skip it.
 for(const fn of ['goDoorSecret','goDoorRemembrance','goDoorJournal','enterSecret'])
   assert(body('function '+fn+'(').includes('requireSecretUnlock'), fn+' must gate');
});

test('the journal no longer holds a second, separate lock', ()=>{
 const ej=body('function enterJournal(');
 assert(!ej.includes('promptJournalPass'),'the journal must not prompt separately');
 assert(!ej.includes('jpassAsked'),'the first-time prompt belongs at the door now');
});

test('the gate asks first, then verifies, and fails closed', ()=>{
 const g=body('function requireSecretUnlock(');
 assert(g.includes('jpassAsked'),'must offer to set a lock on first entry');
 assert(g.includes('secretIsUnlocked()'),'must honour the open session window');
 assert(g.includes('promptJournalPass'),'must prompt when locked');
 assert(/return false/.test(g)&&/return true/.test(g),'must gate both ways');
 // No lock, or already unlocked, means pass.
 assert(body('function secretIsUnlocked(').includes('!hasJournalLock(p)||journalIsUnlocked()'));
});

test('unlocking resumes wherever the person was headed', ()=>{
 const r=body('function resumeSecretEntry(');
 assert(r.includes("a==='journal'")&&r.includes('openJournal()'),'journal route');
 assert(r.includes("a==='manage'"),'manage route');
 assert(r.includes('openSecretRoom()'),'room route');
 assert(r.includes('inRoom'),'must not bounce someone already inside');
 assert(body('function checkJournalPass(').includes('resumeSecretEntry()'),'unlock must resume');
});

test('relocking leaves the whole Secret Place, not just the journal', ()=>{
 const r=body('function relockJournal(');
 assert(r.includes("show('viewJar')"),'must eject from the room');
 assert(r.includes("viewSecret")&&r.includes('viewJournal'),'must cover both views');
 assert(!r.includes("show('viewSecret')"),'must not merely retreat into the room');
});

test('the wording now describes the Secret Place, not the journal alone', ()=>{
 assert(html.includes('What the Secret Place screen lock protects'));
 assert(html.includes('your prayers and your journal'));
 assert(html.includes('Add a screen lock to the Secret Place?'));
 assert(html.includes('Enter your passcode to enter the Secret Place'));
 assert(html.includes('The Secret Place relocks after five minutes'));
 assert(!html.includes('Add journal screen lock'),'stale label left behind');
 assert(!html.includes('<h3>Your journal screen lock</h3>'),'stale heading left behind');
});

test('the hashed-passcode protection from the earlier fix is still intact', ()=>{
 assert(html.includes('const JOURNAL_LOCK_ITERATIONS=310000;'));
 const sends=html.match(/p_people:[^,]+,/g)||[];
 assert(sends.length>=6);
 for(const s of sends) assert(s.startsWith('p_people:stripJournalSecrets('),'unsanitised: '+s);
 assert(!/\bp\.jpass\s*=\s*[^=]/.test(html),'no readable passcode may be written');
});
