/* Private keepsakes pilot. No letter bodies or passcodes enter shared shelf data. */
(function(root,factory){
 'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else api.mount(root);
}(typeof window==='object'?window:null,function(){
 'use strict';
 const BUCKET='9012-entry-files';
 const TYPES={
  'image/jpeg':12,'image/png':12,'image/webp':12,'image/gif':12,'image/heic':12,'image/heif':12,
  'video/mp4':45,'video/webm':45,'video/quicktime':45,
  'application/pdf':20,'text/plain':20,'application/msword':20,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':20,
  'application/vnd.ms-excel':20,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':20,'text/csv':20
 };
 const EXT={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',heic:'image/heic',heif:'image/heif',mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime',pdf:'application/pdf',txt:'text/plain',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',csv:'text/csv'};
 const HANDS={spencer:'Pinyon Script',vibes:'Great Vibes',dancing:'Dancing Script',caveat:'Caveat',print:'Patrick Hand',note:'Kalam',neat:'Shadows Into Light Two',serif:'EB Garamond',times:'Times New Roman'};
 function validateFile(file){
  const ext=String(file?.name||'').split('.').pop().toLowerCase();
  const mime=String(file?.type||EXT[ext]||'').split(';')[0].toLowerCase();
  if(!TYPES[mime]||!EXT[ext]||EXT[ext]!==mime)throw Error('Choose a supported photo, MP4/MOV/WebM video, PDF, Word, Excel, CSV or text file.');
  if(!Number.isSafeInteger(file.size)||file.size<=0||file.size>TYPES[mime]*1024*1024)throw Error('This file must be between 1 byte and '+TYPES[mime]+' MB.');
  return {mime,kind:mime.startsWith('image/')?'photo':mime.startsWith('video/')?'video':'file'};
 }
 function sameAccount(a,b){return !!(a?.userId&&a?.householdId&&a.userId===b?.userId&&a.householdId===b?.householdId&&a.client===b?.client);}
 async function uploadFile(o){
  const info=validateFile(o.draft.file),ctx=o.snapshot;
  const check=()=>{if(!sameAccount(ctx,o.context())||o.cancelled())throw Error('The account or screen changed. Reopen the entry to check its attachments.');};
  const call=async(action,data)=>{check();const r=await ctx.client.rpc('app9012_keepsakes',{p_action:action,p_payload:{...data,household_id:ctx.householdId}});check();if(r.error)throw r.error;return r.data;};
  check();const f=o.draft.file;
  const row=await call('file_begin',{id:o.draft.id,source_kind:o.kind,source_id:o.sourceId,filename:f.name.slice(0,180),mime:info.mime,bytes:f.size,visibility:o.visibility});
  const path=ctx.householdId+'/'+ctx.userId+'/'+o.draft.id;
  if(row?.path!==path)throw Error('Upload location was not confirmed.');
  if(row.state==='ready')return {ready:true};
  if(row.state!=='pending')throw Error('This upload is no longer available.');
  check();const result=await ctx.client.storage.from(BUCKET).upload(path,f,{contentType:info.mime,upsert:false,cacheControl:'0'});check();
  if(result.error&&!['409','Duplicate'].includes(String(result.error.statusCode||result.error.code)))throw result.error;
  const ready=await call('file_finish',{id:o.draft.id});if(ready?.ready!==true)throw Error('Upload was not confirmed.');return ready;
 }
 function mount(root){
  const doc=root?.document,bridge=root?.app9012KeepsakeBridge;if(!doc||!bridge)return;
  const ctx=()=>bridge.context();
  const node=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const btn=(text,action,cls='ghost')=>{const b=node('button',text,cls);b.type='button';b.addEventListener('click',action);return b;};
  const heading=(text)=>node('h2',text);
  const note=(text)=>node('p',text,'ks-hint');
  const uuid=()=>root.crypto.randomUUID();
  let generation=0,last=null,token='',tokenDeadline=0,dialog=null,dialogClose=null,dialogTrigger=null,dialogKey='',busy=false,letterDraft=null,urls=[],polling=false;
  const errorText=e=>String(e?.message||e||'').includes('letters_locked')?'Your letters are locked. Close this window and unlock Letters again.':String(e?.message||e||'').includes('already_opened')?'This letter has already been opened and cannot be recalled.':String(e?.message||e||'').includes('recipient_needs')?'That person needs their own connected account before receiving private letters.':'Could not confirm this action. Check your connection and retry. If this is the first test, the new Supabase migration must be installed first.';
  function alive(c,g){return generation===g&&sameAccount(c,ctx());}
  async function rpc(action,payload={},c=ctx()){
   if(!c?.userId||!c?.householdId||!c?.client)throw Error('Sign in to your connected family account.');
   const g=generation;const r=await c.client.rpc('app9012_keepsakes',{p_action:action,p_payload:{...payload,household_id:c.householdId,...(action.startsWith('letter_')?{token}: {})}});
   if(!alive(c,g))throw Error('Account changed.');if(r.error)throw r.error;if(r.data?.error)throw Error(r.data.error);return r.data;
  }
  function dispose(){for(const url of urls)root.URL.revokeObjectURL(url);urls=[];}
  function close(force=false){
   if(!dialog)return;if(busy&&!force)return;
   if(!force&&dialogClose&&dialogClose()===false)return;
   dialog.querySelectorAll('video,audio').forEach(p=>{p.pause();p.removeAttribute('src');p.load();});
   if(dialog.open)dialog.close();dialog.remove();dialog=null;dialogClose=null;dialogKey='';dispose();
   if(dialogTrigger?.isConnected)dialogTrigger.focus();dialogTrigger=null;
  }
  function suspend(){
   if(!dialog||!dialog.open||busy)return;
   dialog.querySelectorAll('video,audio').forEach(p=>p.pause());
   dialog.close();dialog.dataset.ksSuspended='true';
   if(dialogTrigger?.isConnected)dialogTrigger.focus();
  }
  function resume(key){
   if(!dialog||dialog.open||dialog.dataset.ksSuspended!=='true'||dialogKey!==key)return false;
   delete dialog.dataset.ksSuspended;dialog.showModal();
   const focus=dialog._ksFocus;if(focus?.isConnected)focus.focus();else dialog.querySelector('textarea,input,select,button')?.focus();
   return true;
  }
  function modal(title,cls='',key=title){
   close(true);const d=node('dialog',undefined,'ks-dialog '+cls);d.setAttribute('aria-label',title);
   const head=node('div',undefined,'ks-dialog-head'),exit=btn('Close',()=>close());head.append(heading(title),exit);
   const body=node('div',undefined,'ks-dialog-body'),status=node('p','','ks-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
   d.append(head,body,status);doc.body.append(d);dialogTrigger=doc.activeElement;dialog=d;dialogKey=key;
   d.addEventListener('focusin',e=>{if(e.target!==d)d._ksFocus=e.target;});
   d.addEventListener('cancel',e=>{e.preventDefault();suspend();});
   d.addEventListener('click',e=>{if(e.target!==d)return;const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)suspend();});
   d.showModal();exit.focus();return {d,body,status,exit};
  }
  function field(label,tag='input',value=''){
   const wrap=node('label',undefined,'ks-field'),input=node(tag);input.value=value;wrap.append(node('span',label),input);return {wrap,input};
  }
  function visibility(value='private'){
   const f=field('Who may see this?','select');for(const [val,text] of [['private','Only me'],['family','My connected family']]){const opt=node('option',text);opt.value=val;f.input.append(opt);}f.input.value=value;return f;
  }
  function sourceInfo(kind,id){return bridge.source(kind,id);}
  async function fromWriter(kind){
   if(busy)return;
   if(!bridge.isOwnShelf()){bridge.message('Open your own Shelf to add attachments.');return;}
   if(!bridge.hasDraft(kind)){bridge.message('Write your Waymark or course first, then choose Add pictures, videos or files.');return;}
   if(!root.confirm('Save this '+(kind==='waymark'?'Waymark':'course')+' first, then choose its attachments?'))return;
   try{busy=true;const id=await bridge.saveDraft(kind);if(!id)throw Error('Save not confirmed');busy=false;await attachments(kind,id,true);}
   catch(e){busy=false;bridge.message('Your memory may already be saved on this device. Open it in '+(kind==='waymark'?'Waymarks':'Captain’s Chart')+' and choose Attachments to retry after reconnecting.');}
  }
  async function attachments(kind,id,canWrite){
   const source=sourceInfo(kind,id);if(!source)return;
   const key='attachments:'+kind+':'+id;if(resume(key))return;
   const m=modal('Pictures, videos & files','',key),c=ctx(),g=generation;let drafts=[],vis='private',working=false;
   m.body.append(note(source.title||'Saved memory'),note('Photos: 12 MB · Videos: 45 MB · Documents: 20 MB. Original files are not resized. HEIC/HEIF and MOV may need downloading to open on another device.'));
   const audience=visibility(),picker=node('input'),camera=node('input');picker.type=camera.type='file';picker.multiple=true;picker.accept=Object.keys(EXT).map(x=>'.'+x).join(',');camera.accept='image/*';camera.setAttribute('capture','environment');picker.hidden=camera.hidden=true;
   const selected=node('div'),list=node('div',undefined,'ks-list');
   const choose=btn('Choose pictures, videos or files',()=>picker.click()),take=btn('Take a picture',()=>camera.click());
   const upload=btn('Upload selected files',submit),clear=btn('Clear selection',()=>{drafts=[];picker.value=camera.value='';selected.replaceChildren();update();});
   const actions=node('div',undefined,'ks-actions');actions.append(choose,take,upload,clear);
   if(canWrite)m.body.append(audience.wrap,note('Family access never opens a private source entry. Files are shared only with family who can already see this Waymark or course.'),picker,camera,actions,selected);
   m.body.append(list);
   function update(){choose.disabled=take.disabled=audience.input.disabled=working||drafts.length>0;upload.disabled=working||!drafts.length;clear.disabled=working;}
   function picked(files){if(working)return;try{if(files.length>20)throw Error('Choose at most 20 files.');drafts=Array.from(files,f=>{validateFile(f);return {id:uuid(),file:f};});vis=audience.input.value;selected.replaceChildren(...drafts.map(f=>note(f.file.name)));m.status.textContent='Selected on your device. Nothing uploads until you press Upload.';}catch(e){drafts=[];m.status.textContent=e.message;}update();}
   picker.addEventListener('change',()=>picked(picker.files));camera.addEventListener('change',()=>picked(camera.files));
   async function load(){
    try{const rows=await rpc('file_list',{source_kind:kind,source_id:id},c);if(dialog!==m.d)return;list.replaceChildren();
     if(!rows.length)list.append(note('No attachments yet.'));
     for(const r of rows){const card=node('article',undefined,'ks-card');card.append(node('strong',r.filename),note((r.visibility==='private'?'Only you':'Family with entry access')+' · '+(r.bytes/1024/1024).toFixed(1)+' MB'));
      card.append(btn('Open / download',()=>openFile(r,card,m,c)));
      if(r.owner_id===c.userId)card.append(btn('Remove attachment',async()=>{if(!root.confirm('Hide this attachment? Its stored original will not be deleted.'))return;try{await rpc('file_hide',{id:r.id},c);await load();}catch(e){m.status.textContent=errorText(e);}}));list.append(card);}
    }catch(e){if(dialog===m.d)m.status.textContent=errorText(e);}
   }
   async function submit(){
    if(working||!drafts.length)return;working=busy=true;update();m.status.textContent='Saving the source and uploading privately…';
    try{await bridge.syncSource(kind,id);for(const d of [...drafts]){await uploadFile({draft:d,kind,sourceId:id,visibility:vis,snapshot:c,context:ctx,cancelled:()=>generation!==g||dialog!==m.d});drafts=drafts.filter(x=>x!==d);}
     if(dialog!==m.d)return;selected.replaceChildren();m.status.textContent='Attachments saved. Keep your originals as a separate backup.';await load();
    }catch(e){if(dialog===m.d){selected.replaceChildren(...drafts.map(f=>note(f.file.name)));m.status.textContent=errorText(e)+' Your remaining selection is still here for retry.';}}
    finally{working=false;if(alive(c,g))busy=false;update();}
   }
   update();await load();
  }
  async function openFile(r,card,m,c){
   const expected=c.householdId+'/'+r.owner_id+'/'+r.id;if(r.path!==expected){m.status.textContent='Unexpected file location.';return;}
   try{const response=await c.client.storage.from(BUCKET).download(expected);if(dialog!==m.d||!sameAccount(c,ctx()))return;if(response.error)throw response.error;
    const url=root.URL.createObjectURL(response.data);urls.push(url);const a=node('a','Download '+r.filename,'ks-download');a.href=url;a.download=r.filename;card.append(a);
    if(['image/jpeg','image/png','image/webp','image/gif'].includes(r.mime)){const image=node('img');image.alt=r.filename;image.src=url;card.append(image);}
    else if(r.mime.startsWith('video/')){const video=node('video');video.src=url;video.controls=true;video.playsInline=true;video.preload='metadata';card.append(video);}
    m.status.textContent='Opened securely. Use Download to keep the original.';
   }catch(e){if(dialog===m.d)m.status.textContent=errorText(e);}
  }
  function nuggetEditor(sourceId='',existing=null){
   if(sourceId&&!bridge.isOwnShelf()){bridge.message('Create Golden Nuggets from your own Waymarks.');return;}
   const key='nugget:'+(existing?.id||sourceId||'new');if(resume(key))return;
   const source=sourceId?sourceInfo('waymark',sourceId):null;
   const m=modal(existing?'Edit Golden Nugget':'Save a Golden Nugget','',key),body=field('Truth Worth Keeping','textarea',existing?.body||''),audience=visibility(existing?.visibility),id=existing?.id||uuid();body.input.maxLength=2000;body.input.rows=5;
   m.body.append(note('Keep the short truth you learned. This does not replace the original Waymark.'),body.wrap,audience.wrap);
   if(source){const details=node('details');details.append(node('summary','Read the source Waymark'),node('p',source.body||source.title||'','ks-source'));m.body.append(details,note('Linked to: '+(source.title||'Waymark')));}
   const save=btn('Save Golden Nugget',async()=>{if(!body.input.value.trim()){m.status.textContent='Write the truth you want to keep.';body.input.focus();return;}
    save.disabled=true;busy=true;try{if(sourceId)await bridge.syncSource('waymark',sourceId);await rpc('nugget_save',{id,body:body.input.value.trim(),source_id:sourceId||existing?.source_id||null,visibility:audience.input.value});busy=false;close(true);openNuggets();}
    catch(e){m.status.textContent=errorText(e);}finally{busy=false;save.disabled=false;}});m.body.append(save);body.input.focus();
  }
  let nuggetsRequest=0;
  async function openNuggets(){
   if(bridge.openWisdom()===false)return;doc.querySelectorAll('#viewWisdom .wisdomsection').forEach(n=>n.classList.toggle('active',n.id==='ksNuggetsSection'));
   doc.querySelectorAll('#viewWisdom .wisdomnav button').forEach(n=>n.classList.toggle('active',n.id==='ksNuggetsTab'));
   const box=doc.getElementById('ksNuggetsList');box.replaceChildren(note('Loading Golden Nuggets…'));const request=++nuggetsRequest;let offset=0;
   const more=btn('Load older Golden Nuggets',load);async function load(){more.disabled=true;try{const rows=await rpc('nugget_list',{offset});if(request!==nuggetsRequest)return;if(offset===0)box.replaceChildren();more.remove();
    if(!rows.length&&offset===0)box.append(note('No Golden Nuggets yet. Add a truth here, or save one from a Waymark.'));
    for(const n of rows){const card=node('article',undefined,'ks-card');card.append(node('p',n.body,'ks-nugget-body'),note(new Date(n.created_at).toLocaleDateString()+' · '+(n.visibility==='private'?'Only you':'Family')));
     if(n.source_id)card.append(btn('View source Waymark',()=>bridge.openSource('waymark',n.source_id,n.person_id)));
     if(n.owner_id===ctx()?.userId){card.append(btn('Edit',()=>nuggetEditor('',n)),btn('Archive',async()=>{if(!root.confirm('Archive this Golden Nugget? The Waymark stays unchanged.'))return;try{await rpc('nugget_archive',{id:n.id});openNuggets();}catch(e){bridge.message(errorText(e));}}));}box.append(card);}
    offset+=rows.length;if(rows.length===50)box.append(more);
   }catch(e){if(request===nuggetsRequest)box.replaceChildren(note(errorText(e)));}finally{more.disabled=false;}}
   await load();
  }
  async function unlock(next){
   if(resume('letter-unlock'))return;
   try{const r=await rpc('letter_lock_status');if(!r.locked||(token&&Date.now()<tokenDeadline)){await next();return;}
    const m=modal('Unlock your letters','','letter-unlock'),pass=field('Letters passcode');pass.input.type='password';pass.input.autocomplete='off';pass.input.maxLength=64;m.body.append(pass.wrap,note('This protects the letters area on a shared device. It is not end-to-end encryption.'));
    const go=btn('Unlock',async()=>{go.disabled=true;try{const r=await rpc('letter_unlock',{pin:pass.input.value});token=r.token;tokenDeadline=Date.now()+9*60*1000;pass.input.value='';close(true);await next();}catch(e){m.status.textContent=String(e.message||'Passcode not accepted.');}finally{go.disabled=false;}});m.body.append(go);pass.input.focus();
   }catch(e){bridge.message(errorText(e));}
  }
  function envelope(label,action,cls=''){const b=btn('',action,'ks-envelope '+cls);b.setAttribute('aria-label',label);const crop=node('span',undefined,'ks-envelope-crop'),image=node('img');image.src='assets/images/shared/ui/keepsake-letter-envelope-app.jpg';image.alt='';crop.append(image);b.append(crop);return b;}
  const floating=envelope('Open unread letters',()=>unlock(()=>letters()),'ks-floating');floating.hidden=true;const badge=node('span','','ks-count');floating.append(badge);doc.body.append(floating);
  function applyHand(input,hand){input.style.fontFamily='"'+(HANDS[hand]||HANDS.caveat)+'", cursive';}
  function compose(){return unlock(()=>composeNow());}
  function composeNow(){
   if(resume('letter-compose'))return;
   const m=modal('Write a private letter','ks-letter-dialog','letter-compose');letterDraft=letterDraft||{id:uuid(),body:'',hand:bridge.hand() in HANDS?bridge.hand():'caveat',recipient:null};
   const style=field('Choose your writing style','select');style.wrap.classList.add('ks-letter-style');for(const [value,label] of Object.entries(HANDS)){const opt=node('option',label);opt.value=value;style.input.append(opt);}style.input.value=letterDraft.hand;
   const paper=node('div',undefined,'ks-paper'),text=field('Your letter','textarea',letterDraft.body);text.input.maxLength=20000;text.input.rows=12;applyHand(text.input,letterDraft.hand);paper.append(text.wrap);
   text.input.addEventListener('input',()=>{letterDraft.body=text.input.value;});style.input.addEventListener('change',()=>{letterDraft.hand=style.input.value;applyHand(text.input,style.input.value);});
   const recipients=node('div',undefined,'ks-recipients');
   const next=btn('Send — choose a family member',async()=>{
    if(!text.input.value.trim()){m.status.textContent='Write your letter first.';text.input.focus();return;}
    next.disabled=true;try{const rows=await rpc('letter_recipients');if(dialog!==m.d)return;recipients.replaceChildren(heading('Who is this letter for?'),note('Only family members with their own connected accounts appear.'));
     if(!rows.length)recipients.append(note('No connected recipients yet. Your letter has not been sent.'));
     for(const r of rows)recipients.append(btn(r.name,()=>send(r)));recipients.scrollIntoView({block:'nearest'});
    }catch(e){m.status.textContent=errorText(e);}finally{next.disabled=false;}
   });
   async function send(recipient){
    if(busy||!root.confirm('Send this private letter to '+recipient.name+'?'))return;
    // Freeze ambiguous retries to the same recipient/body/id. A different request needs a new letter.
    if(letterDraft.recipient&&letterDraft.recipient!==recipient.user_id){m.status.textContent='The previous send is unconfirmed. Retry that recipient, or check Sent letters before starting another letter.';return;}
    letterDraft.recipient=recipient.user_id;const request={id:letterDraft.id,body:letterDraft.body.trim(),hand:letterDraft.hand,recipient_id:recipient.user_id};
    text.input.disabled=style.input.disabled=next.disabled=true;recipients.querySelectorAll('button').forEach(b=>b.disabled=true);busy=true;
    try{await rpc('letter_send',request);letterDraft=null;busy=false;close(true);bridge.message('Letter sent to '+recipient.name+'. You can recall it from Letters → Sent until they open it.');await poll();}
    catch(e){m.status.textContent=errorText(e)+' Retry the same recipient to confirm delivery. Your letter is still here.';}
    finally{busy=false;recipients.querySelectorAll('button').forEach(b=>b.disabled=false);}
   }
   const remove=btn('Delete message',()=>{if(!root.confirm('Delete this unsent message? This is the only action that erases the draft.'))return;letterDraft=null;text.input.value='';recipients.replaceChildren();close(true);bridge.message('The unsent message was deleted.');},'ghost ks-delete-message');
   const controls=node('div',undefined,'ks-letter-controls');controls.append(next,remove);
   m.body.append(note('Private between you and the recipient. Click outside this letter to return to your Shelf; open Write a letter again and every word will still be here. Recall is available only until they open it.'),style.wrap,paper,controls,recipients);
   dialogClose=()=>{letterDraft.body=text.input.value;return true;};text.input.focus();
  }
  async function letters(){
   if(resume('letter-list'))return;
   const m=modal('Your letters','','letter-list'),tools=node('div',undefined,'ks-actions'),box=node('div',undefined,'ks-list');let offset=0,rows=[],sent=false;
   const received=btn('Received',()=>{sent=false;draw();}),sentButton=btn('Sent',()=>{sent=true;draw();});
   const more=btn('Load older letters',load);tools.append(received,sentButton,btn('Write a letter',compose),btn('Passcode settings',()=>pinSettings()),btn('Lock letters',async()=>{try{await rpc('letter_lock');}catch(e){}token='';tokenDeadline=0;close(true);}));
   m.body.append(tools,note('Unopened letters appear first. Opened letters are kept here by sender and date—even if you leave without pressing Close.'),box,more);
   function draw(){box.replaceChildren();const mine=rows.filter(r=>sent?r.sender_id===ctx().userId:r.recipient_id===ctx().userId);if(!mine.length)box.append(note(sent?'No sent letters in this page.':'No received letters in this page.'));
    const groups=new Map();for(const r of mine){const key=sent?'To '+r.recipient_name:!r.opened_at?'Unopened letters':'From '+r.sender_name;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
    const ordered=[...groups].sort(([a],[b])=>a==='Unopened letters'?-1:b==='Unopened letters'?1:a.localeCompare(b));
    for(const [name,items] of ordered){const section=node('section');section.append(node('h3',name));for(const r of items){const card=node('article',undefined,'ks-card');card.append(node('strong',sent?'To '+r.recipient_name:'From '+r.sender_name),note(new Date(r.created_at).toLocaleString()+' · '+(r.recalled_at?'Recalled':r.opened_at?'Opened':'Unopened')));
      if(!r.recalled_at)card.append(btn('Open letter',()=>readLetter(r)));
      if(sent&&!r.opened_at&&!r.recalled_at)card.append(btn('Recall letter',async()=>{if(!root.confirm('Recall this unopened letter from '+r.recipient_name+'?'))return;try{await rpc('letter_recall',{id:r.id});await letters();}catch(e){m.status.textContent=errorText(e);}}));section.append(card);}box.append(section);}
   }
   async function load(){more.disabled=true;try{const page=await rpc('letter_list',{offset});if(dialog!==m.d)return;rows=[...new Map(rows.concat(page).map(r=>[r.id,r])).values()];offset+=page.length;more.hidden=page.length<50;draw();}catch(e){m.status.textContent=errorText(e);}finally{more.disabled=false;}}
   await load();
  }
  async function readLetter(row){
   const key='letter-read:'+row.id;if(resume(key))return;
   const m=modal('Opening letter…','ks-letter-dialog',key);m.status.textContent='Opening securely…';
   try{const letter=await rpc('letter_open',{id:row.id});if(dialog!==m.d)return;
    m.d.querySelector('h2').textContent='From '+letter.sender_name;m.status.textContent='';
    const paper=node('div',undefined,'ks-paper'),text=node('div',letter.body,'ks-letter-text');applyHand(text,letter.hand);paper.append(note(new Date(letter.created_at).toLocaleString()),text);m.body.append(paper);
    m.exit.textContent='Close & return to letters';
    dialogClose=()=>{dialogClose=null;const c=ctx();if(row.recipient_id===c.userId)rpc('letter_close',{id:row.id},c).catch(()=>{});close(true);unlock(()=>letters());return false;};await poll();
   }catch(e){if(dialog===m.d)m.status.textContent=String(e.message||'').includes('letter_recalled')?'The sender recalled this letter before it opened.':errorText(e);}
  }
  function pinSettings(){
   if(resume('letter-passcode'))return;
   const m=modal('Letters passcode','','letter-passcode'),pass=field('New passcode (6–64 characters)'),confirm=field('Repeat new passcode');pass.input.type=confirm.input.type='password';pass.input.maxLength=confirm.input.maxLength=64;pass.input.autocomplete=confirm.input.autocomplete='new-password';
   m.body.append(note('Optional, server-checked protection for your letters. Remember it: there is no automatic passcode reset in this pilot. This is not end-to-end encryption; the service administrator can access server data.'),pass.wrap,confirm.wrap);
   async function save(value){try{await rpc('letter_set_pin',{pin:value});token='';tokenDeadline=0;close(true);bridge.message(value?'Letters passcode saved.':'Letters passcode removed.');}catch(e){m.status.textContent=errorText(e);}}
   m.body.append(btn('Save passcode',()=>{if(pass.input.value.length<6||pass.input.value!==confirm.input.value){m.status.textContent='Use at least 6 characters and repeat the same passcode.';return;}save(pass.input.value);}),btn('Remove passcode',()=>{if(root.confirm('Remove your optional letters passcode? Account privacy remains enforced.'))save('');}));
  }
  async function poll(){
   if(polling||doc.hidden||!ctx()?.userId||!bridge.entered())return;polling=true;
   try{const r=await rpc('letter_count');const count=Number(r.count)||0;badge.textContent=String(count);floating.setAttribute('aria-label','Open '+count+' unread '+(count===1?'letter':'letters'));floating.hidden=count===0||!bridge.entered();}
   catch(e){floating.hidden=true;}finally{polling=false;}
  }
  function sync(){
   const c=ctx();if(c?.userId!==last?.userId||c?.householdId!==last?.householdId||c?.client!==last?.client){generation++;last=c;token='';tokenDeadline=0;letterDraft=null;busy=false;floating.hidden=true;close(true);nuggetsRequest++;doc.getElementById('ksNuggetsList')?.replaceChildren();poll();}
   if(!bridge.entered())floating.hidden=true;
   for(const [kind,id] of [['waymark','waymarkWriter9012'],['chart','guidedChartWriter']]){const b=doc.querySelector('#'+id+' .attachbtn');if(b&&!b.dataset.ks){b.dataset.ks='1';b.textContent='+ Add pictures, videos or files';b.removeAttribute('onclick');b.addEventListener('click',()=>fromWriter(kind));}}
   for(const entry of doc.querySelectorAll('.wm[id^="wm_"],.wm[id^="g_"]')){if(entry.dataset.ks)continue;const kind=entry.id.startsWith('wm_')?'waymark':'chart',id=entry.id.slice(kind==='waymark'?3:2);const actions=entry.querySelector('.eacts');if(!actions)continue;entry.dataset.ks='1';const own=bridge.isOwnShelf();actions.append(btn('Attachments',()=>attachments(kind,id,own),'mini'));
    if(kind==='waymark'&&own)actions.append(btn('◆ Save as Golden Nugget',()=>nuggetEditor(id),'mini ks-nugget-action'));}
  }
  function install(){
   const nav=doc.querySelector('#viewWisdom .wisdomnav');if(nav){const tab=btn('◆ Golden Nuggets',openNuggets);tab.id='ksNuggetsTab';nav.prepend(tab);
    nav.addEventListener('click',e=>{if(e.target.closest('button')!==tab){doc.getElementById('ksNuggetsSection').classList.remove('active');tab.classList.remove('active');}});
    const section=node('section',undefined,'wisdomsection');section.id='ksNuggetsSection';const list=node('div',undefined,'ks-list');list.id='ksNuggetsList';section.append(note('Truth Worth Keeping — a sentence, quotation, or insight drawn from life. Keep it private or choose to share it with family.'),btn('+ Add a Golden Nugget',()=>nuggetEditor()),list);nav.after(section);
   }
   const door=doc.querySelector('#doorsModal [onclick="goDoorWisdom(\'lessons\')"]');if(door){const b=btn('',()=>{bridge.closeDoors();openNuggets();},'door');b.append(node('span','◆ Golden Nuggets','doorname'),node('span','Truth Worth Keeping','doortagline'));door.before(b);}
   const shelf=doc.getElementById('shelfMessageBox');if(shelf){shelf.replaceChildren(heading('Letters worth keeping'),envelope('Write a private letter',compose),note('A private word of encouragement, written in your own style.'),btn('Write a letter',compose),btn('My letters',()=>unlock(()=>letters())));}
   for(const b of doc.querySelectorAll('[onclick="openFamilyMessageModalForShelf()"]')){b.removeAttribute('onclick');b.textContent='Write a private letter';b.addEventListener('click',compose);}
   const planned=doc.querySelector('[data-guide-name="Golden Nuggets"] .guideplanned');if(planned){planned.className='guidehelp';planned.textContent='Open Wisdom → Golden Nuggets, or choose “Save as Golden Nugget” on a Waymark. Private by default; share only when you choose.';}
   const intro=doc.querySelector('[data-guide-name="Golden Nuggets"]')?.closest('.guidegroup')?.querySelector('.guidegroupintro');if(intro)intro.textContent='Wisdom gathers short truths, fuller Life Lessons, and Family Rules: what you learned, why it matters, and how you will live.';
   const flow=doc.querySelectorAll('#appGuideFlow em');for(const e of flow)if(e.parentElement.textContent.startsWith('Golden Nuggets'))e.remove();
   const list=doc.getElementById('fsMessages');if(list)list.before(note('Older Family Shelf messages remain here under their original sharing rules. New private letters are only in each account’s Letters area.'));
   root.app9012Keepsakes={openNuggets,compose,letters:()=>unlock(()=>letters()),attachments,fromWriter,refresh:sync};sync();
   new root.MutationObserver(sync).observe(doc.querySelector('.wrap')||doc.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden']});
   root.setInterval(()=>{if(token&&Date.now()>=tokenDeadline){token='';tokenDeadline=0;close(true);}sync();poll();},15000);
   doc.addEventListener('visibilitychange',()=>{if(doc.hidden){token='';tokenDeadline=0;close(true);}else{sync();poll();}});
  }
  install();
 }
 return {mount,validateFile,sameAccount,uploadFile,HANDS,TYPES};
}));
