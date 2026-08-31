/* Family-only media pilot. Files remain local until the explicit Share action. */
(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else api.mount(root);
}(typeof window==='object'?window:null,function(){
  'use strict';
  const BUCKET='9012-family-media-test';
  const TYPES={
    'image/jpeg':['photo','jpg'],'image/png':['photo','png'],'image/webp':['photo','webp'],'image/gif':['photo','gif'],
    'video/mp4':['video','mp4'],'video/webm':['video','webm'],'video/quicktime':['video','mov'],
    'audio/mp4':['voice','m4a'],'audio/x-m4a':['voice','m4a'],'audio/mpeg':['voice','mp3'],'audio/webm':['voice','webm'],
    'audio/ogg':['voice','ogg'],'audio/wav':['voice','wav'],'audio/x-wav':['voice','wav'],'audio/aac':['voice','aac']
  };
  const LIMITS={photo:12*1024*1024,video:45*1024*1024,voice:20*1024*1024};
  function validateFile(file){
    const mime=String(file&&file.type||'').toLowerCase().split(';')[0].trim();const info=TYPES[mime];
    if(!info)throw Error('Choose a JPG, PNG, WebP or GIF photo, an MP4/WebM/MOV video, or a supported audio file. For HEIC photos, export a JPG first.');
    if(!Number.isSafeInteger(file.size)||file.size<=0)throw Error('This file is empty or unreadable. Choose another file.');
    if(file.size>LIMITS[info[0]])throw Error('For family testing, '+info[0]+' files must be '+LIMITS[info[0]]/1024/1024+' MB or smaller.');
    return {kind:info[0],mime,extension:info[1]};
  }
  function sameAccount(a,b){return !!(a&&b&&a.userId&&a.householdId&&a.userId===b.userId&&a.householdId===b.householdId&&a.client===b.client);}
  function createRecorder(options){
    let active=null;const later=options.setTimeout||setTimeout,clear=options.clearTimeout||clearTimeout;
    function tracks(stream){if(stream)for(const track of stream.getTracks())try{track.stop();}catch(e){}}
    function retire(s){if(active!==s)return;active=null;clear(s.limit);clear(s.watch);tracks(s.stream);if(s.rec)s.rec.ondataavailable=s.rec.onstop=s.rec.onerror=null;}
    function cancel(){const s=active;if(!s)return;retire(s);try{if(s.rec&&s.rec.state!=='inactive')s.rec.stop();}catch(e){}options.onState('idle','Recording discarded. Nothing was shared.');}
    function stop(){const s=active;if(!s)return;if(!s.rec){cancel();return;}if(s.phase==='stopping')return;s.phase='stopping';options.onState('stopping','Finishing your recording…');
      s.watch=later(()=>{if(active===s){retire(s);options.onState('idle','The recording could not finish. Please try again.');}},5000);
      try{s.rec.stop();}catch(e){retire(s);options.onState('idle','The recording could not finish. Please try again.');}
      tracks(s.stream);
    }
    async function start(){
      if(active)return false;
      if(!options.Recorder||!options.getUserMedia){options.onState('idle','Recording is unavailable here. You can choose an existing voice recording instead.');return false;}
      const s={phase:'requesting',parts:[],size:0};active=s;options.onState('requesting','Allow microphone access, then wait for “Recording”.');
      try{
        const stream=await options.getUserMedia({audio:true,video:false});
        if(active!==s){tracks(stream);return false;}s.stream=stream;
        const mime=['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'].find(t=>options.Recorder.isTypeSupported&&options.Recorder.isTypeSupported(t));
        s.rec=mime?new options.Recorder(stream,{mimeType:mime}):new options.Recorder(stream);
        s.rec.ondataavailable=e=>{if(active!==s||!e.data||!e.data.size)return;s.parts.push(e.data);s.size+=e.data.size;if(s.size>LIMITS.voice){retire(s);try{s.rec.stop();}catch(e){}options.onState('idle','This recording reached the test size limit. Please record a shorter message.');}};
        s.rec.onerror=()=>{if(active!==s)return;retire(s);try{s.rec.stop();}catch(e){}options.onState('idle','Recording was interrupted. Please try again.');};
        s.rec.onstop=()=>{if(active!==s)return;const type=s.rec.mimeType||mime||s.parts[0]?.type||'';const blob=new (options.Blob||Blob)(s.parts,{type});retire(s);
          try{validateFile(blob);options.onState('idle','Listen to your recording before sharing.');options.onReady(blob);}catch(e){options.onState('idle',e.message);}
        };
        s.rec.start(1000);s.phase='recording';options.onState('recording','Recording — stop when you are finished. Three-minute test limit.');
        s.limit=later(stop,180000);return true;
      }catch(e){if(active!==s)return false;retire(s);options.onState('idle',e&&e.name==='NotAllowedError'?'Microphone permission was denied. Allow it in browser settings, or choose an existing recording.':'The microphone could not start. Try again or choose an existing recording.');return false;}
    }
    return {start,stop,cancel,busy:()=>!!active};
  }
  // Each network step checks the captured account; a late upload cannot publish for another user.
  async function shareDraft(options){
    const {draft,snapshot:context}=options;const info=validateFile(draft.file);
    const check=()=>{if(!sameAccount(context,options.context())||options.cancelled())throw Error('The account or screen changed. Nothing further will be shared from this screen.');};
    check();if(!options.consent)throw Error('Confirm that you want to share this with your connected family.');
    const call=async(name,args)=>{check();const r=await context.client.rpc(name,args);check();if(r.error)throw r.error;return r.data;};
    const row=await call('app9012_media_begin',{p_household_id:context.householdId,p_id:draft.id,p_kind:info.kind,p_mime:info.mime,p_bytes:draft.file.size,p_filename:(draft.file.name||'Voice recording.'+info.extension).slice(0,180),p_caption:options.caption,p_transcript:options.transcript});
    const expected=context.householdId+'/'+context.userId+'/'+draft.id;
    if(!row||row.storage_path!==expected)throw Error('The server did not confirm a safe upload location.');
    if(row.state==='shared')return {shared:true,id:draft.id};
    if(row.state!=='pending')throw Error('This upload can no longer be shared.');
    if(!draft.uploaded){
      check();options.status('Uploading privately… Keep this page open.');
      const r=await context.client.storage.from(BUCKET).upload(expected,draft.file,{contentType:info.mime,upsert:false,cacheControl:'0'});
      check();
      // A previous request can succeed while its response is lost. Let the server verify that object.
      if(r.error&&!['409','Duplicate'].includes(String(r.error.statusCode||r.error.code)))throw r.error;
      draft.uploaded=true;
    }
    options.status('Confirming your family share…');
    const result=await call('app9012_media_finish',{p_household_id:context.householdId,p_id:draft.id});
    if(!result||result.shared!==true)throw Error('The family share was not confirmed. Please retry.');
    return result;
  }

  function mount(root){
    if(!root||!root.document)return;const doc=root.document,host=doc.getElementById('familyMediaRoot');if(!host)return;
    const view=doc.getElementById('viewFamilyPhotos');
    const context=()=>typeof root.app9012FamilyMediaContext==='function'?root.app9012FamilyMediaContext():null;
    let epoch=0,enabled=false,active=false,loading=false,draft=null,draftURL=null,busy=false,recordPhase='idle',mediaURL=null,sessionKey='',lastContext=null,rows=[],filter='all',nextPage=0;
    const node=(tag,cls,text)=>{const n=doc.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
    const button=(text,action,cls='ghost')=>{const n=node('button',cls,text);n.type='button';n.addEventListener('click',action);return n;};
    const header=node('div','fm-heading');header.append(node('h2','','Pictures, videos & voices'),node('span','fm-badge','Family test'));
    const intro=node('p','fm-intro','A familiar face. A moment in motion. A voice worth keeping. Shared only with your connected family.');
    const status=node('p','fm-status','Checking family access…');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const tools=node('div','fm-tools');
    const fileInput=node('input');fileInput.type='file';fileInput.accept=Object.keys(TYPES).join(',');fileInput.hidden=true;fileInput.id='familyMediaFile';
    const choose=button('Choose photo, video or audio',()=>fileInput.click());
    const record=button('Record my voice',()=>{if(!enabled||busy||draft)return;if(root.app9012FamilyMediaStopSpeech)root.app9012FamilyMediaStopSpeech();recorder.start();});
    const stop=button('Stop recording',()=>recorder.stop(),'fm-stop');stop.hidden=true;
    const cancelRecording=button('Cancel recording',()=>recorder.cancel());cancelRecording.hidden=true;
    tools.append(choose,record,stop,cancelRecording,fileInput);
    const hint=node('p','fm-hint','Photos up to 12 MB · Videos up to 45 MB · Audio up to 20 MB. Record up to 3 minutes. Photos are not resized. MOV playback depends on your phone; MP4 is best for sharing across devices.');
    const retention=node('p','fm-hint','Test files are stored separately from your keepsake backup. Keep your originals. Removing a memory hides it from the family; the project owner must delete stored originals from Supabase to permanently erase them.');
    const editor=node('section','fm-editor');editor.hidden=true;
    const preview=node('div','fm-preview');
    const captionLabel=node('label','','Caption (optional)');const caption=node('textarea');caption.id='familyMediaCaption';caption.maxLength=1000;caption.rows=2;captionLabel.htmlFor=caption.id;
    const transcriptLabel=node('label','','Written transcript (optional — type or paste)');const transcript=node('textarea');transcript.id='familyMediaTranscript';transcript.maxLength=12000;transcript.rows=4;transcriptLabel.htmlFor=transcript.id;
    const consentLabel=node('label','fm-consent');const consent=node('input');consent.type='checkbox';consent.id='familyMediaConsent';consentLabel.append(consent,doc.createTextNode(' Share this file and its text with my connected family.'));
    const editorActions=node('div','fm-tools');const share=button('Share with my family',submit,'fm-share');const discard=button('Discard draft',clearDraft);editorActions.append(share,discard);
    editor.append(node('h3','','Preview before sharing'),preview,captionLabel,caption,transcriptLabel,transcript,consentLabel,editorActions,node('p','fm-hint','Nothing uploads until you press Share. Leaving this album clears an unshared draft from this screen. Only share files you want your connected family to keep.'));
    const filterRow=node('div','fm-tools');const filterLabel=node('label','','Show');const select=node('select');select.id='familyMediaFilter';filterLabel.htmlFor=select.id;
    for(const [value,label] of [['all','All memories'],['photo','Pictures'],['video','Videos'],['voice','Voices']]){const o=node('option','',label);o.value=value;select.append(o);}
    select.addEventListener('change',()=>{filter=select.value;drawRows();});
    const refresh=button('Refresh family memories',()=>load(true));filterRow.append(filterLabel,select,refresh);
    const gallery=node('div','fm-grid');const more=button('Load older memories',()=>load(false));more.hidden=true;
    host.append(header,intro,status,tools,hint,editor,filterRow,gallery,more,retention);
    const viewer=node('dialog','fm-viewer');viewer.setAttribute('aria-labelledby','familyMediaViewerTitle');
    const viewerHead=node('div','fm-viewerhead');const viewerTitle=node('h2','','Family memory');viewerTitle.id='familyMediaViewerTitle';
    const viewerClose=button('Close',closeViewer);viewerClose.setAttribute('aria-label','Close family memory');viewerHead.append(viewerTitle,viewerClose);
    const viewerBody=node('div','fm-viewerbody');viewer.append(viewerHead,viewerBody);doc.body.append(viewer);
    viewer.addEventListener('cancel',e=>{e.preventDefault();closeViewer();});
    viewer.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closeViewer();}});
    let viewerTrigger=null,viewerRequest=0;
    const setStatus=text=>{status.textContent=text;};
    function update(){
      choose.disabled=!enabled||busy||!!draft||recordPhase!=='idle';record.disabled=choose.disabled;
      stop.hidden=!['recording','stopping'].includes(recordPhase);stop.disabled=recordPhase==='stopping';
      cancelRecording.hidden=recordPhase==='idle';
      share.disabled=!enabled||busy||!draft||!consent.checked||recordPhase!=='idle';
      discard.disabled=busy;caption.disabled=transcript.disabled=consent.disabled=busy;
      refresh.disabled=!enabled||busy||loading;more.disabled=refresh.disabled;
    }
    const recorder=createRecorder({Recorder:root.MediaRecorder,Blob:root.Blob,getUserMedia:root.isSecureContext&&root.navigator.mediaDevices?.getUserMedia?opts=>root.navigator.mediaDevices.getUserMedia(opts):null,
      onState(phase,message){recordPhase=phase;setStatus(message);update();},onReady(blob){setDraft(blob);}});
    function revokeDraft(){if(draftURL){root.URL.revokeObjectURL(draftURL);draftURL=null;}preview.querySelectorAll('audio,video').forEach(p=>{p.pause();p.removeAttribute('src');p.load();});preview.replaceChildren();}
    function clearDraft(){if(busy)return;revokeDraft();draft=null;fileInput.value='';caption.value=transcript.value='';consent.checked=false;editor.hidden=true;update();}
    function player(file,url,label){
      const info=validateFile(file);const p=node(info.kind==='photo'?'img':info.kind==='video'?'video':'audio');
      if(info.kind==='photo')p.alt=label||'Family picture';else{p.controls=true;p.preload='metadata';if(info.kind==='video')p.playsInline=true;}
      p.src=url;p.addEventListener('error',()=>setStatus('This browser cannot play this file. Try an MP4 video, JPG photo, or MP3/M4A recording.'));return p;
    }
    function setDraft(file){
      if(!active||!enabled||busy)return;
      try{const info=validateFile(file);clearDraft();draft={file,id:root.crypto.randomUUID(),uploaded:false};draftURL=root.URL.createObjectURL(file);
        preview.append(player(file,draftURL,'Your unshared picture'));transcript.hidden=transcriptLabel.hidden=info.kind!=='voice';editor.hidden=false;setStatus('Ready to preview. Nothing has been shared.');update();
      }catch(e){fileInput.value='';setStatus(e.message);}
    }
    fileInput.addEventListener('change',()=>{if(!active||!enabled||busy){fileInput.value='';return;}const file=fileInput.files&&fileInput.files[0];if(file)setDraft(file);});consent.addEventListener('change',update);
    async function submit(){
      if(!draft||busy||!enabled||!consent.checked||recordPhase!=='idle')return;
      busy=true;update();const start=epoch,ctx=context(),currentDraft=draft;
      try{
        await shareDraft({draft:currentDraft,snapshot:ctx,context,consent:consent.checked,caption:caption.value.trim(),transcript:validateFile(currentDraft.file).kind==='voice'?transcript.value.trim():'',cancelled:()=>epoch!==start,status:setStatus});
        if(start!==epoch)return;busy=false;clearDraft();setStatus('Shared with your connected family.');await load(true);
      }catch(e){if(start!==epoch)return;setStatus('Sharing was not confirmed. Your draft is still here. Check your connection and press Share to retry.');}
      finally{if(start===epoch){busy=false;update();}}
    }
    async function load(reset){
      if(loading)return;const ctx=context(),start=epoch;if(!ctx?.client||!ctx.userId||!ctx.householdId){enabled=false;setStatus('Sign in to a connected family account to use family media.');update();return;}
      loading=true;update();
      try{
        const access=await ctx.client.rpc('app9012_media_context',{p_household_id:ctx.householdId});
        if(start!==epoch||!sameAccount(ctx,context()))return;
        if(access.error||!access.data?.enabled||access.data.user_id!==ctx.userId||access.data.household_id!==ctx.householdId)throw Error('not_enabled');
        enabled=true;if(reset){rows=[];nextPage=0;}
        const r=await ctx.client.from('app9012_family_media').select('id,storage_path,original_filename,media_kind,mime_type,byte_size,caption,transcript,uploader_name,uploader_user_id,shared_at').eq('household_id',ctx.householdId).eq('state','shared').order('shared_at',{ascending:false}).order('id',{ascending:false}).range(nextPage,nextPage+23);
        if(start!==epoch||!sameAccount(ctx,context()))return;if(r.error)throw r.error;
        const page=r.data||[];rows=[...new Map(rows.concat(page).map(r=>[r.id,r])).values()];nextPage+=page.length;more.hidden=page.length<24;
        drawRows();if(!draft&&!recorder.busy())setStatus('Private family test — only your connected household can open these files.');
      }catch(e){if(start!==epoch)return;enabled=false;rows=[];gallery.replaceChildren();more.hidden=true;setStatus('Family media is locked until your household is enabled in Supabase. If it was already enabled, check your connection and reopen the album.');}
      finally{if(start===epoch){loading=false;update();}}
    }
    function drawRows(){
      gallery.replaceChildren();const shown=rows.filter(r=>filter==='all'||r.media_kind===filter);
      if(!shown.length){gallery.append(node('p','fm-empty',rows.length?'No '+filter+' memories in the loaded items.':'Your family’s pictures, videos and voices will gather here.'));return;}
      for(const row of shown){
        const card=node('article','fm-card');const kind={photo:'Picture',video:'Video',voice:'Voice recording'}[row.media_kind]||'Memory';
        card.append(node('span','fm-kind',kind),node('h3','',row.caption||row.original_filename||kind),node('p','fm-meta',(row.uploader_name||'Family member')+' · '+new Date(row.shared_at).toLocaleDateString()));
        const open=button(row.media_kind==='photo'?'Open picture':row.media_kind==='video'?'Open video':'Listen to voice',()=>openMedia(row,open));card.append(open);
        if(row.transcript){const details=node('details');details.append(node('summary','','Read transcript'),node('p','fm-transcript',row.transcript));card.append(details);}
        if(row.uploader_user_id===context()?.userId)card.append(button('Remove from family',()=>hide(row),'ghost fm-remove'));
        gallery.append(card);
      }
    }
    async function hide(row){
      if(busy||!root.confirm('Remove this memory from the family album? This hides it from family viewing; it does not delete the stored original.'))return;
      const ctx=context(),start=epoch;busy=true;update();
      try{const r=await ctx.client.rpc('app9012_media_hide',{p_household_id:ctx.householdId,p_id:row.id});if(start!==epoch||!sameAccount(ctx,context()))return;if(r.error)throw r.error;closeViewer();rows=rows.filter(r=>r.id!==row.id);drawRows();setStatus('Removed from the family album. The stored original has not been deleted.');}
      catch(e){if(start===epoch)setStatus('This memory could not be removed. Please retry.');}finally{if(start===epoch){busy=false;update();}}
    }
    function closeViewer(){viewerRequest++;viewerBody.querySelectorAll('audio,video').forEach(p=>{p.pause();p.removeAttribute('src');p.load();});viewerBody.replaceChildren();if(mediaURL){root.URL.revokeObjectURL(mediaURL);mediaURL=null;}if(viewer.open)viewer.close();if(viewerTrigger?.isConnected)viewerTrigger.focus();viewerTrigger=null;}
    async function openMedia(row,trigger){
      closeViewer();viewerTrigger=trigger;const ctx=context(),start=epoch,request=viewerRequest;
      viewerTitle.textContent=row.caption||'Family memory';viewerBody.append(node('p','','Opening securely…'));viewer.showModal();viewerClose.focus();
      try{
        const expected=ctx.householdId+'/'+row.uploader_user_id+'/'+row.id;if(row.storage_path!==expected)throw Error('invalid_path');
        const r=await ctx.client.storage.from(BUCKET).download(expected);
        if(start!==epoch||request!==viewerRequest||!sameAccount(ctx,context()))return;if(r.error)throw r.error;
        const blob=r.data;validateFile(blob);if(blob.size!==Number(row.byte_size)||blob.type.split(';')[0]!==row.mime_type)throw Error('invalid_file');
        mediaURL=root.URL.createObjectURL(blob);viewerBody.replaceChildren(player(blob,mediaURL,row.caption));
        if(row.transcript)viewerBody.append(node('p','fm-transcript',row.transcript));
      }catch(e){if(start===epoch&&request===viewerRequest)viewerBody.replaceChildren(node('p','','This file could not be opened. Check your connection and family access, then try again.'));}
    }
    function reset(){epoch++;enabled=false;loading=false;busy=false;recorder.cancel();clearDraft();closeViewer();rows=[];gallery.replaceChildren();more.hidden=true;update();}
    function sync(){
      const ctx=context(),key=ctx?.userId+'/'+ctx?.householdId,now=view.classList.contains('active');
      if(key!==sessionKey){reset();sessionKey=key;active=false;}lastContext=ctx;
      if(now&&!active){active=true;load(true);}else if(!now&&active){active=false;reset();}
    }
    new root.MutationObserver(sync).observe(view,{attributes:true,attributeFilter:['class']});
    for(const id of ['appGuideDialog','signOutDialog']){const dialog=doc.getElementById(id);if(dialog)new root.MutationObserver(()=>{if(dialog.open)recorder.stop();}).observe(dialog,{attributes:true,attributeFilter:['open']});}
    const client=context()?.client;
    if(client?.auth?.onAuthStateChange)client.auth.onAuthStateChange((event,session)=>{
      if(event==='SIGNED_OUT'||event==='PASSWORD_RECOVERY'||lastContext?.userId&&session?.user?.id!==lastContext.userId){reset();active=false;}
      root.setTimeout(sync,0);
    });
    doc.addEventListener('visibilitychange',()=>{if(doc.hidden){recorder.stop();closeViewer();}});
    root.addEventListener('pagehide',()=>{active=false;reset();});
    root.addEventListener('beforeunload',e=>{if(draft||busy||recorder.busy()){e.preventDefault();e.returnValue='';}});
    root.app9012FamilyMedia={stopRecording:()=>recorder.stop(),reset};update();sync();
  }
  return {BUCKET,TYPES,LIMITS,validateFile,sameAccount,createRecorder,shareDraft,mount};
}));
