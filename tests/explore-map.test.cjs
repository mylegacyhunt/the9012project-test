'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const guide=html.match(/<!-- EXPLORE 9012 GUIDE -->[\s\S]*?<!-- END EXPLORE 9012 GUIDE -->/)[0];
const map=guide.match(/<figure class="guidemap"[\s\S]*?<\/figure>/)[0];
const controls=html.match(/\/\/ EXPLORE 9012 CONTROLS[\s\S]*?\/\/ END EXPLORE 9012 CONTROLS/)[0];
test('shared illustrated map sits first in the Explore guide, with existing explanations retained',()=>{
 assert(guide.indexOf('id="appGuideMap"')<guide.indexOf('class="guidestart"'));
 assert.equal((html.match(/id="appGuideMap"/g)||[]).length,1);
 assert.match(map,/vision for future connections/);assert.match(map,/<strong>Planned<\/strong>/);
 assert.equal((guide.match(/<li class="guideitem"/g)||[]).length,14);
 assert.match(guide,/Connections available today/);
});
test('full-resolution map has accessible same-asset full-size links and an uncropped responsive layout',()=>{
 const src=map.match(/<img src="([^"]+)"/)[1];assert(src.startsWith('assets/images/shared/guides/'));assert(fs.existsSync(path.join(root,src)));
 const links=[...map.matchAll(/<a\b([^>]+)>/g)];assert.equal(links.length,2);
 for(const [,attrs] of links){assert(attrs.includes('href="'+src+'"'));assert.match(attrs,/target="_blank"/);assert.match(attrs,/rel="noopener"/);}
 assert.match(map,/width="992" height="1586" loading="lazy" decoding="async"/);
 assert.match(map,/alt="The 90:12 Project:/);assert.match(map,/new tab/);
 assert.match(html,/\.guidemap img\{[^}]*width:100%;height:auto;/);
 assert.doesNotMatch(map,/onclick|data:image|<script/);
});
test('guide remains read-only, opens once, and returns focus without changing the current room',()=>{
 let opens=0,closes=0,focused=0;const dialog={open:false,showModal(){this.open=true;opens++;},close(){this.open=false;closes++;}};
 const body={scrollTop:99},trigger={focus(){focused++;}},env={window:{},el:id=>({appGuideDialog:dialog,appGuideBody:body,appGuideTrigger:trigger})[id]};
 vm.createContext(env);vm.runInContext(controls,env);env.open9012Guide();env.open9012Guide();assert.equal(opens,1);assert.equal(body.scrollTop,0);
 env.close9012Guide();assert.equal(closes,1);assert.equal(focused,1);
 assert.doesNotMatch(controls,/supabase|localStorage|sessionStorage|\bfetch\s*\(|\b(?:savePeople|show|openSecretRoom)\s*\(/);
});
