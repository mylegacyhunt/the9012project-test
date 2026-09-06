'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const revisionStart=html.indexOf('/* SHELF REVISION GUARD');
const revisionEnd=html.indexOf('/* END SHELF REVISION GUARD */',revisionStart);
assert(revisionStart>=0&&revisionEnd>revisionStart);
const revisionControls=html.slice(revisionStart,revisionEnd+'/* END SHELF REVISION GUARD */'.length);
const start=html.indexOf('/* SAVE RELIABILITY CONTROLS');
const end=html.indexOf('/* END SAVE RELIABILITY CONTROLS */',start);
assert(start>=0&&end>start);
const controls=html.slice(start,end+'/* END SAVE RELIABILITY CONTROLS */'.length);

function fixture(options={}){
 const status={textContent:'',dataset:{}},documentEvents={},windowEvents={},writes=[],calls=[];
 let queued=0,cloudNow=0;
 const env={
  Store:{set:async()=>options.deviceOk!==false},
  currentSession:options.signedOut?null:{user:{id:'person-1'}},
  supabaseClient:options.noClient?null:{rpc:async(name,args)=>{calls.push({name,args});return options.rpc?options.rpc(name,args):options.rpcResult||{data:{linked:true},error:null};}},
  cloudMode:options.cloudMode||'household',cloudHydrating:false,cloudLoadPromise:null,bootReady:true,
  cloudSaveTimer:options.timer||null,people:[{id:'person-1',journal:[{body:'private'}]}],releasedPeople:[{id:'old'}],
  queueCloudSave(){queued++;},legacyCloudSave:async()=>{if(options.legacyError)throw options.legacyError;},
  cloudSaveNow(){cloudNow++;},clearTimeout(){},
  lsSet(k,v){writes.push({k,v:JSON.parse(JSON.stringify(v))});return options.emergencyOk!==false;},
  el:id=>id==='saveStatus'?status:null,
  document:{visibilityState:'visible',addEventListener:(name,fn)=>{documentEvents[name]=fn;}},
  window:{addEventListener:(name,fn)=>{windowEvents[name]=fn;}},
  console:{error(){}},
 };
 vm.createContext(env);vm.runInContext(revisionControls,env);vm.runInContext(controls,env);
 return {env,status,documentEvents,windowEvents,writes,calls,run:code=>vm.runInContext(code,env),queued:()=>queued,cloudNow:()=>cloudNow};
}

test('footer exposes an accessible persistent save status',()=>{
 assert.match(html,/<span id="saveStatus"[^>]+role="status"[^>]+aria-live="polite"/);
 assert.match(html,/Latest changes were not saved on this device — keep this page open/);
 assert.match(html,/Saved on this device · not saved to your account/);
});

test('device storage success and failure are reported truthfully',async()=>{
 const good=fixture();
 assert.equal(await good.run("Store.set('people',people)"),true);
 assert.equal(good.status.textContent,'Saved changes are on this device');
 assert.equal(good.status.dataset.state,'saved');
 const bad=fixture({deviceOk:false});
 assert.equal(await bad.run("Store.set('people',people)"),false);
 assert.match(bad.status.textContent,/were not saved on this device/);
 assert.equal(bad.status.dataset.state,'failed');
});

test('a failed device save warns before the page is closed',async()=>{
 const f=fixture({deviceOk:false});await f.run("Store.set('people',people)");
 const event={prevented:false,returnValue:null,preventDefault(){this.prevented=true;}};
 f.windowEvents.beforeunload(event);
 assert.equal(event.prevented,true);assert.equal(event.returnValue,'');
});

test('queued and confirmed account saves have distinct states',async()=>{
 const f=fixture();f.run('queueCloudSave()');
 assert.equal(f.queued(),1);assert.match(f.status.textContent,/saving to your account/);
 await f.run("supabaseClient.rpc('app9012_save',{})");
 assert.equal(f.status.textContent,'Saved on this device and to your account');
 const failed=fixture({rpcResult:{data:null,error:new Error('offline')}});
 await failed.run("supabaseClient.rpc('app9012_save',{})");
 assert.equal(failed.status.textContent,'Saved on this device · not saved to your account');
 assert.equal(failed.status.dataset.state,'failed');
});

test('hiding the page immediately stores both private collections and starts a queued account save',()=>{
 const f=fixture({timer:17});f.env.document.visibilityState='hidden';f.documentEvents.visibilitychange();
 assert.deepEqual(f.writes.map(x=>x.k),['people','releasedPeople']);
 assert.equal(f.writes[0].v[0].journal[0].body,'private');
 assert.equal(f.cloudNow(),1);assert.equal(f.run('cloudSaveTimer'),null);
});

test('a failed emergency device write changes the visible status and activates the close warning',()=>{
 const f=fixture({emergencyOk:false});f.windowEvents.pagehide();
 assert.equal(f.run('window.app9012SaveReliability.status().device'),'failed');
 assert.match(f.status.textContent,/keep this page open/);
});

test('a loaded cloud revision is attached to every household shelf save',async()=>{
 const f=fixture({rpc:async name=>name==='app9012_get_context'
  ?{data:{linked:true,household_revision:7,shelf_revisions:{'person-1':4}},error:null}
  :{data:{linked:true,household_revision:8,shelf_revisions:{'person-1':5}},error:null}});
 await f.run("supabaseClient.rpc('app9012_get_context')");
 await f.run("supabaseClient.rpc('app9012_save',{p_people:[],p_released:[]})");
 const args=f.calls[1].args;
 assert.equal(args.p_expected_household_revision,7);
 assert.equal(args.p_shelf_revisions['person-1'],4);
 assert.equal(f.run('window.app9012SaveReliability.status().householdRevision'),8);
});

test('a stale-device refusal is visibly distinguished from an ordinary outage',async()=>{
 const f=fixture({rpcResult:{data:null,error:{code:'40001',message:'app9012_revision_conflict'}}});
 await f.run("supabaseClient.rpc('app9012_save',{p_people:[],p_released:[]})");
 assert.equal(f.status.dataset.state,'failed');
 assert.match(f.status.textContent,/not allowed to overwrite/i);
 assert.equal(f.run('window.app9012SaveReliability.status().account'),'conflict');
});

test('revisions from one signed-in account are never reused for another',async()=>{
 const f=fixture({rpc:async name=>name==='app9012_get_context'
  ?{data:{linked:true,household_revision:9,shelf_revisions:{'person-1':6}},error:null}
  :{data:null,error:{message:'app9012_revision_required'}}});
 await f.run("supabaseClient.rpc('app9012_get_context')");
 f.env.currentSession={user:{id:'different-account'}};
 await f.run("supabaseClient.rpc('app9012_save',{p_people:[],p_released:[]})");
 assert.equal(f.calls[1].args.p_expected_household_revision,null);
 assert.equal(f.calls[1].args.p_shelf_revisions,null);
});
