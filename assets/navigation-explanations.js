/* Read-only help bubbles. Copy comes directly from the existing Doors labels. */
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
    const doors=[...doc.querySelectorAll('#doorsModal .door')].map(button=>({button,name:button.querySelector('.doorname')?.textContent.trim(),text:button.querySelector('.doortagline')?.textContent.trim()}));
    const records=descriptions(doors);if(!records.size)return;
    const layer=doc.createElement('div');layer.id='navigationExplanationLayer';doc.body.append(layer);
    const bubbles=new Map();let active=null,pinned=false,timer=null,sequence=0;
    function bubbleFor(copy){
      if(bubbles.has(copy.text))return bubbles.get(copy.text);
      const bubble=doc.createElement('div');bubble.id='navigationExplanation'+(++sequence);bubble.className='nav-explanation';bubble.setAttribute('role','tooltip');bubble.textContent=copy.text;bubble.hidden=true;layer.append(bubble);bubbles.set(copy.text,bubble);
      bubble.addEventListener('pointerenter',()=>root.clearTimeout(timer));
      bubble.addEventListener('pointerleave',()=>scheduleHide());return bubble;
    }
    function hide(){root.clearTimeout(timer);if(active){active.bubble.hidden=true;if(active.help)active.help.setAttribute('aria-expanded','false');}active=null;pinned=false;}
    function scheduleHide(){
      root.clearTimeout(timer);if(pinned)return;
      timer=root.setTimeout(()=>{if(active&&(doc.activeElement===active.button||doc.activeElement===active.help))return;hide();},180);
    }
    function show(binding,anchor,keepOpen=false){
      root.clearTimeout(timer);if(!anchor.getClientRects().length)return;
      if(active&&active!==binding)hide();active=binding;pinned=keepOpen;
      binding.bubble.style.maxWidth=Math.min(270,root.innerWidth-20)+'px';binding.bubble.hidden=false;
      const rect=anchor.getBoundingClientRect(),box=binding.bubble.getBoundingClientRect();
      if(rect.bottom<0||rect.top>root.innerHeight){hide();return;}
      const p=position(rect,box.width,box.height,{width:root.innerWidth,height:root.innerHeight});
      binding.bubble.style.left=p.left+'px';binding.bubble.style.top=p.top+'px';
      if(binding.help)binding.help.setAttribute('aria-expanded','true');
    }
    function describe(button,id){const ids=new Set((button.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean));ids.add(id);button.setAttribute('aria-describedby',[...ids].join(' '));}
    function bind(button,copy,addHelp){
      if(!copy)return;const bubble=bubbleFor(copy),binding={button,bubble,help:null};describe(button,bubble.id);
      button.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch'&&!pinned)show(binding,button);});
      button.addEventListener('pointerleave',scheduleHide);
      button.addEventListener('focus',()=>show(binding,button));
      button.addEventListener('blur',scheduleHide);
      button.addEventListener('click',hide); // Original navigation remains unchanged.
      if(!addHelp)return;
      const group=doc.createElement('span');group.className='nav-explanation-group';button.before(group);group.append(button);
      const help=doc.createElement('button');binding.help=help;help.type='button';help.className='nav-explanation-help';help.textContent='?';help.setAttribute('aria-label','Explain '+copy.name);help.setAttribute('aria-controls',bubble.id);help.setAttribute('aria-expanded','false');describe(help,bubble.id);group.append(help);
      help.addEventListener('click',()=>{if(active===binding&&pinned)hide();else show(binding,help,true);});
      help.addEventListener('blur',scheduleHide);
      const visibility=()=>{const hidden=button.hidden||button.style.display==='none';group.hidden=hidden;if(hidden&&active===binding)hide();};
      new root.MutationObserver(visibility).observe(button,{attributes:true,attributeFilter:['style','hidden']});visibility();
    }
    for(const button of doc.querySelectorAll('.tabs .tab[data-t]'))bind(button,resolve(button.dataset.t,records),true);
    for(const [id,name] of [['wisdomLessonsTab','Life Lessons'],['wisdomRulesTab','Family Rules']]){const button=doc.getElementById(id);if(button)bind(button,resolve(name,records),true);}
    for(const door of doors)if(door.text)bind(door.button,{name:door.name,text:door.text},false);
    doc.addEventListener('pointerdown',event=>{if(active&&!active.bubble.contains(event.target)&&!active.button.contains(event.target)&&!active.help?.contains(event.target))hide();},true);
    doc.addEventListener('focusin',event=>{if(active&&event.target!==active.button&&event.target!==active.help)hide();},true);
    doc.addEventListener('keydown',event=>{if(event.key==='Escape'&&active){event.preventDefault();event.stopPropagation();hide();}},true);
    doc.addEventListener('scroll',event=>{if(active&&!active.bubble.contains(event.target))hide();},true);
    root.addEventListener('resize',hide);root.addEventListener('pagehide',hide);
    doc.addEventListener('visibilitychange',()=>{if(doc.hidden)hide();});
    // Existing guided visibility, navigation and dialogs own their behavior.
    // A room/dialog change only dismisses our bubble; no app state is rewritten.
    const navigation=new root.MutationObserver(hide);
    for(const element of doc.querySelectorAll('.view,.modal,dialog'))navigation.observe(element,{attributes:true,attributeFilter:['class','open','hidden']});
  }
  return {key,descriptions,resolve,position,mount};
}));
