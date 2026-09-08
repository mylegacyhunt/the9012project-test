'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');

test('personal-account wording preserves 90:12 and shared family content',()=>{
 assert.match(html,/Permanently delete my personal account/);
 assert.match(html,/This does not delete 90:12 or another person&rsquo;s account/);
 assert.match(html,/Letters, Waymarks, photos, videos, voice recordings, and attachments already shared/);
 assert.match(html,/DELETE MY ACCOUNT/);
});

test('cloud deletion accepts only an explicit deleted true response',async()=>{
 const start=html.indexOf('async function eraseCloudCopy('),end=html.indexOf('async function doEraseAll()',start);
 assert(start>0&&end>start);
 const env={currentSession:{user:{id:'test'}},supabaseClient:{functions:{invoke:async()=>({data:{deleted:false},error:null})}},Object,Error};
 vm.createContext(env);vm.runInContext(html.slice(start,end),env);
 await assert.rejects(()=>env.eraseCloudCopy('successor'));
 env.supabaseClient.functions.invoke=async(name,options)=>{assert.equal(name,'delete-account');assert.equal(options.body.confirmation,'DELETE MY ACCOUNT');return {data:{deleted:true},error:null};};
 assert.equal(await env.eraseCloudCopy('successor'),true);
});

test('queued cloud saves stop once account deletion begins',()=>{
 const queue=html.slice(html.indexOf('function queueCloudSave(){'),html.indexOf('async function clearLocal9012(){'));
 assert.match(queue,/accountDeletionBusy/);
 const deletion=html.slice(html.indexOf('async function doEraseAll(){'),html.indexOf('\/\* boot \*\/',html.indexOf('async function doEraseAll(){')));
 assert.match(deletion,/clearTimeout\(cloudSaveTimer\)/);
 assert.match(deletion,/await withEraseTimeout\(eraseCloudCopy/);
 assert.ok(deletion.indexOf('await withEraseTimeout(eraseCloudCopy')<deletion.indexOf('await clearLocal9012()'),'device data must clear only after server confirmation');
});
