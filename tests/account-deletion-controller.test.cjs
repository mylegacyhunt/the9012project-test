'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const deletion=require('../assets/account-deletion.js');
const error=code=>Object.assign(new Error(code),{code});
const pending=(extra={})=>({deletion_protocol:2,user_id:'account-a',status:'pending',deleted:false,running:false,...extra});
const notStarted=()=>pending({status:'not_started'});
const deleted=()=>pending({status:'deleted',deleted:true});
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
async function tick(){for(let i=0;i<12;i++)await Promise.resolve();}
function storage(values={}){const data=new Map(Object.entries(values));return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};}
function harness(overrides={}){
 let timerId=0;
 const h={storage:storage(),tabStorage:storage(),session:{user:{id:'account-a'},access_token:'token-a'},cacheOwner:'account-a',timers:new Map(),renders:[],freezes:[],calls:{erase:[],status:[],clear:[],complete:0},busy:false};
 h.status=async()=>notStarted();h.erase=async()=>({deleted:true});h.clearDevice=async()=>true;
 Object.assign(h,overrides);
 h.options={storage:h.storage,tabStorage:h.tabStorage,session:()=>h.session,cacheOwner:()=>h.cacheOwner,id:()=> 'request-a',preflight:()=>h.busy,exclusive:async fn=>fn(),
   setTimeout:(fn,ms)=>{h.timers.set(++timerId,{fn,ms});return timerId;},clearTimeout:id=>h.timers.delete(id),
   freeze:v=>h.freezes.push(v),render:s=>h.renders.push({...s}),
   status:async(...args)=>{h.calls.status.push(args);return h.status(...args);},erase:async(...args)=>{h.calls.erase.push(args);return h.erase(...args);},
   clearDevice:async(...args)=>{h.calls.clear.push(args);return h.clearDevice(...args);},complete:()=>{h.calls.complete++;}};
 h.controller=deletion.create(h.options);
 h.expire=()=>{for(const [id,t]of h.timers)if(t.ms===60000){h.timers.delete(id);t.fn();}};
 return h;
}
function seed(h,extra={}){h.storage.setItem(deletion.KEY,JSON.stringify({userId:'account-a',requestId:'request-a',phase:'pending',successor:'',...extra}));}
function assertFrozen(h){assert.equal(h.controller.state().pending,true);assert.equal(h.freezes.at(-1),true);assert.equal(h.calls.complete,0);assert.equal(h.calls.clear.length,0);}

test('a 60-second wait keeps deletion pending and late success clears the device exactly once',async()=>{
 const request=deferred(),h=harness({erase:()=>request.promise});
 const task=h.controller.begin('next-adult');await tick();
 assert.equal(h.calls.erase.length,1);assert.deepEqual(h.calls.erase[0],['account-a','token-a','next-adult']);
 h.expire();assertFrozen(h);
 assert.equal(h.controller.state().inFlight,true);assert.equal(h.controller.state().canRetry,false);
 assert.match(h.controller.state().message,/may still be running/);
 assert.equal(await h.controller.retry(),false);assert.equal(await h.controller.begin('next-adult'),false);
 assert.equal(h.calls.erase.length,1,'timeout is not permission to issue a duplicate destructive call');
 request.resolve({deleted:true});assert.equal(await task,true);
 assert.equal(h.calls.clear.length,1);assert.equal(h.calls.complete,1);assert.equal(h.storage.getItem(deletion.KEY),null);assert.equal(h.tabStorage.getItem(deletion.TOKEN_KEY),null);
 await h.controller.check();await h.controller.retry();assert.equal(h.calls.complete,1);
});

test('explicit status confirmation completes a lost response; the later response cannot repeat cleanup',async()=>{
 const request=deferred(),h=harness({erase:()=>request.promise});
 const task=h.controller.begin();await tick();h.expire();h.status=async()=>deleted();
 assert.equal(await h.controller.check(),true);assert.equal(h.calls.complete,1);assert.equal(h.calls.clear.length,1);
 request.resolve({deleted:true});await task;
 assert.equal(h.calls.complete,1);assert.equal(h.calls.clear.length,1);
});

test('partial deletion preserves the recovery marker and freeze, then supports a checked retry',async()=>{
 let attempts=0,statusCalls=0;
 const h=harness({status:async()=>++statusCalls===1?notStarted():pending(),erase:async()=>{if(++attempts===1)throw error('storage_cleanup_failed');return {deleted:true};}});
 assert.equal(await h.controller.begin(),false);assertFrozen(h);
 assert.ok(h.storage.getItem(deletion.KEY));assert.equal(h.controller.state().canRetry,true);
 assert.match(h.controller.state().message,/unfinished|already.*gone|removed/);
 assert.equal(await h.controller.retry(),true);assert.equal(h.calls.erase.length,2);assert.equal(h.calls.complete,1);
});

test('concurrent retry gestures cannot duplicate an in-flight erase',async()=>{
 const request=deferred(),h=harness({status:async()=>pending(),erase:()=>request.promise});seed(h);h.controller.restore();
 const first=h.controller.retry(),second=h.controller.retry();await tick();
 assert.equal(h.calls.erase.length,1);assert.equal(h.calls.status.length,1);
 request.resolve({deleted:true});await Promise.all([first,second]);assert.equal(h.calls.complete,1);
});

test('reload restores the freeze and status checking uses the same account without erasing again',async()=>{
 const h=harness({status:async()=>pending({running:true})});seed(h);
 assert.equal(h.controller.pending(),true);assert.equal(h.controller.restore(),true);assertFrozen(h);
 assert.equal(await h.controller.check(),false);assertFrozen(h);assert.equal(h.calls.erase.length,0);assert.equal(h.controller.state().canRetry,false);
 assert.deepEqual(h.calls.status[0],['account-a','token-a']);
});

test('restoring a pending operation retains its matching session token for later session loss',async()=>{
 const h=harness({status:async()=>deleted()});seed(h);assert.equal(h.controller.restore(),true);
 const saved=JSON.parse(h.tabStorage.getItem(deletion.TOKEN_KEY));
 assert.equal(saved.userId,'account-a');assert.equal(saved.requestId,'request-a');assert.equal(saved.accessToken,'token-a');
 h.session=null;
 assert.equal(await h.controller.check(),true);assert.deepEqual(h.calls.status[0],['account-a','token-a']);assert.equal(h.calls.erase.length,0);assert.equal(h.calls.complete,1);
});

test('an operation claimed by another tab during the initial status check is adopted without a second erase',async()=>{
 const response=deferred(),h=harness({status:()=>response.promise});
 const task=h.controller.begin();await tick();assert.equal(h.calls.status.length,1);
 seed(h,{requestId:'other-tab-request'});response.resolve(notStarted());
 assert.equal(await task,false);assert.equal(h.calls.erase.length,0);assert.equal(h.controller.pending(),true);
 assert.equal(JSON.parse(h.storage.getItem(deletion.KEY)).requestId,'other-tab-request');
});

test('a status update never overwrites a recovery marker belonging to a different request',async()=>{
 const response=deferred(),h=harness({status:()=>response.promise});seed(h);h.controller.restore();
 const task=h.controller.check();await tick();
 const keeper={userId:'account-b',requestId:'other-account-request',phase:'pending',successor:''};
 h.storage.setItem(deletion.KEY,JSON.stringify(keeper));response.resolve(pending());
 assert.equal(await task,false);assert.deepEqual(JSON.parse(h.storage.getItem(deletion.KEY)),keeper);
 assert.equal(h.calls.erase.length,0);assert.equal(h.calls.clear.length,0);assert.equal(h.calls.complete,0);
});

test('an absent live session can reconcile using this tab’s saved token and an explicit deleted receipt',async()=>{
 const h=harness({session:null,status:async()=>deleted()});seed(h);
 h.tabStorage.setItem(deletion.TOKEN_KEY,JSON.stringify({userId:'account-a',requestId:'request-a',accessToken:'saved-token'}));
 assert.equal(await h.controller.check(),true);assert.equal(h.calls.erase.length,0);assert.equal(h.calls.complete,1);
 assert.deepEqual(h.calls.status[0],['account-a','saved-token']);
});

for(const response of [pending(),pending({status:'not_started'}),pending({status:'deleted',deleted:false}),pending({deleted:true}),{deleted:true},{...deleted(),user_id:'account-b'},null]){
 test(`status must explicitly bind deletion to the correct account: ${JSON.stringify(response)}`,async()=>{
   const h=harness({status:async()=>response});seed(h);h.controller.restore();
   assert.equal(await h.controller.check(),false);assertFrozen(h);assert.equal(h.calls.erase.length,0);
 });
}

test('an expired saved token cannot be mistaken for proof that the account is deleted',async()=>{
 const h=harness({session:null,status:async()=>{throw error('authentication_required');}});seed(h);
 h.tabStorage.setItem(deletion.TOKEN_KEY,JSON.stringify({userId:'account-a',requestId:'request-a',accessToken:'expired-token'}));
 await h.controller.check();assertFrozen(h);assert.equal(h.controller.state().canRetry,false);assert.match(h.controller.state().message,/sign-in failure does not confirm deletion/);
});

test('no session or recovery token asks for the same account and never calls erase',async()=>{
 const h=harness({session:null});seed(h);await h.controller.check();assertFrozen(h);
 assert.equal(h.calls.status.length,0);assert.equal(h.calls.erase.length,0);assert.match(h.controller.state().message,/Sign in to the same account/);
});

test('signing back into the same account allows a fresh check after a missing-token failure',async()=>{
 const h=harness({session:null,status:async()=>deleted()});seed(h);
 assert.equal(await h.controller.check(),false);assert.equal(h.calls.status.length,0);
 h.session={user:{id:'account-a'},access_token:'new-token'};
 assert.equal(await h.controller.check(),true);assert.deepEqual(h.calls.status[0],['account-a','new-token']);assert.equal(h.calls.complete,1);
});

test('returning to the original account allows checking again after an account-switch refusal',async()=>{
 const h=harness({session:{user:{id:'account-b'},access_token:'token-b'},status:async()=>deleted()});seed(h);
 assert.equal(await h.controller.check(),false);assert.equal(h.calls.status.length,0);
 h.session={user:{id:'account-a'},access_token:'new-token'};
 assert.equal(await h.controller.check(),true);assert.equal(h.calls.complete,1);
});

test('an account switch before a late success never clears the replacement account',async()=>{
 const request=deferred(),h=harness({erase:()=>request.promise});const task=h.controller.begin();await tick();
 h.session={user:{id:'account-b'},access_token:'token-b'};h.cacheOwner='account-b';request.resolve({deleted:true});
 assert.equal(await task,false);assertFrozen(h);assert.ok(h.storage.getItem(deletion.KEY));assert.equal(h.controller.state().canRetry,false);assert.match(h.controller.state().message,/account changed/);
});

test('a changed cached owner also blocks cleanup while the original session is still present',async()=>{
 const request=deferred(),h=harness({erase:()=>request.promise});const task=h.controller.begin();await tick();
 h.cacheOwner='account-b';request.resolve({deleted:true});await task;assertFrozen(h);
});

for(const response of [{deleted:false},{deleted:'true'},null,{}]){
 test(`malformed erase response does not clear device data: ${JSON.stringify(response)}`,async()=>{
   let statusCalls=0;const h=harness({status:async()=>++statusCalls===1?notStarted():pending(),erase:async()=>response});
   assert.equal(await h.controller.begin(),false);assertFrozen(h);assert.ok(h.storage.getItem(deletion.KEY));
 });
}

for(const kind of ['persistent','tab']){
 test(`unavailable ${kind} storage prevents submitting an irreversible request`,async()=>{
   const h=harness();h[kind==='persistent'?'storage':'tabStorage'].setItem=()=>{throw Error('storage denied');};
   assert.equal(await h.controller.begin(),false);assert.equal(h.calls.erase.length,0);assert.equal(h.calls.clear.length,0);assert.equal(h.calls.complete,0);assert.equal(h.controller.pending(),false);
   assert.match(h.controller.state().message,/Deletion was not requested/);
 });
}

for(const response of [{},pending({deletion_protocol:1}),pending({user_id:'account-b'}),pending({status:'deleted',deleted:false}),pending({status:'pending',deleted:'false'}),pending({status:'unknown'})]){
 test(`invalid initial recovery status prevents destructive submission: ${JSON.stringify(response)}`,async()=>{
   const h=harness({status:async()=>response});assert.equal(await h.controller.begin(),false);
   assert.equal(h.calls.erase.length,0);assert.equal(h.calls.clear.length,0);assert.equal(h.calls.complete,0);
 });
}

test('an in-progress save prevents deletion before contacting either endpoint',async()=>{
 const h=harness({busy:true});assert.equal(await h.controller.begin(),false);assert.equal(h.calls.status.length,0);assert.equal(h.calls.erase.length,0);assert.match(h.controller.state().message,/still in progress/);
});

test('device cleanup failure never reports completion and can be retried by checking confirmed status',async()=>{
 let cleanups=0;const h=harness({clearDevice:async()=>++cleanups>1});
 assert.equal(await h.controller.begin(),false);assert.equal(h.calls.complete,0);assert.ok(h.storage.getItem(deletion.KEY));assert.equal(h.freezes.at(-1),true);
 h.status=async()=>deleted();assert.equal(await h.controller.check(),true);assert.equal(h.calls.erase.length,1);assert.equal(h.calls.clear.length,2);assert.equal(h.calls.complete,1);
});

test('confirmed cloud deletion remains known if local cleanup fails and authentication later expires',async()=>{
 const h=harness({clearDevice:async()=>false,erase:async()=>{h.status=async()=>{throw error('authentication_required');};return {deleted:true};}});
 assert.equal(await h.controller.begin(),false);
 assert.match(h.controller.state().message,/cloud account was deleted.*could not clear every saved copy/);
 assert.equal(JSON.parse(h.storage.getItem(deletion.KEY)).phase,'deleted','a reload must retain the confirmed cloud outcome');
 h.clearDevice=async()=>true;
 const restored=deletion.create(h.options);assert.equal(restored.restore(),true);
 assert.equal(await restored.check(),true);assert.equal(h.calls.erase.length,1);assert.equal(h.calls.complete,1);
});
