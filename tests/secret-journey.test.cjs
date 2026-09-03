'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const code=html.slice(html.indexOf('function secretWalkSeenKey()'),html.indexOf("var curHand='spencer';"));
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
function fixture({theme='heirloom_light',reduced=false,roomOpen=false}={}){
 let person={id:'example-person',secretIntroCompleted:true,journal:[{body:'Keep my draft'}]},clock=0,id=0,opened=0,saved=0;
 const timers=new Map(),storage=new Map(),styles=()=>({}),next={disabled:false,focus(){env.document.activeElement=this;}},skip={focus(){env.document.activeElement=this;}},status={textContent:''};
 const imgs=Array.from({length:5},()=>({style:styles(),complete:false,naturalWidth:0}));
 const seq={style:styles(),dataset:{},querySelectorAll:()=>imgs,querySelector:s=>s==='.walkstatus'?status:s==='[data-walk-next]'?next:skip};
 const room={classList:{contains:()=>roomOpen},querySelector:()=>({focus(){}})};
 const env={currentThemeKey:theme,P:()=>person,savePeople:()=>saved++,openSecretRoom:()=>opened++,el:id=>id==='secretSeq'?seq:room,closeModal(){},showToast(){},window:{matchMedia:()=>({matches:reduced})},document:{activeElement:null},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},requestAnimationFrame:f=>f(),setTimeout:(f,ms)=>{const n=++id;timers.set(n,{f,at:clock+ms});return n;},clearTimeout:n=>timers.delete(n)};
 vm.createContext(env);vm.runInContext(code,env);
 return {env,imgs,seq,status,next,skip,storage,run:s=>vm.runInContext(s,env),opened:()=>opened,saved:()=>saved,person:()=>person,setPerson:p=>person=p,load:async(n,ok=true)=>{const img=imgs[n];if(ok){img.complete=true;img.naturalWidth=100;if(img.onload)img.onload();}else if(img.onerror)img.onerror();await flush();},tick:async ms=>{clock+=ms;for(const [n,t] of [...timers])if(t.at<=clock&&timers.has(n)){timers.delete(n);t.f();}await flush();}};
}
test('both themes have five separate, existing journey images; light order excludes the narrow alternate',()=>{
 const f=fixture(),sets=f.run('SECRET_JOURNEYS');
 for(const [theme,set] of Object.entries(sets)){assert.equal(set.frames.length,5);for(const p of set.frames){assert(p.includes('/'+theme.replaceAll('_','-')+'/'));assert(fs.existsSync(path.join(root,p)));}}
 assert(sets.heirloom_light.frames[0].includes('01-doorway'));assert(sets.heirloom_light.frames[4].includes('05-writing-desk'));
 assert(!/heirloom_light[^\n]*#secretSeq\{display:none/.test(html));assert(!html.includes('button[onclick="replaySecretJourney()"]{display:none;}'));
});
test('light intro completion is independent from Heritage and scoped to the person',()=>{
 const f=fixture();assert.equal(f.run('secretIntroComplete()'),false);f.run('markSecretIntroComplete()');assert.equal(f.run('secretIntroComplete()'),true);assert.equal(f.saved(),0);
 f.setPerson({id:'someone-else'});assert.equal(f.run('secretIntroComplete()'),false);f.env.currentThemeKey='lantern_heritage';f.run('markSecretIntroComplete()');assert.equal(f.saved(),1);
});
test('walk waits for decoded images, keeps the same hold/zoom rhythm, and dissolves into the room',async()=>{
 const f=fixture();f.run('playSecretSeq()');assert.equal(f.next.disabled,true);assert.equal(f.seq.style.display,'block');
 for(let n=0;n<5;n++)await f.load(n);
 assert.equal(f.seq.dataset.frame,'1');assert.equal(f.imgs[0].style.transform,'scale(1.08)');
 for(const [index,ms] of [2700,3100,3100,3100].entries()){await f.tick(ms);assert.equal(f.seq.dataset.frame,String(index+2));}
 await f.tick(3300);assert.equal(f.opened(),1);assert.equal(f.seq.style.opacity,'0');await f.tick(1200);assert.equal(f.seq.style.display,'none');assert.equal(f.run('secretIntroComplete()'),true);
});
test('enter now works during loading, finishes once, and clears late callbacks',async()=>{
 const f=fixture();f.run('playSecretSeq()');f.skip.onclick({stopPropagation(){}});assert.equal(f.opened(),1);for(let n=0;n<5;n++)await f.load(n);await f.tick(25000);assert.equal(f.opened(),1);assert.equal(f.seq.style.display,'none');
});
test('image failure does not block private room or mark the failed walk seen',async()=>{
 const f=fixture();f.run('playSecretSeq()');await f.load(0,false);assert.equal(f.opened(),1);assert.equal(f.run('secretIntroComplete()'),false);await f.tick(1200);assert.equal(f.seq.style.display,'none');
});
test('reduced motion bypasses image loading and animation',()=>{
 const f=fixture({reduced:true});f.run('playSecretSeq()');assert.equal(f.opened(),1);assert.equal(f.seq.style.display,'none');assert(f.imgs.every(i=>!i.src));
});
test('replaying from an open room preserves drafts and does not reopen or save them',async()=>{
 const f=fixture({roomOpen:true}),before=JSON.stringify(f.person());f.run('playSecretSeq()');f.skip.onclick({stopPropagation(){}});await f.tick(1200);assert.equal(f.opened(),0);assert.equal(f.saved(),0);assert.equal(JSON.stringify(f.person()),before);
});
test('account or theme changes cannot finish an old walk on another person',async()=>{
 const f=fixture();f.run('playSecretSeq()');f.setPerson({id:'different-person'});await f.load(0);assert.equal(f.opened(),0);assert.equal(f.storage.size,0);assert.equal(f.seq.style.display,'none');
 const g=fixture();g.run('playSecretSeq()');g.env.currentThemeKey='lantern_heritage';await g.load(0);assert.equal(g.opened(),0);assert.equal(g.saved(),0);
 const h=fixture();h.env.currentSession={user:{id:'old-account'}};h.run('playSecretSeq()');h.env.currentSession={user:{id:'new-account'}};await h.load(0);assert.equal(h.opened(),0);assert.equal(h.saved(),0);
});
test('Escape, focus cycling, and repeated replay remain safe',async()=>{
 const f=fixture();f.run('playSecretSeq()');f.run('playSecretSeq()');await f.load(0);f.seq.onkeydown({key:'Tab',preventDefault(){}});assert.equal(f.env.document.activeElement,f.next);f.seq.onkeydown({key:'Escape',preventDefault(){}});await f.tick(1200);assert.equal(f.opened(),1);assert.equal(f.seq.style.display,'none');
});
