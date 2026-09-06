'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');

test('the revision layer covers every whole-shelf RPC without rewriting protected call sites',()=>{
 const calls=[...html.matchAll(/\.rpc\('app9012_save'/g)];
 assert.equal(calls.length,4);
 assert.match(html,/if\(name==='app9012_save'\)args=guardedShelfSaveArgs\(args\)/);
 assert.match(html,/p_expected_household_revision:ready\?cloudHouseholdRevision:null/);
 assert.match(html,/p_shelf_revisions:ready\?cloudShelfRevisions:null/);
});

test('revision metadata is validated before reuse and scoped to the signed-in account',()=>{
 assert.match(html,/cloudRevisionOwnerId=currentSession\.user\.id/);
 assert.match(html,/cloudRevisionOwnerId===owner/);
 assert.match(html,/!Number\.isSafeInteger\(household\)\|\|household<1/);
 assert.match(html,/Number\.isSafeInteger\(value\)&&value>0/);
});

test('the guard is installed before asynchronous boot can load cloud context',()=>{
 assert(html.indexOf('/* SHELF REVISION GUARD')<html.indexOf('(async function boot(){'));
});

test('the protected authentication and private-data section remains byte-for-byte unchanged',()=>{
 const backup=fs.readFileSync(path.join(root,'Archive - Older HTML Builds/01 - Numbered Versions/index(23).html'),'utf8');
 const start='if(supabaseClient){\n supabaseClient.auth.onAuthStateChange',end='<!-- KEEPSAKE FEATURES -->';
 const currentStart=html.indexOf(start),currentEnd=html.indexOf(end,currentStart);
 const oldStart=backup.indexOf(start),oldEnd=backup.indexOf(end,oldStart);
 assert(currentStart>=0&&currentEnd>currentStart&&oldStart>=0&&oldEnd>oldStart);
 const current=html.slice(currentStart,currentEnd),original=backup.slice(oldStart,oldEnd);
 assert.equal(crypto.createHash('sha256').update(current).digest('hex'),crypto.createHash('sha256').update(original).digest('hex'));
});
