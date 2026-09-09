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
 assert.match(deletion,/clearTimeout\(secretDraftTimer\)/);
 assert.match(deletion,/location\.replace\(cleanUrl\.href\)/);
 assert.match(deletion,/document\.body\.innerHTML=.*could not clear every cached copy/);
});

test('successful deletion clears every browser cache and page-exit writers stay stopped',()=>{
 const clear=html.slice(html.indexOf('async function clearLocal9012(){'),html.indexOf('// EXPLORE 9012 CONTROLS'));
 assert.match(clear,/window\.storage\.set/);
 assert.match(clear,/\['localStorage','sessionStorage'\]/);
 assert.match(clear,/\^sb-\.\*-auth-token\$/);
 const draft=html.slice(html.indexOf('function writeSecretDraftNow(){'),html.indexOf('function openSecretRoom(){'));
 assert.match(draft,/if\(accountDeletionBusy\)return/);
 assert.match(draft,/pagehide[^\n]+accountDeletionBusy/);
 const reliability=html.slice(html.indexOf('function flushPendingSaves(){'),html.indexOf('window.app9012SaveReliability'));
 assert.match(reliability,/accountDeletionBusy\)return/);
});

test('Heritage and Heirloom Light use the same account-deletion controls',()=>{
 assert.equal((html.match(/id="eraseModal"/g)||[]).length,1);
 assert.match(html,/html\[data-theme="heirloom_light"\] \.mbox/);
 const start=html.indexOf('function checkErase(){'),end=html.indexOf('async function eraseCloudCopy(',start);
 const deletionControls=html.slice(start,end);
 assert.doesNotMatch(deletionControls,/currentThemeKey|lantern_heritage|heirloom_light/);
 for(const theme of ['lantern_heritage','heirloom_light']){
   const nodes={eraseTransferWrap:{style:{display:'none'}},eraseSuccessor:{value:''},eraseGate:{value:'DELETE MY ACCOUNT'},eraseGo:{disabled:true,style:{opacity:'.4'}}};
   const env={currentThemeKey:theme,el:id=>nodes[id]};vm.createContext(env);vm.runInContext(deletionControls,env);env.checkErase();
   assert.equal(nodes.eraseGo.disabled,false,`${theme} must enable the same confirmed deletion button`);
 }
});

function cache(values={}){
 const data=new Map(Object.entries(values));
 return {get length(){return data.size;},key:i=>[...data.keys()][i],getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
}
function deletionEnvironment(theme){
 const nodes={eraseGo:{style:{}},eraseGate:{},eraseSuccessor:{value:'released'},prayerBody:{value:'private draft'}};
 const env={currentThemeKey:theme,el:id=>nodes[id],nodes,accountDeletionBusy:false,cloudSaving:false,cloudHydrating:false,cloudLoadPromise:null,cloudSaveTimer:1,cloudSavePending:true,secretDraftTimer:2,
   currentSession:{user:{id:'synthetic-user'}},people:[{journal:'private'}],releasedPeople:[],mem:{people:'private'},cur:0,activePersonId:'me',householdRole:'head',householdId:'house',cloudMode:'household',
   clearTimeout:()=>{},clearSecretResumeMarker:()=>{},withEraseTimeout:p=>p,eraseCloudCopy:async()=>true,showEraseFailure:()=>{},console:{error:()=>{}},
   supabaseClient:{auth:{signOut:async()=>({error:null})}},document:{body:{innerHTML:'private rendered page'}},alert:()=>{},URL,location:{href:'https://example.test/?old=1#private',replace:url=>{env.destination=url;}}};
 env.window={localStorage:cache({'9012_people':'private','unrelated':'keep'}),sessionStorage:cache({'9012_secret_draft_test':'private','sb-test-auth-token':'token'})};
 vm.createContext(env);
 vm.runInContext(html.slice(html.indexOf('async function clearLocal9012(){'),html.indexOf('// EXPLORE 9012 CONTROLS')),env);
 const start=html.indexOf('async function doEraseAll(){');
 vm.runInContext(html.slice(start,html.indexOf('/* boot */',start)),env);
 return env;
}
for(const theme of ['lantern_heritage','heirloom_light']){
 test(`${theme}: server success clears private caches and draft before clean navigation`,async()=>{
   const env=deletionEnvironment(theme);
   assert.equal(await env.doEraseAll(),true);
   assert.equal(env.window.localStorage.getItem('9012_people'),null);
   assert.equal(env.window.localStorage.getItem('unrelated'),'keep');
   assert.equal(env.window.sessionStorage.length,0);
   assert.equal(env.nodes.prayerBody.value,'');
   assert.equal(env.currentSession,null);
   assert.equal(env.people.length,0);
   assert.equal(env.accountDeletionBusy,true);
   assert.equal(env.destination,'https://example.test/');
 });
 test(`${theme}: server failure preserves device data and permits retry`,async()=>{
   const env=deletionEnvironment(theme);env.eraseCloudCopy=async()=>{throw Error('storage_cleanup_failed');};
   assert.equal(await env.doEraseAll(),false);
   assert.equal(env.window.localStorage.getItem('9012_people'),'private');
   assert.equal(env.nodes.prayerBody.value,'private draft');
   assert.equal(env.accountDeletionBusy,false);
   assert.equal(env.destination,undefined);
   env.eraseCloudCopy=async()=>true;
   assert.equal(await env.doEraseAll(),true);
 });
 test(`${theme}: inaccessible browser storage hides private UI and reports incomplete device cleanup`,async()=>{
   const env=deletionEnvironment(theme);
   Object.defineProperty(env.window,'localStorage',{get(){throw Error('storage denied');}});
   assert.equal(await env.doEraseAll(),false);
   assert.equal(env.currentSession,null);
   assert.match(env.document.body.innerHTML,/cloud account is permanently deleted/);
   assert.doesNotMatch(env.document.body.innerHTML,/private rendered page/);
   assert.equal(env.destination,undefined);
   assert.equal(env.accountDeletionBusy,true);
 });
}
