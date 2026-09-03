'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const voice=fs.readFileSync(path.join(root,'assets/waymark-dictation.js'),'utf8');
const voiceCss=fs.readFileSync(path.join(root,'assets/waymark-dictation.css'),'utf8');
const voiceApi=require('../assets/waymark-dictation.js');

test('both Waymark writing fields use the same compact microphone treatment',()=>{
 assert.equal((html.match(/class="waymark-compose"/g)||[]).length,2);
 assert.equal((html.match(/data-waymark-voice=/g)||[]).length,2);
 assert.match(voice,/aria-label="Dictate this Waymark"/);
 assert.match(voice,/title="Dictate"/);
 const controls=voice.slice(voice.indexOf("container.innerHTML ="),voice.indexOf("const find =",voice.indexOf("container.innerHTML =")));
 assert.doesNotMatch(controls,/Hold to speak|Tap to speak instead|Use keyboard dictation/);
 assert.match(voiceCss,/\.voice-actions\{position:absolute/);
 assert.doesNotMatch(voiceCss,/\.waymark-voice\{[^}]*border:/);
});

test('dictation remains review-before-save and visibly reports listening and stopping',()=>{
 assert.match(voice,/Listening… Tap Stop when you’re finished\./);
 assert.match(voice,/'■ Stop'/);
 assert.match(voice,/Your words are ready to review\. Edit them, then press the save button to create your Waymark/);
 assert.match(voice,/90:12 does not save an audio recording/);
});

test('compact microphone still appends speech, stops before save, and unlocks the field',()=>{
 let value='Earlier words',locked=false,lastState=null;
 class Recognition{
  constructor(){Recognition.last=this;this.stopped=false;}
  start(){this.onstart();}
  stop(){this.stopped=true;}
  abort(){}
 }
 const field={id:'wBody',read:()=>value,write:v=>{value=v;},editable:()=>true,lock:v=>{locked=v;}};
 const controller=voiceApi.createController({Recognition,setTimeout:()=>0,clearTimeout(){},onStatus(){},onState:s=>{lastState=s;}});
 assert(controller.start(field,'tap'));assert(locked);assert.equal(lastState.phase,'listening');
 const result=Object.assign([{transcript:'a memory'}],{isFinal:true});
 Recognition.last.onresult({results:[result]});assert.equal(value,'Earlier words a memory');
 assert.equal(controller.canSave('wBody'),false);assert(Recognition.last.stopped);
 Recognition.last.onend();assert.equal(controller.current(),null);assert.equal(locked,false);
 assert.match(lastState.message,/ready to review/);
});

test('personal and family shelves steady the right plaque while fill images blend',()=>{
 assert.match(html,/class="shelf-plaque-before" src="assets\/images\/themes\/lantern-heritage\/lantern\/lantern-scene-04-app\.jpg"/);
 assert.match(html,/class="shelf-plaque-before" src="\$\{STRIPS\[4\]\}"/);
 assert.match(html,/\.shelf-plaque-before\{[^}]*object-fit:contain/);
 assert.match(html,/\.famstrip \.shelf-plaque-before\{[^}]*object-fit:cover/);
 assert.match(html,/html\[data-theme="heirloom_light"\] \.shelf-plaque-before\{clip-path:/);
 assert.match(html,/html\[data-theme="heirloom_light"\] \.famstrip \.shelf-plaque-before\{object-fit:contain/);
});

test('desktop shelf enlarges without changing either theme scene ratio',()=>{
 assert.match(html,/@media\(min-width:1040px\)\{\.scene\{width:calc\(100% \+ 144px\);margin-left:-72px/);
 assert.match(html,/\.scene\{position:relative;width:100%;aspect-ratio:1536\/1024/);
 assert.match(html,/html\[data-theme="heirloom_light"\] \.scene\{aspect-ratio:4\/3/);
});

test('lantern flicker is added only to light-theme artwork and respects reduced motion',()=>{
 assert.match(html,/html\[data-theme="heirloom_light"\] \.scene::after,html\[data-theme="heirloom_light"\] \.famstrip::after\{/);
 assert.match(html,/html\[data-theme="heirloom_light"\] \.secretdoor::before\{/);
 assert.match(html,/@keyframes heirloomLanternGlow/);
 assert.match(html,/@media\(prefers-reduced-motion:reduce\).*heirloomLanternGlow|@media\(prefers-reduced-motion:reduce\).*animation:none/s);
 assert.equal((html.match(/@keyframes flickerFlame\{/g)||[]).length,1,'Heritage flame animation remains unchanged');
 assert.doesNotMatch(html,/html\[data-theme="lantern_heritage"\].*heirloomLanternGlow/);
});
