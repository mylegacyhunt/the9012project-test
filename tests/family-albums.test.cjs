'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),albums=require('../assets/family-albums.js');
test('retained shared originals remain openable after the uploader is deleted',()=>{
 const household='10000000-0000-4000-8000-000000000001',id='20000000-0000-4000-8000-000000000001',u='00000000-0000-4000-8000-000000000001';
 assert.equal(albums.safePath({id,uploader_user_id:null,storage_path:household+'/'+u+'/'+id},household),true);
 for(const storage_path of ['other/'+u+'/'+id,household+'/../'+id,household+'/'+u+'/wrong',household+'/'+u+'/'+id+'/extra'])assert.equal(albums.safePath({id,storage_path},household),false);
});
test('date range includes the full local end day',()=>{const from=albums.dayBoundary('2020-06-01',false),to=albums.dayBoundary('2020-06-01',true);assert(new Date(to)>new Date(from));assert.equal(new Date(from).getHours(),0);assert.equal(new Date(to).getDate(),2);assert.equal(albums.dayBoundary('bad',false),'');});
