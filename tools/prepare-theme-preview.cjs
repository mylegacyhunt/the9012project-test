// Generate an isolated preview. Never serve an authenticated production session.
// node tools/prepare-theme-preview.cjs /absolute/temporary/preview-directory
'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dest=path.resolve(process.argv[2]||'');
if(!process.argv[2]||dest===root)throw Error('Supply a separate temporary directory');
fs.mkdirSync(dest,{recursive:true});
for(const name of ['assets','manifest.webmanifest','manifest-heirloom-light.webmanifest']){
 const target=path.join(dest,name);if(!fs.existsSync(target))fs.symlinkSync(path.join(root,name),target);
}
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
html=html.replace(/<script src="https:\/\/cdn.jsdelivr.net\/npm\/@supabase\/supabase-js@2"><\/script>/,'');
html=html.replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="connect-src \'none\'; form-action \'none\'">');
fs.writeFileSync(path.join(dest,'login.html'),html);
const start=html.lastIndexOf('(async function boot(){'),end=html.indexOf('\n})();',start);
if(start<0||end<0)throw Error('Boot boundary changed');
html=html.slice(0,start)+`(function demoBoot(){
 Object.assign(Store,{get:async()=>null,set:async()=>{}});
 const sample=(id,name,birth)=>({id,name,first_name:name,last_name:'Preview',family_name:'Preview',birth,lifespan:90,relation:'you',experience_mode:'full',waymarks:[{id:'sample-'+id,title:'A memory worth keeping',body:'Sample content only. No private family information is loaded in this preview.',date:'2026-08-20',palace:true,stone:true}],goals:[],released:[],prayers:[],journal:[],seen:{},lastSeenWeek:2000});
 people=normalizePeople([sample('demo-person','Alex','1981-09-01'),sample('demo-family','Jamie','2011-09-01')]);releasedPeople=[];
 people[0].waymarks[0].gold=true;people[0].waymarks[0].stones=true;
 currentSession={user:{id:'demo-user',email:'preview@example.invalid'}};
 cur=0;activePersonId=people[0].id;householdRole='head';cloudMode='local';bootReady=true;stage=3;
 ['splashLogo','splashWoman'].forEach(id=>{el(id).style.display='none';el(id).style.pointerEvents='none';});
 openPerson(0);armAppHistory();
})();`+html.slice(end+'\n})();'.length);
html=html.replace('</body>','<div style="position:fixed;bottom:0;left:0;right:0;padding:5px;background:#374831;color:#fff;text-align:center;font:12px system-ui;z-index:99999;pointer-events:none">LOCAL PREVIEW · Sample people only · No server connection</div></body>');
fs.writeFileSync(path.join(dest,'app.html'),html);
const vm=require('node:vm'),source=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sets=vm.runInNewContext(source.slice(source.indexOf('const THEME_ASSETS='),source.indexOf('function P(){'))+';THEME_ASSETS');
fs.writeFileSync(path.join(dest,'jar-stages.html'),'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px system-ui;background:#ede4d4;color:#463724;padding:16px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}figure{margin:0}img{width:100%}figcaption{padding:8px}@media(max-width:600px){.grid{grid-template-columns:1fr}}</style></head><body><h1>Jar fill-stage verification</h1>'+Object.entries(sets).map(([key,set])=>'<h2>'+key+'</h2><div class="grid">'+set.scenes.map((src,i)=>'<figure><img src="'+src+'"><figcaption>'+i+'/8 · '+(i*12.5)+'% legacy / '+(100-i*12.5)+'% remaining</figcaption></figure>').join('')+'</div>').join('')+'</body></html>');
fs.writeFileSync(path.join(dest,'index.html'),`<!doctype html><html><head><title>90:12 responsive preview</title><style>body{margin:0;background:#ddd;font:14px system-ui}nav{padding:10px;display:flex;gap:12px;justify-content:center}iframe{display:block;border:0;margin:auto;width:100%;height:calc(100vh - 52px);background:white}</style></head><body><nav><button onclick="document.querySelector('iframe').style.width='100%'">Desktop width</button><button onclick="document.querySelector('iframe').style.width='390px'">Phone width (390px)</button><a href="app.html">Open app directly</a></nav><iframe title="Isolated 90:12 preview" src="app.html"></iframe></body></html>`);
console.log(dest);
