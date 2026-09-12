/* Deletion recovery: an unknown result never resumes ordinary account writes. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.app9012Deletion=api;})(typeof window==='object'?window:null,function(){
 'use strict';
 const KEY='9012_account_deletion_pending',TOKEN_KEY='9012_account_deletion_recovery';
 const partialCodes=new Set(['shared_storage_detach_failed','storage_cleanup_plan_failed','invalid_storage_cleanup_plan','storage_cleanup_failed','storage_cleanup_not_confirmed','deletion_job_cleanup_failed','auth_deletion_failed']);
 function message(error){
  const code=error&&error.code;
  if(code==='DEVICE_CLEANUP_FAILED')return 'Your cloud account was deleted, but this browser could not clear every saved copy. Clear this site’s browser data before using this device again.';
  if(code==='recovery_storage_unavailable')return 'This browser cannot remember a deletion in progress. Deletion was not requested. Allow site storage and try again.';
  if(code==='recovery_unavailable')return 'The deletion recovery service is unavailable. Deletion was not requested. Please try again later.';
  if(code==='save_in_progress')return 'A save, upload, or recording is still in progress. Let it finish before deleting your account.';
  if(code==='account_changed')return 'The signed-in account changed. Deletion of the previous account is still being checked. This account’s browser data has not been cleared.';
  if(code==='authentication_required')return 'We cannot confirm deletion with this session. Sign in to the same account to check and finish it. If that account is no longer available, contact support; a sign-in failure does not confirm deletion.';
  if(code==='ERASE_TIMEOUT'||code==='deletion_in_progress')return 'Deletion may still be running. Saving is paused. Keep this page open; we will finish clearing this browser if confirmation arrives. Check progress before trying again.';
  if(partialCodes.has(code))return 'Deletion has started and some private information has already been removed. Your sign-in account has not yet been confirmed deleted. Saving remains paused. Check progress, then choose Finish deleting when available.';
  if(code==='parent_managed_shelf')return 'This parent-managed shelf must be released before its account can be deleted.';
  if(code==='eligible_successor_required'||code==='household_owner_transfer_required'||code==='eligible_connected_adult_required')return 'Choose a connected adult to take household ownership before deleting your account.';
  if(code==='household_owner_transfer_failed')return 'Household ownership could not be confirmed transferred. Check progress before trying again.';
  if(code==='attachment_classification_failed'||code==='account_deletion_not_prepared')return 'Deletion preparation could not be confirmed. Household ownership may already have moved. Saving remains paused while you check progress and retry.';
  return 'We could not confirm how far deletion progressed. Some private information may already have been removed. Saving remains paused. Check your connection, then check progress.';
 }
 function create(options){
  const o=options;let operation=null,inFlight=false,checking=false,finishing=false,done=false,timer=null,requestPromise=null,statusPromise=null,canRetry=false,needsAuth=false,lastMessage='';
  const error=code=>Object.assign(new Error(code),{code});
  function validStatus(result,userId){return !!(result&&result.deletion_protocol===2&&result.user_id===userId&&typeof result.running==='boolean'&&((result.status==='deleted'&&result.deleted===true)||(['pending','not_started'].includes(result.status)&&result.deleted===false)));}
  function read(){try{const p=JSON.parse(o.storage.getItem(KEY)||'null');return p&&typeof p.userId==='string'&&p.userId&&typeof p.requestId==='string'&&p.requestId?p:null;}catch(e){return null;}}
  function owns(){const s=o.session();const cached=o.cacheOwner();const stored=o.authOwner?o.authOwner():null;return !!operation&&(!s||!s.user||s.user.id===operation.userId)&&(!cached||cached===operation.userId)&&(!stored||stored===operation.userId);}
  function token(){
   const s=o.session();
   if(s&&s.user&&s.user.id===operation.userId&&s.access_token)return s.access_token;
   try{const t=JSON.parse(o.tabStorage.getItem(TOKEN_KEY)||'null');if(t&&t.userId===operation.userId&&t.requestId===operation.requestId)return t.accessToken;}catch(e){}
   return operation.accessToken||'';
  }
  function rememberSession(){
   const s=o.session();if(!operation||!s||!s.user||s.user.id!==operation.userId||!s.access_token)return;
   operation.accessToken=s.access_token;
   try{o.tabStorage.setItem(TOKEN_KEY,JSON.stringify({userId:operation.userId,requestId:operation.requestId,accessToken:s.access_token}));}catch(e){}
  }
  function persist(creating){
   const existing=read();
   if(existing&&existing.requestId!==operation.requestId)throw error('account_changed');
   if(!existing&&!creating)return;
   const p={userId:operation.userId,requestId:operation.requestId,successor:operation.successor||'',phase:operation.phase||'unknown'};
   o.storage.setItem(KEY,JSON.stringify(p));
   if(o.storage.getItem(KEY)!==JSON.stringify(p))throw error('recovery_storage_unavailable');
  }
  function emit(text){if(text)lastMessage=text;o.freeze(!!operation);o.render({pending:!!operation,inFlight,checking,finishing,done,needsAuth,canRetry:canRetry&&!inFlight&&!checking&&!finishing&&owns(),message:lastMessage,userId:operation&&operation.userId});}
  function restore(){
   const p=read();if(p&&!operation){operation=p;canRetry=false;emit('An earlier account deletion needs confirmation. Saving is paused. Check progress to finish safely.');}
   rememberSession();return !!operation;
  }
  function clearMarker(){
   const p=read();if(p&&p.requestId===operation.requestId)o.storage.removeItem(KEY);
   try{const t=JSON.parse(o.tabStorage.getItem(TOKEN_KEY)||'null');if(t&&t.requestId===operation.requestId)o.tabStorage.removeItem(TOKEN_KEY);}catch(e){}
  }
  async function finish(){
   if(done||finishing)return done;
   operation.phase='deleted';try{persist();}catch(e){}
   if(!owns()){needsAuth=true;emit(message(error('account_changed')));return false;}
   finishing=true;canRetry=false;emit('Your cloud account was deleted. Clearing this browser’s saved copies…');
   try{
    // The adapter rechecks ownership immediately before each cleanup operation.
    if(!await o.clearDevice(operation,owns))throw error('DEVICE_CLEANUP_FAILED');
    clearMarker();done=true;emit('Your personal account was permanently deleted. Your family’s shared memories remain.');o.complete();return true;
   }catch(e){needsAuth=e.code==='account_changed';emit(message(e));return false;}
   finally{finishing=false;}
  }
  async function check(){
   restore();if(!operation||done)return done;if(statusPromise)return statusPromise;
   checking=true;canRetry=false;emit();
   statusPromise=(async()=>{
    // Yield before any early failure so finally cannot race the assignment.
    await Promise.resolve();
    try{
     if(!owns())throw error('account_changed');
     if(operation.phase==='deleted')return await finish();
     const accessToken=token();if(!accessToken)throw error('authentication_required');
     const result=await o.status(operation.userId,accessToken);
     if(!validStatus(result,operation.userId))throw error('status_not_confirmed');
     needsAuth=false;
     if(result.deleted===true&&result.status==='deleted')return await finish();
     if(!['not_started','pending'].includes(result.status)||result.deleted!==false||typeof result.running!=='boolean')throw error('status_not_confirmed');
     if(!owns())throw error('account_changed');
     operation.phase=result.status;try{persist();}catch(e){}
     canRetry=!result.running&&!inFlight;
     emit(result.running||inFlight?message(error('deletion_in_progress')):result.status==='pending'?'Deletion is unfinished. Some private information may already be gone. Choose Finish deleting to resume.':'The server has not confirmed removal of your private information. Saving stays paused. Choose Finish deleting to continue your request.');
     return false;
    }catch(e){needsAuth=e.code==='authentication_required'||e.code==='account_changed';emit(message(e));return false;}
    finally{checking=false;statusPromise=null;emit();}
   })();return statusPromise;
  }
  async function send(){
   if(!operation||inFlight||finishing||done)return false;
   if(!owns()){emit(message(error('account_changed')));return false;}
   const accessToken=token();if(!accessToken){emit(message(error('authentication_required')));return false;}
   const owner=operation;inFlight=true;canRetry=false;emit('Deleting your personal account…');
   timer=o.setTimeout(()=>{timer=null;emit(message(error('ERASE_TIMEOUT')));},60000);
   requestPromise=(async()=>{
    try{
     const result=await o.erase(owner.userId,accessToken,owner.successor);
     if(result.deleted!==true)throw error(result.error||'deletion_not_confirmed');
     return await finish();
    }catch(e){if(!done)emit(message(e));return false;}
    finally{if(timer)o.clearTimeout(timer);timer=null;inFlight=false;requestPromise=null;if(!done){emit();if(operation.phase!=='deleted')await check();}}
   })();return requestPromise;
  }
  async function begin(successor){
   if(restore()||inFlight||checking||finishing)return false;
   if(o.preflight()){emit(message(error('save_in_progress')));return false;}
   const s=o.session();if(!s||!s.user||!s.access_token){emit(message(error('authentication_required')));return false;}
   // Verify recovery is deployed before an irreversible request is allowed.
   checking=true;emit('Checking account deletion recovery…');
   try{
    const result=await o.status(s.user.id,s.access_token);
    if(!validStatus(result,s.user.id))throw error('recovery_unavailable');
    const claim=()=>{
     if(restore())return false;
     if(!o.session()||o.session().user.id!==s.user.id||o.preflight())throw error('save_in_progress');
     operation={userId:s.user.id,requestId:o.id(),successor:successor||'',phase:result.status,accessToken:s.access_token};
     try{
      o.tabStorage.setItem(TOKEN_KEY,JSON.stringify({userId:operation.userId,requestId:operation.requestId,accessToken:s.access_token}));
      if(!o.tabStorage.getItem(TOKEN_KEY))throw error('recovery_storage_unavailable');
      persist(true);
     }catch(e){try{clearMarker();}catch(ignored){}operation=null;throw error('recovery_storage_unavailable');}
     return true;
    };
    if(!await (o.exclusive?o.exclusive(claim):claim()))return false;
    emit();
    if(result.deleted===true&&result.status==='deleted')return await finish();
    if(result.running){emit(message(error('deletion_in_progress')));return false;}
    checking=false;return await send();
   }catch(e){emit(message(e.code==='recovery_storage_unavailable'||e.code==='save_in_progress'?e:error('recovery_unavailable')));return false;}
   finally{checking=false;emit();}
  }
  async function retry(){if(inFlight||checking||finishing||done)return false;await check();if(!done&&canRetry)return send();return done;}
  return {begin,check,retry,restore,rememberSession,pending:()=>!!operation||!!read(),state:()=>({pending:!!operation,inFlight,checking,finishing,done,needsAuth,canRetry,message:lastMessage}),message};
 }
 return {KEY,TOKEN_KEY,message,create};
});
