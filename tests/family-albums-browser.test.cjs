'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('album controls, thumbnail encoding and clipboard work in both themes',{skip:!process.env.PLAYWRIGHT_MODULE_PATH},async()=>{
 const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH),browser=await chromium.launch({headless:true,executablePath:chromium.executablePath()});
 try{for(const theme of ['lantern_heritage','heirloom_light']){
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),css=html.slice(html.indexOf('<style>')+7,html.indexOf('</style>'));
  await page.setContent('<html data-theme="'+theme+'"><head></head><body><section id="viewFamilyPhotos" class="active"><section id="familyMediaRoot"></section></section></body></html>');
  await page.addStyleTag({content:css});await page.addStyleTag({path:path.join(__dirname,'../assets/family-media.css')});
  await page.evaluate(()=>{
   window.crypto.randomUUID=()=> '20000000-0000-4000-8000-000000000002';window.calls=[];window.activeUser='00000000-0000-4000-8000-000000000001';window.items=[{id:'20000000-0000-4000-8000-000000000001',caption:'Family garden',original_filename:'garden.jpg',uploader_name:'Test parent',uploader_user_id:window.activeUser,media_kind:'photo',mime_type:'image/jpeg',byte_size:200,timeline_at:'2000-06-15T12:00:00Z',albums:[],favorite:false,metadata_status:'estimated'}];
   window.savedPrefs={};window.containers=[];window.fakeClient={rpc:async(name,args)=>{window.calls.push({name,args});if(name==='app9012_media_context')return {data:{enabled:true,user_id:window.activeUser,household_id:'10000000-0000-4000-8000-000000000001'}};const p=args.p_args||{},a=args.p_action;if(a==='context')return {data:{albums:window.containers,preferences:window.savedPrefs[p.album||'all']}};if(a==='list')return {data:window.items};if(a==='preferences')window.savedPrefs[p.album||'all']=p;if(a==='favorite')window.items[0].favorite=p.value;if(a==='create'){const id='30000000-0000-4000-8000-000000000001';window.containers.push({id,name:p.name,kind:p.kind,parent_id:p.album||null,created_by:window.activeUser});return {data:{id}};}return {data:{ok:true}};}};
   window.app9012FamilyMediaContext=()=>({client:window.fakeClient,userId:window.activeUser,householdId:'10000000-0000-4000-8000-000000000001'});
  });
  await page.addScriptTag({path:path.join(__dirname,'../assets/family-albums.js')});await page.addScriptTag({path:path.join(__dirname,'../assets/family-media.js')});
  await page.getByRole('heading',{name:'Family garden'}).waitFor();
  await page.getByLabel('Sort',{exact:true}).selectOption('oldest');await page.waitForFunction(()=>window.calls.some(c=>c.args.p_action==='preferences'&&c.args.p_args.sort==='oldest'));
  await page.getByRole('button',{name:'☆ Favorite',exact:true}).click();await page.getByRole('button',{name:'★ My favorite',exact:true}).waitFor();
  page.once('dialog',d=>d.accept('Summer'));await page.getByRole('button',{name:'New album',exact:true}).click();await page.waitForFunction(()=>window.containers.length===1);
  const jpg=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=1600;c.height=900;const x=c.getContext('2d');x.fillStyle='green';x.fillRect(0,0,1600,900);const blob=await new Promise(r=>c.toBlob(r,'image/png'));window.testImage=new File([blob],'garden.png',{type:'image/png'});return window.app9012Albums.thumbnail(window,window.testImage);});assert(jpg.startsWith('data:image/jpeg;base64,/9j/'));assert(jpg.length<90000);
  const dimensions=await page.evaluate(async jpg=>{const im=new Image();im.src=jpg;await im.decode();return [im.naturalWidth,im.naturalHeight];},jpg);assert.deepEqual(dimensions,[480,270]);
  await page.evaluate(()=>{const data=new DataTransfer();data.items.add(window.testImage);document.body.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
  await page.getByRole('heading',{name:'Preview before sharing'}).waitFor();assert.equal(await page.getByRole('button',{name:'Share with my family',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'Discard draft',exact:true}).click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  await page.screenshot({path:'/private/tmp/9012-albums-'+theme+'.png',fullPage:true});
  // A delayed old-account response must never repopulate a cleared browser.
  await page.evaluate(()=>{window.app9012FamilyMedia.reset();window.activeUser='00000000-0000-4000-8000-000000000002';});assert.equal(await page.locator('.fm-card').count(),0);assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
});
