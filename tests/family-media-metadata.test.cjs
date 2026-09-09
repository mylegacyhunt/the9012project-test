'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const media=require('../assets/family-media.js');
const source=fs.readFileSync(path.join(__dirname,'../assets/family-media.js'),'utf8');
const styles=fs.readFileSync(path.join(__dirname,'../assets/family-media.css'),'utf8');

test('a manually corrected media date is preferred and carries local offset status',()=>{
  const details=media.mediaDetails({file:{type:'image/jpeg',size:42,lastModified:1},sourceType:'file_picker'},'2020-06-15',Date.parse('2026-09-09T12:00:00Z'));
  assert.equal(details.metadataStatus,'manual');
  assert.equal(details.timezoneStatus,'device_local');
  assert.match(details.capturedAt,/2020-06-15T/);
});

test('picker dates are estimated while pasted pictures fall back to import time',()=>{
  const now=Date.parse('2026-09-09T12:00:00Z'),modified=Date.parse('2019-02-03T10:00:00Z');
  const picked=media.mediaDetails({file:{type:'image/png',size:42,lastModified:modified},sourceType:'file_picker'},'',now);
  const pasted=media.mediaDetails({file:{type:'image/png',size:42,lastModified:modified},sourceType:'clipboard'},'',now);
  assert.equal(picked.capturedAt,new Date(modified).toISOString());assert.equal(picked.metadataStatus,'estimated');assert.equal(picked.timezoneStatus,'unknown');
  assert.equal(pasted.capturedAt,new Date(now).toISOString());assert.equal(pasted.metadataStatus,'fallback');assert.equal(pasted.sourceType,'clipboard');
});

test('voice recordings do not pretend to have a photo capture date',()=>{
  const details=media.mediaDetails({file:{type:'audio/mpeg',size:42},sourceType:'voice_recorder'},'',0);
  assert.equal(details.capturedAt,null);assert.equal(details.metadataStatus,'not_applicable');assert.equal(details.timezoneStatus,'not_applicable');
});

test('the upload contract sends canonical dates and never sends GPS',()=>{
  assert.match(source,/app9012_media_begin_v2/);
  assert.match(source,/p_captured_at:details\.capturedAt/);
  assert.match(source,/p_metadata_status:details\.metadataStatus/);
  assert.doesNotMatch(source,/p_(?:gps|latitude|longitude|location)/i);
});

test('the capture-date control is readable in both themes',()=>{
  assert.match(styles,/#familyMediaRoot input\[type="date"\][^{]*\{[^}]*color-scheme:dark/);
  assert.match(styles,/html\[data-theme="heirloom_light"\] #familyMediaRoot input\[type="date"\][^{]*\{[^}]*color-scheme:light/);
});
