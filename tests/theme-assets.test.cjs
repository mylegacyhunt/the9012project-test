'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const section=(a,b)=>{const s=html.indexOf(a),e=html.indexOf(b,s);assert(s>=0&&e>s,a);return html.slice(s,e);};
const definitions=section('const THEME_ASSETS=','function P(){');
const themes=section('/* Themes */','/* Family Photo Album */');
const assets=vm.runInNewContext(definitions+';THEME_ASSETS');
const nameHelpers=section('function cleanNamePart(v)','function householdHeadPerson()');
function fixture(options={}){
 const storage=new Map(Object.entries(options.storage||{})),events={},images=[];
 function element(src=''){
  const attributes={src},classes=new Set(),properties={};return {src,style:{setProperty(k,v){properties[k]=v;},getPropertyValue(k){return properties[k]||'';}},dataset:{},disabled:false,textContent:'',
   classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),toggle(k,on){on?classes.add(k):classes.delete(k);}},
   setAttribute(k,v){attributes[k]=v;},getAttribute(k){return k==='src'?this.src:attributes[k]||null;},
   addEventListener(){},querySelector(){return null;},remove(){this.removed=true;}};
 }
 const frames=Array.from({length:9},(_,i)=>element(assets.lantern_heritage.scenes[i]));images.push(...frames);
 const cachedPalace=element(assets.lantern_heritage.palace),cachedStone=element(assets.lantern_heritage.stones),cachedDoor=element(assets.lantern_heritage.door),privatePhoto=element('blob:private-user-photo');
 images.push(cachedPalace,cachedStone,cachedDoor,privatePhoto);
 const cards=['lantern_heritage','heirloom_light'].map(key=>{const e=element();e.setAttribute('data-theme',key);e.badge=element();e.querySelector=()=>e.badge;return e;});
 const nodes={themeContinueBtn:element(),themeBackBtn:element(),themeStatus:element(),emPalaceIcon:element(),emStonesIcon:element()};
 const splash=element(),heading=element(),strip={flame:null,querySelector(){return this.flame&&!this.flame.removed?this.flame:null;},appendChild(f){this.flame=f;}};
 const doc={documentElement:element(),createElement:()=>element(),querySelectorAll(s){return s==='.scene .frame'?frames:s==='img'?images:s==='.famstrip'?[strip]:s==='.themecard'?cards:[];},querySelector(s){return s==='#splashLogo img'?splash:s==='#view12Stones .stoneshead img'?heading:null;}};
 const account={user:{id:'fixture-account'}},calls=[],toasts=[];let active='viewJar';
 const env={document:doc,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
  window:{app9012Icons:{getTheme:()=> 'lantern_heritage',setTheme:key=>{env.icon=key;}},addEventListener:(k,f)=>events[k]=f},
  console:{warn(){}},el:id=>nodes[id]||null,currentSession:options.signedOut?null:account,
  supabaseClient:{rpc:async(name,args)=>{calls.push({name,args});if(options.rpc)return options.rpc(name,args);return {data:options.catalog||[],error:null};}},
  activeViewId:()=>active,show:v=>active=v,markTabs(){},showToast:s=>toasts.push(s),esc:s=>s,P:()=>({id:'sample'}),
  isGuidedExperience:()=>false,openPerson:()=>{throw Error('Theme must not reopen or save a person');},openFirstJourney(){},
  savePeople:()=>{throw Error('Theme must not change memories');}};
 vm.createContext(env);vm.runInContext(definitions+themes,env);
 return {run:s=>vm.runInContext(s,env),env,doc,frames,images,cachedPalace,cachedStone,cachedDoor,privatePhoto,strip,heading,splash,cards,storage,calls,toasts,events,view:()=>active};
}
test('each theme has nine distinct full scene files in its own namespace',()=>{
 for(const [key,set] of Object.entries(assets)){
  assert.equal(set.scenes.length,9);assert.equal(new Set(set.scenes).size,9);
  for(const file of [...set.scenes,set.palace,set.stones,set.lantern,set.door,set.familyFlame].filter(Boolean)){
   assert(file.startsWith('assets/images/themes/'+key.replaceAll('_','-')+'/'));
   assert(fs.existsSync(path.join(root,file)),file);
  }
 }
});
test('every runtime image reference resolves and HTML contains no embedded artwork',()=>{
 assert.doesNotMatch(html,/data:image\//);
 for(const name of ['index.html','assets/keepsakes.js','assets/app-icons/theme-icons.js']){
  for(const m of fs.readFileSync(path.join(root,name),'utf8').matchAll(/assets\/images\/[\w./-]+\.(?:png|jpg|webp|svg)/g))assert(fs.existsSync(path.join(root,m[0])),m[0]);
 }
});
test('light scene proportions and both jar counter coordinates are theme-specific',()=>{
 assert.match(html,/html\[data-theme="heirloom_light"\] \.scene\{aspect-ratio:4\/3/);
 assert.match(html,/html\[data-theme="heirloom_light"\] \.famstrip\{aspect-ratio:4\/3/);
 for(const c of ['#numBehind','.sbehind'])assert(html.includes(c+'{left:31%;top:65.5%'));
 for(const c of ['#numBefore','.sbefore'])assert(html.includes(c+'{left:72%;top:65.5%'));
});
test('Heritage family counters and flame are mapped from full scenes to the bottom crop',()=>{
 const map=y=>+(100*(1+(65/48)*(y/100-1))).toFixed(2);
 assert.equal(map(65.5),53.28);assert.equal(map(45.7),26.47);
 assert(html.includes('.sbehind{left:24%;top:53.28%;}'));assert(html.includes('.sbefore{left:76.5%;top:53.28%;}'));
 assert(html.includes('left:50.39%;top:26.47%;width:9.64%'));
});
test('light PNG derivatives retain alpha and adequate resolution',()=>{
 for(const file of [assets.heirloom_light.stones,assets.heirloom_light.palace,'assets/images/shared/other/golden-nugget-app.png']){
  const b=fs.readFileSync(path.join(root,file));assert.equal(b.subarray(1,4).toString(),'PNG');assert(b.readUInt32BE(16)>=512);assert([4,6].includes(b[25]),file+' must retain alpha');
 }
});
test('selected v3 icon manifests use actual PNG sizes and do not claim unsafe maskable artwork',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest-heirloom-light.webmanifest')));
 for(const icon of manifest.icons){assert.match(icon.src,/-v3-app\.png$/);const b=fs.readFileSync(path.join(root,icon.src));assert.equal(icon.sizes,b.readUInt32BE(16)+'x'+b.readUInt32BE(20));assert.equal(icon.purpose,'any');}
 assert.match(fs.readFileSync(path.join(root,'assets/app-icons/theme-icons.js'),'utf8'),/app-icon-180-v3-app.png/);
});
test('card preview and cancel leave active artwork and preference unchanged',async()=>{
 const f=fixture();await f.run('openThemeChoice(false)');f.run("chooseThemeCard('heirloom_light')");
 assert.equal(f.run('currentThemeKey'),'lantern_heritage');assert.equal(f.storage.size,0);
 f.run('closeThemeChoice()');assert.equal(f.view(),'viewJar');
});
test('applying light swaps existing cards, headings and markers without changing private photo sources',()=>{
 const f=fixture();f.run("applyAppTheme('heirloom_light',true)");
 assert.deepEqual(f.frames.map(i=>i.src),Array.from(assets.heirloom_light.scenes));
 assert.equal(f.cachedPalace.src,assets.heirloom_light.palace);assert.equal(f.cachedStone.src,assets.heirloom_light.stones);
 assert.equal(f.cachedDoor.src,assets.heirloom_light.door);
 assert.equal(f.heading.src,assets.heirloom_light.stones);assert.equal(f.privatePhoto.src,'blob:private-user-photo');
 assert.equal(f.storage.get('9012_visual_theme'),'heirloom_light');assert.equal(f.env.icon,'heirloom_light');
});
test('switching back restores every scene and the correct family flame with no duplicate overlays',()=>{
 const f=fixture();f.run("applyAppTheme('heirloom_light');applyAppTheme('lantern_heritage');applyAppTheme('lantern_heritage')");
 assert.deepEqual(f.frames.map(i=>i.src),Array.from(assets.lantern_heritage.scenes));
 assert.equal(f.strip.flame.src,assets.lantern_heritage.familyFlame);assert.equal(f.cachedPalace.src,assets.lantern_heritage.palace);
 assert.equal(f.cachedDoor.src,assets.lantern_heritage.door);
});
test('light verse and quote frame switches independently and restores the Heritage frame',()=>{
 const f=fixture(),light='assets/images/themes/heirloom-light/backgrounds/wisdom-frame-heirloom-light-app.webp';
 assert(fs.existsSync(path.join(root,light)));
 f.run("applyAppTheme('heirloom_light')");assert.equal(f.doc.documentElement.style.getPropertyValue('--frame'),"url('"+light+"')");
 f.run("applyAppTheme('lantern_heritage')");assert.equal(f.doc.documentElement.style.getPropertyValue('--frame'),"url('assets/images/themes/lantern-heritage/backgrounds/frame-texture-app.jpg')");
 const css=html.match(/html\[data-theme="heirloom_light"\] \.wisdomcard\{([^}]+)\}/)[1];
 assert.match(css,/border-image:var\(--frame\) 170 240 fill stretch/);
 assert.match(css,/overflow-wrap:anywhere/);assert.doesNotMatch(css,/(?:^|;)(?:height|max-height):/);
});
test('saved theme loads, invalid keys fall back, and cross-tab storage refresh swaps art too',()=>{
 const f=fixture({storage:{'9012_visual_theme':'heirloom_light'}});assert.equal(f.run('currentThemeKey'),'heirloom_light');
 f.storage.set('9012_visual_theme','lantern_heritage');f.events.storage({key:'9012_visual_theme'});assert.equal(f.frames[0].src,assets.lantern_heritage.scenes[0]);
 assert.equal(f.run("applyAppTheme('not-a-theme')"),'lantern_heritage');
});
test('unreleased server catalog never receives a theme preference write',async()=>{
 const f=fixture({catalog:[{theme_key:'heirloom_light',status:'coming_soon'}]});await f.run('openThemeChoice(false)');f.run("chooseThemeCard('heirloom_light')");await f.run('continueFromThemeChoice()');
 assert(!f.calls.some(c=>c.name==='app9012_set_my_theme'));assert(f.toasts[0].includes('on this device'));assert.equal(f.view(),'viewJar');
});
test('cloud failure reports device-only application and always unlocks the continue button',async()=>{
 const f=fixture({rpc:async name=>name==='app9012_get_theme_catalog'?{data:[{theme_key:'heirloom_light',status:'available'}]}:{error:Error('offline')}});
 await f.run('openThemeChoice(false)');f.run("chooseThemeCard('heirloom_light')");await f.run('continueFromThemeChoice()');
 assert(f.toasts[0].includes('could not be saved'));assert.equal(f.env.el('themeContinueBtn').disabled,false);assert.equal(f.run('themeSaving'),false);
});
test('private/authentication logic and cloud migration stay unchanged from the milestone',()=>{
 const backup=fs.readFileSync(path.join(root,'Archive - Older HTML Builds/01 - Numbered Versions/index(23).html'),'utf8');
 assert.equal(crypto.createHash('sha256').update(backup).digest('hex'),'bb38a5636c6eeca99c2bd36cf0875aedcdc37e56b924d24a41c288ff7293d7e6');
 for(const [a,b] of [['// ACCOUNT RECOVERY STATE','// END ACCOUNT RECOVERY STATE'],['// ACCOUNT RECOVERY —','// END ACCOUNT RECOVERY\n'],['if(supabaseClient){\n supabaseClient.auth.onAuthStateChange','<!-- KEEPSAKE FEATURES -->']]){
  const start=backup.indexOf(a),end=backup.indexOf(b,start);assert(start>=0&&end>start);assert.equal(section(a,b),backup.slice(start,end));
 }
});
test('a synthetic 39-year-old profile renders near-half family jars with an 81-year estimate',()=>{
 class FixedDate extends Date{static now(){return new Date('2026-09-02T12:00:00').getTime();}}
 for(const theme of Object.values(assets))for(const lifespan of [77,79,81]){
  const nodes={famDate:{},famTitle:{},famList:{innerHTML:'',querySelectorAll:()=>[]},famReleased:{}};
  const person={name:'Sample adult',birth:'1987-09-04',lifespan},before=JSON.stringify(person);
  const env={Date:FixedDate,TODAY:'September 2, 2026',people:[person],STRIPS:theme.scenes,FAMILY_FLAME:theme.familyFlame,el:id=>nodes[id],familyPageTitle:()=> 'Sample family',esc:s=>s,mdY:s=>s};
  vm.runInNewContext(nameHelpers+section('function renderFamily(){','function openPerson(i)'),env);
  vm.runInNewContext('renderFamily()',env);
  const live=Math.floor((FixedDate.now()-new FixedDate(person.birth+'T00:00:00'))/(7*864e5)),total=Math.round(lifespan*365.25/7),fraction=live/total,stage=fraction*8;
  assert(fraction>.48&&fraction<.51);assert.equal(live,2034);
  if(lifespan===81){assert.equal(total,4226);assert.equal(total-live,2192);assert.equal(Math.round(fraction*100),48);}
  assert(nodes.famList.innerHTML.includes('src="'+theme.scenes[Math.floor(stage)]+'"'));
  assert(nodes.famList.innerHTML.includes('src="'+theme.scenes[Math.ceil(stage)]+'"'));
  assert(nodes.famList.innerHTML.includes('sbehind">2,034</span>'));
  assert(nodes.famList.innerHTML.includes('sbefore">'+(total-live).toLocaleString()+'</span>'));
  assert.equal(JSON.stringify(person),before,'Rendering must not change the birth date or lifespan');
 }
});
test('family cards use given names without changing full names or personal records',()=>{
 const people=[
  {name:'Alex Morgan Example',first_name:'Alex',middle_name:'Morgan',last_name:'Example'},
  {name:'Mary Ann Example',first_name:'Mary Ann',last_name:'Example'},
  {name:' Jamie Example '},
  {name:'',first_name:''}
 ].map(p=>({...p,birth:'2000-01-01',lifespan:80}));
 const before=JSON.stringify(people),labels=people.map(()=>({textContent:''}));
 const cards=labels.map(label=>({querySelector:s=>s==='.famname'?label:null}));
 const nodes={famDate:{},famTitle:{},famList:{innerHTML:'',querySelectorAll:()=>cards},famReleased:{}};
 const env={people,Date,TODAY:'Today',STRIPS:assets.lantern_heritage.scenes,FAMILY_FLAME:'',el:id=>nodes[id],familyPageTitle:()=> 'Our Family',esc:s=>s,mdY:s=>s,familyConnectionStatus:()=>null};
 vm.createContext(env);vm.runInContext(nameHelpers+section('function renderFamily(){','function openPerson(i)'),env);vm.runInContext('renderFamily()',env);
 assert.deepEqual(labels.map(l=>l.textContent),['Alex’s Jar of Weeks','Mary Ann’s Jar of Weeks','Jamie’s Jar of Weeks','Family member’s Jar of Weeks']);
 assert(!nodes.famList.innerHTML.includes('Morgan Example'));assert(!nodes.famList.innerHTML.includes('Jamie Example'));
 assert.equal(vm.runInContext('personFullName(people[0])',env),'Alex Morgan Example');
 assert.equal(JSON.stringify(people),before);
});
