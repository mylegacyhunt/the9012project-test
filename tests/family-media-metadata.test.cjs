'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const media=require('../assets/family-media.js');
const source=fs.readFileSync(path.join(__dirname,'../assets/family-media.js'),'utf8');
const styles=fs.readFileSync(path.join(__dirname,'../assets/family-media.css'),'utf8');

test('a corrected media date is separate from the original file date',()=>{
  const details=media.mediaDetails({file:{type:'image/jpeg',size:42,lastModified:Date.parse('2019-01-02T10:00:00Z')},sourceType:'file_picker'},'2020-06-15T14:30',Date.parse('2026-09-09T12:00:00Z'));
  assert.equal(details.metadataStatus,'user_corrected');
  assert.equal(details.timezoneStatus,'unknown');
  assert.equal(details.capturedAt,'2019-01-02T10:00:00.000Z');
  assert.match(details.manualCaptureOverride,/2020-06-15T/);
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
  assert.equal(details.capturedAt,null);assert.equal(details.manualCaptureOverride,null);assert.equal(details.metadataStatus,'not_applicable');assert.equal(details.timezoneStatus,'not_applicable');
});

test('the upload contract sends canonical dates and never sends GPS',()=>{
  assert.match(source,/app9012_media_begin_v3/);
  assert.match(source,/p_captured_at:details\.capturedAt/);
  assert.match(source,/p_manual_capture_override:details\.manualCaptureOverride/);
  assert.match(source,/p_metadata_status:details\.metadataStatus/);
  assert.doesNotMatch(source,/p_(?:gps|latitude|longitude|location)/i);
});

test('the capture-date control is readable in both themes',()=>{
  assert.match(styles,/#familyMediaRoot input\[type="datetime-local"\][^{]*\{[^}]*color-scheme:dark/);
  assert.match(styles,/html\[data-theme="heirloom_light"\] #familyMediaRoot input\[type="datetime-local"\][^{]*\{[^}]*color-scheme:light/);
});
