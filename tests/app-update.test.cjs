'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const start=html.indexOf('/* APP UPDATE CONTROLS */'),end=html.indexOf('/* END APP UPDATE CONTROLS */',start);
assert(start>=0&&end>start);
const controls=html.slice(start,end+'/* END APP UPDATE CONTROLS */'.length);

function fixture(options={}){
 const notice={hidden:true},message={textContent:''},button={},events={},timers=[];let replaced='',flushes=0,view=options.view||'viewJar';
 const win={addEventListener:(name,fn)=>events['window:'+name]=fn,app9012SaveReliability:{status:()=>({device:'saved'}),flush:()=>flushes++}};
 if(options.pendingLetter)win.app9012Keepsakes={hasPendingWork:()=>true};
 const env={
  document:{baseURI:'https://test.the9012project.com/',lastModified:options.currentModified||'Wed, 09 Sep 2026 10:00:00 GMT',visibilityState:'visible',activeElement:null,
   querySelector(selector){if(selector==='meta[name="app-build"]')return {content:'2026.09.09.5'};if(selector==='dialog[open],.modal.open')return options.dialogOpen?{}:null;return null;},
   addEventListener:(name,fn)=>events['document:'+name]=fn},
  window:win,navigator:{onLine:true},location:{href:'https://test.the9012project.com/',replace:value=>{replaced=value;}},URL,Set,Date,Promise,
  bootReady:true,accountDeletionBusy:false,cloudSaving:false,cloudSavePending:false,cloudHydrating:false,cloudLoadPromise:null,
  el:id=>({appUpdateNotice:notice,appUpdateMessage:message,appUpdateButton:button})[id]||null,activeViewId:()=>view,
  fetch:async()=>({ok:true,headers:{get:name=>name==='last-modified'?(options.latestModified||'Wed, 09 Sep 2026 11:00:00 GMT'):null},text:async()=>options.latestSource||'<meta name="app-build" content="2026.09.10.1"/>'}),
  setInterval:(fn,delay)=>{timers.push({fn,delay,interval:true});return timers.length;},setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length;},clearTimeout(){},
  console:{warn(){}}
 };
 vm.createContext(env);vm.runInContext(controls,env);
 return {env,notice,message,events,timers,replaced:()=>replaced,flushes:()=>flushes,setView:value=>{view=value;}};
}

test('the app carries a build marker and checks every five minutes plus lifecycle events',()=>{
 assert.match(html,/<meta name="app-build" content="2026\.09\.09\.5"/);
 assert.match(controls,/checkEvery=5\*60\*1000/);
 assert.match(controls,/setInterval\(checkForUpdate,checkEvery\)/);
 assert.match(controls,/addEventListener\('online',checkForUpdate\)/);
 assert.match(controls,/addEventListener\('focus',checkForUpdate\)/);
 assert.match(controls,/visibilitychange[\s\S]*?checkForUpdate\(\)/);
});

test('a newer build on a safe Shelf schedules and applies a cache-busted reload',async()=>{
 const f=fixture();assert.equal(await f.env.window.app9012Updates.check(),true);
 assert.equal(f.notice.hidden,false);assert.match(f.message.textContent,/automatically/);assert(f.timers.some(t=>t.delay===10000));
 assert.equal(await f.env.window.applyAppUpdate9012(),true);assert.equal(f.flushes(),1);
 const url=new URL(f.replaced());assert.equal(url.searchParams.get('appBuild'),'2026.09.10.1');
});

test('updates wait when a person is writing or remains on a writing screen',async()=>{
 for(const options of [{view:'viewJournal'},{pendingLetter:true}]){
  const f=fixture(options);await f.env.window.app9012Updates.check();
  assert.match(f.message.textContent,/Finish or save/);assert.equal(await f.env.window.applyAppUpdate9012(),false);assert.equal(f.replaced(),'');
 }
});

test('the server modification time detects an update even if a build marker was not bumped',async()=>{
 const f=fixture({latestSource:'<meta name="app-build" content="2026.09.09.5"/>'});
 assert.equal(await f.env.window.app9012Updates.check(),true);assert.equal(f.notice.hidden,false);
});

test('the current server copy does not cause a reload loop',async()=>{
 const same='Wed, 09 Sep 2026 10:00:00 GMT',f=fixture({currentModified:same,latestModified:same,latestSource:'<meta name="app-build" content="2026.09.09.5"/>'});
 assert.equal(await f.env.window.app9012Updates.check(),false);assert.equal(f.notice.hidden,true);assert.equal(f.replaced(),'');
});

test('draft-producing modules expose update safety guards',()=>{
 const keepsakes=fs.readFileSync(path.join(root,'assets/keepsakes.js'),'utf8'),media=fs.readFileSync(path.join(root,'assets/family-media.js'),'utf8');
 assert.match(keepsakes,/hasPendingWork:\(\)=>busy\|\|!!\(letterDraft&&letterDraft\.body&&letterDraft\.body\.trim\(\)\)/);
 assert.match(media,/hasPendingWork:\(\)=>!!draft\|\|busy\|\|recorder\.busy\(\)/);
});
