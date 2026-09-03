'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const lum=hex=>hex.replace('#','').match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
function rule(selector){const prefix='html[data-theme="heirloom_light"] '+selector+'{',start=html.indexOf(prefix);assert(start>=0,selector);return html.slice(start+prefix.length,html.indexOf('}',start));}
const value=(css,prop)=>{const m=css.match(new RegExp('(?:^|;)'+prop+':([^;]+)'));assert(m,prop);return m[1];};
test('Salvation text, Bible verses, prayer, and call-to-action have strong light-theme contrast',()=>{
 const paper=value(rule('.salvwrap'),'background');
 for(const selector of ['.salvbody','.salvbody h2','.salvbody b','.salvverse','.salvsmall']){
  // Shared-selector rules end with the tested selector for verse and small text.
  const css=rule(selector),color=value(css,'color');assert(contrast(color,paper)>=4.5,selector);
 }
 for(const selector of ['.salvprayer','.salvbtn','.sitefoot .salvationlink']){const css=rule(selector);assert(contrast(value(css,'color'),value(css,'background'))>=4.5,selector);}
 assert.equal(value(rule('.salvbody'),'font-size'),'18px');
 assert.equal(value(rule('.sitefoot .salvationlink'),'animation'),'none');
 assert.equal(value(rule('.sitefoot .salvationlink'),'text-shadow'),'none');
});
test('selected sage controls and saved-entry actions remain readable',()=>{
 for(const selector of ['.pill.active','.eacts .mini']){const css=rule(selector);assert(contrast(value(css,'color'),value(css,'background'))>=4.5,selector);}
 assert.match(rule('.eacts'),/flex-wrap:wrap/);assert.match(rule('.eacts .mini'),/white-space:normal/);
 assert(contrast(value(rule('.laydownlbl'),'color'),'#e5d8c4')>=4.5);
 assert(contrast(value(rule('.fambd'),'color'),'#e5d8c4')>=4.5);
});
test('Salvation wording and email destination were not changed by readability work',()=>{
 const section=html.slice(html.indexOf('<div class="view" id="viewSalvation">'),html.indexOf('<div class="modal" id="expandModal">'));
 assert.equal(crypto.createHash('sha256').update(section).digest('hex'),'5578b9bd834366026d256d710f9f045222e80f9c6e1e218bf31ac06cdb1a860b');
});
test('Journal and photo-album help text has a readable light-theme override',()=>{
 for(const selector of ['.jtitle','.jverse','.jhint','.jprev','#viewFamilyPhotos summary'])assert(contrast(value(rule(selector),'color'),'#e5d8c4')>=4.5,selector);
});
test('the real Secret Place doorway is visible and keyboard-operable without bypassing entry',()=>{
 const door=html.match(/<div class="secretdoor"[^]*?<div class="doorcaption">The Secret Place<\/div><\/div>/)[0];
 assert.match(door,/role="button" tabindex="0"/);assert.match(door,/aria-label="Enter the Secret Place"/);
 assert.match(door,/event.key==='Enter'\|\|event.key===' '/);assert.match(door,/onclick="enterSecret\(\)"/);
 assert.match(rule('.secretdoor img'),/display:block;height:auto/);
 assert.doesNotMatch(html,/html\[data-theme="heirloom_light"\] \.secretdoor img\{display:none/);
 assert(fs.existsSync(path.join(__dirname,'../assets/images/themes/heirloom-light/secret-place/secret-door-heirloom-light-cream-app.webp')));
});
