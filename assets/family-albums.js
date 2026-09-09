/* Account-scoped album browsing; the server authorizes every request. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.app9012Albums=api;})(typeof window==='object'?window:null,function(){
 'use strict';
 const SORTS=[['newest','Newest first'],['oldest','Oldest first'],['added','Recently added'],['viewed','Recently viewed by me'],['edited','Recently edited'],['favorites','My favorites'],['custom','My custom order']];
 function safePath(row,household){const p=String(row.storage_path||'').split('/');return p.length===3&&p[0]===household&&p[2]===row.id&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p[1]);}
 function dayBoundary(value,next){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return '';const d=new Date(value+'T00:00:00');if(next)d.setDate(d.getDate()+1);return Number.isFinite(d.getTime())?d.toISOString():'';}
 async function thumbnail(root,file){
  if(!/^(image|video)\//.test(file.type))return null;
  const video=file.type.startsWith('video/'),el=root.document.createElement(video?'video':'img'),url=root.URL.createObjectURL(file);
  try{
   await new Promise((resolve,reject)=>{const timer=root.setTimeout(()=>{clean();reject(Error('preview_timeout'));},12000);function clean(){root.clearTimeout(timer);el.onload=el.onerror=el.onloadeddata=null;}
    el.onerror=()=>{clean();reject(Error('unsupported_preview'));};const ready=()=>{clean();resolve();};if(video){el.muted=true;el.playsInline=true;el.preload='auto';el.onloadeddata=ready;}else el.onload=ready;el.src=url;
   });
   const w=video?el.videoWidth:el.naturalWidth,h=video?el.videoHeight:el.naturalHeight;if(!w||!h)throw Error('empty_preview');
   const canvas=root.document.createElement('canvas'),scale=Math.min(1,480/Math.max(w,h));canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#eee5d7';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(el,0,0,canvas.width,canvas.height);
   for(const quality of [.76,.55,.35]){const data=canvas.toDataURL('image/jpeg',quality);if(data.length<=90000)return data;}return null;
  }finally{if(video){el.pause();el.removeAttribute('src');el.load();}root.URL.revokeObjectURL(url);}
 }
 function mount(root,options){
  const doc=root.document,host=options.host;let generation=0,request=0,loading=false,working=false,cancelBuild=false,album='',albums=[],rows=[],offset=0,loadedScope=null;
  const n=(tag,text)=>{const el=doc.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
  const button=(label,fn)=>{const b=n('button',label);b.type='button';b.addEventListener('click',fn);return b;};
  const bar=n('section');bar.className='fm-album-browser';bar.setAttribute('aria-label','Albums and sorting');
  const controls=n('div');controls.className='fm-tools';const picker=n('select'),sort=n('select'),kind=n('select'),search=n('input'),from=n('input'),to=n('input');search.type='search';search.placeholder='Name, person, tag or event';search.maxLength=200;from.type=to.type='date';
  const field=(label,input)=>{const l=n('label',label);l.append(input);controls.append(l);};field('Album or folder',picker);field('Sort',sort);field('Show',kind);field('Search',search);field('From',from);field('Through',to);
  for(const [value,label] of SORTS){const o=n('option',label);o.value=value;sort.append(o);}
  for(const [value,label] of [['all','All media'],['photo','Pictures'],['video','Videos'],['voice','Voices']]){const o=n('option',label);o.value=value;kind.append(o);}
  const actions=n('div');actions.className='fm-tools';const apply=button('Apply view',()=>changeView()),refresh=button('Refresh',()=>load(true,true)),createAlbum=button('New album',()=>create('album')),createFolder=button('New folder',()=>create('folder')),rename=button('Rename',()=>renameAlbum()),remove=button('Remove album/folder',()=>removeAlbum()),build=button('Make previews for these items',()=>makePreviews()),stop=button('Stop making previews',()=>{cancelBuild=true;});stop.hidden=true;
  actions.append(apply,refresh,createAlbum,createFolder,rename,remove,build,stop);
  const note=n('p','Folders and albums are shared with your family. Sort choices, favorites and recent views are yours.');note.className='fm-hint';const status=n('p');status.className='fm-status';status.setAttribute('role','status');
  const grid=n('div');grid.className='fm-grid';const more=button('Load more',()=>load(false));more.hidden=true;bar.append(controls,actions,note,status,grid,more);host.append(bar);
  function ctx(){return options.context();}
  function valid(c,g){const now=ctx();return g===generation&&c&&now&&c.client===now.client&&c.userId===now.userId&&c.householdId===now.householdId&&options.active();}
  async function rpc(action,args={},c=ctx(),g=generation){if(!valid(c,g))throw Error('screen_changed');const r=await c.client.rpc('app9012_album_browser',{p_household_id:c.householdId,p_action:action,p_args:args});if(!valid(c,g))throw Error('screen_changed');if(r.error)throw r.error;return r.data;}
  function prefs(){return {sort:sort.value,kind:kind.value,search:search.value,from:from.value,to:to.value};}
  function restore(p={}){sort.value=SORTS.some(x=>x[0]===p.sort)?p.sort:'newest';kind.value=['all','photo','video','voice'].includes(p.kind)?p.kind:'all';search.value=p.search||'';from.value=p.from||'';to.value=p.to||'';}
  function update(){for(const el of [picker,sort,kind,search,from,to,apply,refresh,createAlbum,createFolder,build,more])el.disabled=working||loading;const a=albums.find(a=>a.id===album);rename.disabled=remove.disabled=working||loading||!a||(a.created_by&&a.created_by!==ctx()?.userId);stop.hidden=!working;}
  function albumOptions(){picker.replaceChildren();const all=n('option','All family memories');all.value='';picker.append(all);function branch(parent,depth){for(const a of albums.filter(a=>(a.parent_id||'')===parent)){const o=n('option','— '.repeat(depth)+(a.kind==='folder'?'Folder: ':'Album: ')+a.name);o.value=a.id;picker.append(o);if(depth<32)branch(a.id,depth+1);}}branch('',0);if(!albums.some(a=>a.id===album))album='';picker.value=album;}
  async function load(reset=true,reloadContext=false){
   const c=ctx(),g=generation,id=++request;loading=true;update();
   try{
    if(loadedScope!==album||reloadContext){const data=await rpc('context',{album},c,g);if(id!==request)return;albums=data.albums||[];albumOptions();restore(data.preferences||{});loadedScope=album;}
    if(reset){offset=0;rows=[];grid.replaceChildren();}
    const p=prefs(),page=await rpc('list',{...p,album,from:dayBoundary(p.from,false),to:dayBoundary(p.to,true),offset},c,g);if(id!==request)return;
    rows=[...new Map(rows.concat(page).map(r=>[r.id,r])).values()];offset+=page.length;more.hidden=page.length<24;draw();status.textContent=rows.length+' memories loaded.';
   }catch(e){if(valid(c,g)&&id===request){rows=[];albums=[];picker.replaceChildren();loadedScope=null;grid.replaceChildren();more.hidden=true;status.textContent='Could not load this album. Refresh to retry.';}}
   finally{if(valid(c,g)&&id===request){loading=false;update();}}
  }
  async function changeView(){if(working||loading)return;if(from.value&&to.value&&from.value>to.value){status.textContent='Choose an end date on or after the start date.';return;}if(await mutate(()=>rpc('preferences',{album,...prefs()}),false))await load(true);}
  picker.addEventListener('change',()=>{album=picker.value;load(true);});for(const el of [sort,kind])el.addEventListener('change',changeView);search.addEventListener('keydown',e=>{if(e.key==='Enter')changeView();});
  async function mutate(fn,reload=true){if(working)return false;const c=ctx(),g=generation;working=true;update();try{await fn();if(valid(c,g)){status.textContent='Saved.';if(reload)await load(true,true);}return true;}catch(e){if(valid(c,g))status.textContent='Could not save this change. Your family access may have changed; refresh and retry.';return false;}finally{if(valid(c,g)){working=false;update();}}}
  async function create(type){const name=root.prompt('Name this '+type+':');if(!name?.trim())return;const current=albums.find(a=>a.id===album),parent=current?.kind==='folder'?album:current?.parent_id||'';await mutate(async()=>{await rpc('create',{album:parent,name:name.trim(),kind:type});});}
  async function renameAlbum(){const a=albums.find(a=>a.id===album);if(!a)return;const name=root.prompt('New name:',a.name);if(name?.trim())await mutate(()=>rpc('rename',{album,name:name.trim()}));}
  async function removeAlbum(){const a=albums.find(a=>a.id===album);if(!a||!root.confirm('Remove “'+a.name+'”? Photos stay in All family memories. A folder must have no child albums or folders.'))return;await mutate(async()=>{await rpc('remove_album',{album});album=a.parent_id||'';loadedScope=null;});}
  async function viewed(row){try{await rpc('viewed',{media:row.id});}catch(e){status.textContent='The memory opened, but your recent-view history could not be saved.';}}
  function draw(){grid.replaceChildren();if(!rows.length){const empty=n('p','No memories match this view.');empty.className='fm-empty';grid.append(empty);return;}for(let i=0;i<rows.length;i++){
   const row=rows[i],card=n('article');card.className='fm-card';const label=row.caption||row.original_filename||'Family memory';const open=button('',()=>options.open(row,open));open.className='fm-thumbnail';open.setAttribute('aria-label','Open '+label);
   if(row.jpeg){const img=n('img');img.src=row.jpeg;img.alt=label;img.loading='lazy';img.decoding='async';open.append(img);}else open.append(n('span',row.media_kind==='voice'?'▶ Voice recording':row.media_kind==='video'?'▶ Video · preview pending':'Picture · preview pending'));
   card.append(open,n('h3',label));const meta=n('p',(row.uploader_name||'Former family member')+' · '+new Date(row.timeline_at).toLocaleDateString());meta.className='fm-meta';card.append(meta);
   const indicators=n('p',row.media_kind==='video'?'Video':row.media_kind==='voice'?'Voice recording':'Picture');indicators.className='fm-meta';if(row.has_transcript)indicators.append(doc.createTextNode(' · Transcript'));if(['estimated','fallback'].includes(row.metadata_status))indicators.append(doc.createTextNode(' · Estimated date'));if(row.metadata_status==='user_corrected')indicators.append(doc.createTextNode(' · Corrected date'));card.append(indicators);
   card.append(button(row.favorite?'★ My favorite':'☆ Favorite',()=>mutate(()=>rpc('favorite',{media:row.id,value:!row.favorite}))));
   const destinations=n('select');destinations.setAttribute('aria-label','Add '+label+' to album');const placeholder=n('option','Add to album…');placeholder.value='';destinations.append(placeholder);for(const a of albums.filter(a=>a.kind==='album')){const o=n('option',a.name+(row.albums?.includes(a.id)?' ✓':''));o.value=a.id;destinations.append(o);}destinations.addEventListener('change',()=>{if(destinations.value)mutate(()=>rpc('add',{album:destinations.value,media:row.id}));});card.append(destinations);
   if(album&&row.albums?.includes(album))card.append(button('Remove from this album',()=>mutate(()=>rpc('remove',{album,media:row.id}))));
   if(sort.value==='custom'){if(i>0)card.append(button('Move earlier',()=>mutate(()=>rpc('move',{album,media:row.id,other:rows[i-1].id}))));if(i<rows.length-1)card.append(button('Move later',()=>mutate(()=>rpc('move',{album,media:row.id,other:rows[i+1].id}))));}
   if(row.album_tags||row.album_event){const labels=n('p',[row.album_tags,row.album_event].filter(Boolean).join(' · '));labels.className='fm-meta';card.append(labels);}
   if(row.uploader_user_id===ctx()?.userId){card.append(button('Edit tags / event',async()=>{const tags=root.prompt('Names or tags (comma separated):',row.album_tags||'');if(tags===null)return;const event=root.prompt('Waymark or event label:',row.album_event||'');if(event!==null)await mutate(()=>rpc('labels',{media:row.id,tags,event}));}));card.append(button('Remove from family',()=>options.hide(row)));}
   grid.append(card);
  }}
  async function savePreview(row,file,c=ctx(),g=generation){if(row.jpeg||!valid(c,g))return;const jpeg=await thumbnail(root,file);if(jpeg&&valid(c,g)){await rpc('preview',{media:row.id,jpeg},c,g);row.jpeg=jpeg;}}
  async function makePreviews(){if(working||loading)return;const pending=rows.filter(r=>!r.jpeg&&r.media_kind!=='voice'),c=ctx(),g=generation;working=true;cancelBuild=false;update();let made=0,failed=0;try{for(const row of pending){if(cancelBuild||!valid(c,g))break;status.textContent='Making preview '+(made+failed+1)+' of '+pending.length+'…';try{if(!safePath(row,c.householdId))throw Error('path');const r=await c.client.storage.from(options.bucket).download(row.storage_path);if(r.error)throw r.error;if(!valid(c,g))break;await savePreview(row,r.data,c,g);if(row.jpeg)made++;else failed++;}catch(e){failed++;}if(valid(c,g))draw();}if(valid(c,g))status.textContent=made+' previews saved.'+(failed?' '+failed+' could not be made in this browser.':'');}finally{if(valid(c,g)){working=false;update();}}}
  function reset(){generation++;request++;loading=false;working=false;cancelBuild=true;album='';loadedScope=null;albums=[];rows=[];offset=0;restore();grid.replaceChildren();picker.replaceChildren();more.hidden=true;status.textContent='';update();}
  return {load,reset,viewed,savePreview,busy:()=>working,refresh:()=>load(true,true)};
 }
 return {SORTS,safePath,dayBoundary,thumbnail,mount};
});
