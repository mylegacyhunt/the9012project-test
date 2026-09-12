'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const deletion=require('../assets/account-deletion.js');

test('personal-account wording preserves 90:12 and shared family content',()=>{
 assert.match(html,/Permanently delete my personal account/);
 assert.match(html,/This does not delete 90:12 or another person&rsquo;s account/);
 assert.match(html,/Letters, Waymarks, photos, videos, voice recordings, and attachments already shared/);
 assert.match(html,/DELETE MY ACCOUNT/);
});

test('queued cloud saves and page-exit writers stop during pending deletion',()=>{
 const queue=html.slice(html.indexOf('function queueCloudSave(){'),html.indexOf('async function clearLocal9012('));
 assert.match(queue,/accountDeletionBusy/);
 assert.match(queue,/accountDeletionPending9012/);
 const draft=html.slice(html.indexOf('function writeSecretDraftNow(){'),html.indexOf('function openSecretRoom(){'));
 assert.match(draft,/if\(accountDeletionBusy\)return/);
 assert.match(draft,/pagehide[^\n]+accountDeletionBusy/);
 const flushStart=html.indexOf('function flushPendingSaves(){');
 const reliability=html.slice(flushStart,html.indexOf('window.app9012SaveReliability',flushStart));
 assert.match(reliability,/accountDeletionBusy\)return/);
});

test('both themes share one recovery dialog and one confirmed-deletion path',()=>{
 assert.equal((html.match(/id="eraseModal"/g)||[]).length,1);
 assert.match(html,/html\[data-theme="heirloom_light"\] \.mbox/);
 for(const id of ['eraseCheck','eraseSignIn','eraseGo'])assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
 const controls=html.slice(html.indexOf('function checkErase(){'),html.indexOf('/* boot */',html.indexOf('function checkErase(){')));
 assert.doesNotMatch(controls,/currentThemeKey|lantern_heritage|heirloom_light/);
});

function cache(values={}){
 const data=new Map(Object.entries(values));
 return {get length(){return data.size;},key:i=>[...data.keys()][i],getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
}
function deletionEnvironment(theme){
 const nodes={};
 for(const id of ['eraseGo','eraseGate','eraseSuccessor','eraseTransferWrap','eraseError','eraseCheck','eraseSignIn','eraseCancel','eraseBackup','eraseModal','prayerBody'])nodes[id]={style:{},classList:{add(){},remove(){}},value:''};
 nodes.eraseGate.value='DELETE MY ACCOUNT';nodes.eraseSuccessor.value='released';nodes.eraseTransferWrap.style.display='none';nodes.prayerBody.value='private draft';
 const wrap={inert:false,hidden:false,innerHTML:'private rendered page'},timers=new Map();let timerId=0;
 const env={currentThemeKey:theme,el:id=>nodes[id],nodes,accountDeletionBusy:false,cloudSaving:false,cloudHydrating:false,cloudLoadPromise:null,cloudSaveTimer:50,cloudSavePending:false,secretDraftTimer:51,
   signOutBusy:false,passwordRecovery:{busy:false},themeSaving:false,cloudThemeLoadPromise:null,
   currentSession:{user:{id:'synthetic-user'},access_token:'synthetic-token'},people:[{journal:'private'}],releasedPeople:[],mem:{people:'private'},cur:0,activePersonId:'me',householdRole:'head',householdId:'house',cloudMode:'household',
   setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},clearTimeout:id=>timers.delete(id),clearSecretResumeMarker:()=>{},openModal:()=>{},openLetter:()=>{},console:{error:()=>{}},
   crypto:{randomUUID:()=> 'synthetic-request'},navigator:{locks:{request:async(_name,options,callback)=>(callback||options)()}},SUPABASE_URL:'https://supabase.example.test',SUPABASE_ANON_KEY:'public-test-key',CLOUD_COPY_MARKER:'9012_cloud_owner',AbortController,
   supabaseClient:{auth:{signOut:async options=>{assert.equal(options.scope,'local');return {error:null};}}},document:{querySelector:selector=>selector==='.wrap'?wrap:null},URL,location:{href:'https://example.test/?old=1#private',replace:url=>{env.destination=url;}}};
 env.window={app9012Deletion:deletion,localStorage:cache({'9012_people':'private','9012_cloud_owner':'synthetic-user','unrelated':'keep'}),sessionStorage:cache({'9012_secret_draft_test':'private','sb-test-auth-token':'token'})};
 env.localStorage=env.window.localStorage;env.sessionStorage=env.window.sessionStorage;
 env.fetch=async(url,options)=>{
   assert.equal(options.headers.Authorization,'Bearer synthetic-token');
   return {ok:true,status:200,json:async()=>url.includes('/functions/')?{deleted:true}:{deletion_protocol:2,user_id:'synthetic-user',deleted:false,status:'not_started',running:false}};
 };
 vm.createContext(env);
 vm.runInContext(html.slice(html.indexOf('async function clearLocal9012('),html.indexOf('// EXPLORE 9012 CONTROLS')),env);
 const start=html.indexOf('function checkErase(){');
 vm.runInContext(html.slice(start,html.indexOf('/* boot */',start)),env);
 env.wrap=wrap;env.timers=timers;
 return env;
}
for(const theme of ['lantern_heritage','heirloom_light']){
 test(`${theme}: missing confirmation or required successor prevents deletion`,async()=>{
   const env=deletionEnvironment(theme);let requests=0;env.fetch=async()=>{requests++;throw Error('must not request');};
   env.nodes.eraseGate.value='DELETE';assert.equal(await env.doEraseAll(),false);
   env.nodes.eraseGate.value='DELETE MY ACCOUNT';env.nodes.eraseTransferWrap.style.display='';env.nodes.eraseSuccessor.value='';
   assert.equal(await env.doEraseAll(),false);assert.equal(requests,0);assert.equal(env.accountDeletionBusy,false);
 });
 test(`${theme}: confirmed success clears private caches and draft before clean navigation`,async()=>{
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
 test(`${theme}: partial server failure keeps writers paused and exposes recovery`,async()=>{
   const env=deletionEnvironment(theme);let statusCalls=0;
   env.fetch=async url=>url.includes('/functions/')?{ok:false,status:500,json:async()=>({error:'storage_cleanup_failed'})}:{ok:true,status:200,json:async()=>({deletion_protocol:2,user_id:'synthetic-user',deleted:false,status:++statusCalls===1?'not_started':'pending',running:false})};
   assert.equal(await env.doEraseAll(),false);
   assert.equal(env.window.localStorage.getItem('9012_people'),'private');
   assert.equal(env.nodes.prayerBody.value,'private draft');
   assert.equal(env.accountDeletionBusy,true);
   assert.equal(env.nodes.eraseCheck.hidden,false);
   assert.equal(env.nodes.eraseGo.textContent,'Finish deleting');
   assert.equal(env.nodes.eraseCancel.disabled,true);
   assert.equal(env.wrap.inert,true);
   assert.equal(env.wrap.hidden,true);
   assert.equal(env.destination,undefined);
 });
 test(`${theme}: a changed account prevents clearing that account's local copies`,async()=>{
   const env=deletionEnvironment(theme);
   env.fetch=async url=>({ok:true,status:200,json:async()=>{
     if(url.includes('/functions/')){env.currentSession={user:{id:'another-user'},access_token:'other-token'};env.window.localStorage.setItem('9012_cloud_owner','another-user');env.window.localStorage.setItem('9012_people','other account private');return {deleted:true};}
     return {deletion_protocol:2,user_id:'synthetic-user',deleted:false,status:'not_started',running:false};
   }});
   assert.equal(await env.doEraseAll(),false);
   assert.equal(env.window.localStorage.getItem('9012_people'),'other account private');
   assert.equal(env.currentSession.user.id,'another-user');
   assert.equal(env.destination,undefined);
   assert.match(env.nodes.eraseError.textContent,/account changed/);
 });
 test(`${theme}: a newly stored SDK account protects its data before the session callback arrives`,async()=>{
   const env=deletionEnvironment(theme);let signOutCalls=0;
   env.supabaseClient.auth.signOut=async()=>{signOutCalls++;return {error:null};};
   const newerSession=JSON.stringify({user:{id:'another-user'},access_token:'other-token'});
   env.fetch=async url=>({ok:true,status:200,json:async()=>{
     if(url.includes('/functions/')){env.window.localStorage.setItem('sb-supabase-auth-token',newerSession);env.window.localStorage.setItem('9012_people','other account private');return {deleted:true};}
     return {deletion_protocol:2,user_id:'synthetic-user',deleted:false,status:'not_started',running:false};
   }});
   assert.equal(await env.doEraseAll(),false);
   assert.equal(env.currentSession.user.id,'synthetic-user','the in-memory session is deliberately stale');
   assert.equal(env.window.localStorage.getItem('sb-supabase-auth-token'),newerSession);
   assert.equal(env.window.localStorage.getItem('9012_people'),'other account private');
   assert.equal(signOutCalls,0);assert.equal(env.destination,undefined);assert.match(env.nodes.eraseError.textContent,/account changed/);
 });
 test(`${theme}: expired authentication offers fresh sign-in while preserving private device copies`,async()=>{
   const env=deletionEnvironment(theme);let signOutCalls=0;
   env.window.localStorage.setItem(deletion.KEY,JSON.stringify({userId:'synthetic-user',requestId:'synthetic-request',phase:'pending',successor:''}));
   env.supabaseClient.auth.signOut=async()=>{signOutCalls++;return {error:null};};
   env.fetch=async()=>({ok:false,status:401,json:async()=>({error:'expired'})});
   assert.equal(await env.checkDeletionProgress9012(),false);
   assert.equal(env.nodes.eraseSignIn.hidden,false,'stale currentSession must not hide the recovery sign-in control');
   assert.equal(signOutCalls,0);assert.equal(env.currentSession.user.id,'synthetic-user');
   await env.signInForDeletion9012();
   assert.equal(signOutCalls,1);assert.equal(env.currentSession,null);
   assert.equal(env.window.localStorage.getItem('9012_people'),'private');assert.ok(env.window.localStorage.getItem(deletion.KEY));
   assert.equal(JSON.parse(env.window.sessionStorage.getItem(deletion.TOKEN_KEY)).accessToken,'synthetic-token');
 });
 test(`${theme}: an account switch during an asynchronous device write prevents clearing its data`,async()=>{
   const env=deletionEnvironment(theme),writes=[];
   env.window.storage={set:async key=>{writes.push(key);await Promise.resolve();env.currentSession={user:{id:'another-user'},access_token:'other-token'};env.window.localStorage.setItem('9012_cloud_owner','another-user');env.window.localStorage.setItem('9012_people','other account private');}};
   assert.equal(await env.doEraseAll(),false);
   assert.equal(env.window.localStorage.getItem('9012_people'),'other account private');
   assert.deepEqual(writes,['people'],'account ownership must be rechecked before another device write');
   assert.equal(env.currentSession.user.id,'another-user');assert.equal(env.destination,undefined);
 });
 test(`${theme}: failed device cleanup hides private UI and retains the recovery marker`,async()=>{
   const env=deletionEnvironment(theme);const store=env.window.localStorage,remove=store.removeItem;
   let cloudDeleted=false;
   env.fetch=async url=>({ok:true,status:200,json:async()=>{
     if(url.includes('/functions/')){cloudDeleted=true;return {deleted:true};}
     return {deletion_protocol:2,user_id:'synthetic-user',deleted:cloudDeleted,status:cloudDeleted?'deleted':'not_started',running:false};
   }});
   store.removeItem=key=>{if(key==='9012_people')throw Error('storage denied');return remove(key);};
   assert.equal(await env.doEraseAll(),false);
   assert.equal(env.currentSession,null);
   assert.equal(env.wrap.innerHTML,'');
   assert.match(env.nodes.eraseError.textContent,/cloud account was deleted.*could not clear every saved copy/);
   assert.equal(env.destination,undefined);
   assert.equal(env.accountDeletionBusy,true);
   assert.ok(store.getItem(deletion.KEY),'reload must still know cleanup is unfinished');
 });
}
