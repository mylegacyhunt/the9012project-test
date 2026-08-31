/* Read-only navigation help, using the same deeper explanations as Explore. */
(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else api.mount(root);
}(typeof window==='object'?window:null,function(){
  'use strict';
  const routes={viewJar:'The Shelf',viewWaymarks:'Waymarks',view12Stones:'12 Stones',viewChart:'Captain’s Chart',viewFamily:'Family',viewJournal:'Journal',viewSecret:'Secret Place'};
  function key(name){return String(name||'').trim().replace(/&rsquo;/g,'’').replace(/['’]/g,'').replace(/^(?:the|my)\s+/i,'').toLowerCase();}
  function descriptions(records){
    const result=new Map();for(const record of records)if(record.name&&record.text)result.set(key(record.name),{name:record.name,text:record.text});return result;
  }
  function resolve(route,records){
    if(route==='viewWisdom'){
      if(records.has('wisdom'))return records.get('wisdom');
      const entries=['Life Lessons','Family Rules'].map(name=>records.get(key(name))).filter(Boolean);
      return entries.length?{name:'Wisdom',text:entries.map(e=>e.name+' — '+e.text).join('\n')}:null;
    }
    return records.get(key(routes[route]||route))||null;
  }
  function position(rect,width,height,viewport){
    const gap=8,edge=10;const left=Math.max(edge,Math.min(rect.left+(rect.width-width)/2,viewport.width-width-edge));
    const below=rect.bottom+gap;const top=below+height<=viewport.height-edge?below:Math.max(edge,rect.top-height-gap);
    return {left,top};
  }
  function mount(root){
    const doc=root?.document;if(!doc||doc.getElementById('navigationExplanationLayer'))return;
    // Doors captions remain visible, but Doors never receives a tooltip binding.
    const doors=[...doc.querySelectorAll('#doorsModal .door')].map(button=>({name:button.querySelector('.doorname')?.textContent.trim(),text:button.querySelector('.doortagline')?.textContent.trim()}));
    const guides=[...doc.querySelectorAll('#appGuideDialog [data-guide-name]')].map(item=>({name:item.dataset.guideName,text:item.querySelector('.guidehelp')?.textContent.trim()}));
    const records=descriptions([...doors,...guides]);if(!records.size)return;
    const layer=doc.createElement('div');layer.id='navigationExplanationLayer';doc.body.append(layer);
    const bubbles=new Map();let active=null,timer=null,sequence=0;
    function bubbleFor(copy){
      if(bubbles.has(copy.text))return bubbles.get(copy.text);
      const bubble=doc.createElement('div');bubble.id='navigationExplanation'+(++sequence);bubble.className='nav-explanation';bubble.setAttribute('role','tooltip');bubble.textContent=copy.text;bubble.hidden=true;layer.append(bubble);bubbles.set(copy.text,bubble);
      bubble.addEventListener('pointerenter',()=>root.clearTimeout(timer));
      bubble.addEventListener('pointerleave',scheduleHide);return bubble;
    }
    function hide(){root.clearTimeout(timer);if(active)active.bubble.hidden=true;active=null;}
    function scheduleHide(){
      root.clearTimeout(timer);
      timer=root.setTimeout(()=>{if(active&&doc.activeElement===active.button)return;hide();},180);
    }
    function show(binding){
      root.clearTimeout(timer);const anchor=binding.button;if(!anchor.getClientRects().length)return;
      if(active&&active!==binding)hide();active=binding;
      binding.bubble.style.maxWidth=Math.min(320,root.innerWidth-20)+'px';binding.bubble.hidden=false;
      const rect=anchor.getBoundingClientRect(),box=binding.bubble.getBoundingClientRect();
      if(rect.bottom<0||rect.top>root.innerHeight){hide();return;}
      const p=position(rect,box.width,box.height,{width:root.innerWidth,height:root.innerHeight});
      binding.bubble.style.left=p.left+'px';binding.bubble.style.top=p.top+'px';
    }
    function bind(button,copy){
      if(!copy)return;const bubble=bubbleFor(copy),binding={button,bubble};
      const ids=new Set((button.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean));ids.add(bubble.id);button.setAttribute('aria-describedby',[...ids].join(' '));
      button.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch')show(binding);});
      button.addEventListener('pointerleave',scheduleHide);
      button.addEventListener('focus',()=>show(binding));
      button.addEventListener('blur',scheduleHide);
      button.addEventListener('click',hide); // Original navigation remains unchanged.
      new root.MutationObserver(()=>{if(active===binding&&(button.hidden||button.style.display==='none'))hide();}).observe(button,{attributes:true,attributeFilter:['style','hidden']});
    }
    for(const button of doc.querySelectorAll('.tabs .tab[data-t]'))bind(button,resolve(button.dataset.t,records));
    for(const [id,name] of [['wisdomLessonsTab','Life Lessons'],['wisdomRulesTab','Family Rules']]){const button=doc.getElementById(id);if(button)bind(button,resolve(name,records));}
    // No extra question-mark buttons. On touch screens, Explore provides this same copy.
    doc.addEventListener('pointerdown',event=>{if(active&&!active.bubble.contains(event.target)&&!active.button.contains(event.target))hide();},true);
    doc.addEventListener('focusin',event=>{if(active&&event.target!==active.button)hide();},true);
    doc.addEventListener('keydown',event=>{if(event.key==='Escape'&&active){event.preventDefault();event.stopPropagation();hide();}},true);
    doc.addEventListener('scroll',event=>{if(active&&!active.bubble.contains(event.target))hide();},true);
    root.addEventListener('resize',hide);root.addEventListener('pagehide',hide);
    doc.addEventListener('visibilitychange',()=>{if(doc.hidden)hide();});
    const navigation=new root.MutationObserver(hide);
    for(const element of doc.querySelectorAll('.view,.modal,dialog'))navigation.observe(element,{attributes:true,attributeFilter:['class','open','hidden']});
  }
  return {key,descriptions,resolve,position,mount};
}));
