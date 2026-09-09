'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const media=require('../assets/family-media.js');

test('a copied image is read from clipboard items',()=>{
  const image={type:'image/png',size:42,name:''};
  const data={items:[{kind:'string',type:'text/plain'},{kind:'file',type:'image/png',getAsFile:()=>image}]};
  assert.equal(media.clipboardImage(data),image);
});

test('clipboard files provide a fallback when item access is unavailable',()=>{
  const image={type:'image/jpeg',size:42,name:'family.jpg'};
  assert.equal(media.clipboardImage({items:[],files:[{type:'application/pdf'},image]}),image);
});

test('text and non-image clipboard content is ignored',()=>{
  assert.equal(media.clipboardImage({items:[{kind:'string',type:'text/plain'}],files:[]}),null);
  assert.equal(media.clipboardImage({items:[{kind:'file',type:'application/pdf',getAsFile:()=>({type:'application/pdf'})}]}),null);
  assert.equal(media.clipboardImage(null),null);
});
