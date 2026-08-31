-- Additive pilot: no existing messages, memories, policies or buckets are replaced.
-- Requires the family-media pilot migration. Run only after backup and approval.
begin;
create table public.app9012_ks_files (
 id uuid primary key, household_id uuid not null references public.app9012_households(id),
 owner_id uuid not null references auth.users(id), person_id text not null,
 source_kind text not null check(source_kind in ('waymark','chart')), source_id text not null,
 filename text not null check(length(filename) between 1 and 180), mime text not null,
 bytes bigint not null check(bytes>0 and bytes<=47185920),
 visibility text not null check(visibility in ('private','family')),
 state text not null default 'pending' check(state in ('pending','ready','hidden')),
 created_at timestamptz not null default now()
);
create table public.app9012_ks_nuggets (
 id uuid primary key, household_id uuid not null references public.app9012_households(id),
 owner_id uuid not null references auth.users(id), person_id text not null,
 body text not null check(length(trim(body)) between 1 and 2000), source_id text,
 visibility text not null check(visibility in ('private','family')),
 archived boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.app9012_ks_letters (
 id uuid primary key, household_id uuid not null references public.app9012_households(id),
 sender_id uuid not null references auth.users(id), recipient_id uuid not null references auth.users(id),
 sender_name text not null, recipient_name text not null,
 body text not null check(length(trim(body)) between 1 and 20000),
 hand text not null check(hand in ('spencer','vibes','dancing','caveat','print','note','neat','serif','times')),
 created_at timestamptz not null default now(), opened_at timestamptz, closed_at timestamptz, recalled_at timestamptz,
 check(sender_id<>recipient_id), check(not(opened_at is not null and recalled_at is not null)),
 check(closed_at is null or opened_at is not null)
);
create table public.app9012_ks_locks (
 user_id uuid primary key references auth.users(id), pin_hash text,
 failures integer not null default 0, blocked_until timestamptz
);
create table public.app9012_ks_unlocks (
 user_id uuid not null references auth.users(id), token_hash text not null, expires_at timestamptz not null,
 primary key(user_id,token_hash)
);
create index on public.app9012_ks_files(household_id,source_kind,source_id);
create index on public.app9012_ks_nuggets(household_id,created_at desc);
create index on public.app9012_ks_letters(recipient_id,created_at desc);
create index on public.app9012_ks_letters(sender_id,created_at desc);
alter table public.app9012_ks_files enable row level security;
alter table public.app9012_ks_nuggets enable row level security;
alter table public.app9012_ks_letters enable row level security;
alter table public.app9012_ks_locks enable row level security;
alter table public.app9012_ks_unlocks enable row level security;
revoke all on public.app9012_ks_files,public.app9012_ks_nuggets,public.app9012_ks_letters,public.app9012_ks_locks,public.app9012_ks_unlocks from public,anon,authenticated;

-- A source must already be saved on the server. Parents cannot add files to a
-- connected adult's private shelf. Shared reads follow existing redacted data.
create function public.app9012_ks_source(h uuid,p text,k text,i text,editing boolean)
returns boolean language sql stable security definer set search_path='' as $$
 select public.app9012_media_access(h) and (
   exists(select 1 from public.app9012_household_people hp join public.app9012_person_shelves s
     on s.household_id=hp.household_id and s.person_id=hp.person_id
     cross join lateral jsonb_array_elements(coalesce(s.data->case when k='waymark' then 'waymarks' else 'goals' end,'[]'::jsonb)) x
     where hp.household_id=h and hp.person_id=p and hp.linked_user_id=auth.uid() and hp.link_status='linked' and x->>'id'=i)
   or (not editing and exists(select 1 from public.app9012_households hh
     cross join lateral jsonb_array_elements(hh.people) person
     cross join lateral jsonb_array_elements(coalesce(person->case when k='waymark' then 'waymarks' else 'goals' end,'[]'::jsonb)) x
     where hh.id=h and person->>'id'=p and x->>'id'=i))
 );
$$;
revoke all on function public.app9012_ks_source(uuid,text,text,text,boolean) from public,anon,authenticated;

create function public.app9012_ks_object(path text,writing boolean)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.app9012_ks_files f
 where path=f.household_id::text||'/'||f.owner_id::text||'/'||f.id::text
 and public.app9012_ks_source(f.household_id,f.person_id,f.source_kind,f.source_id,writing)
 and case when writing then f.owner_id=auth.uid() and f.state='pending'
 else (f.owner_id=auth.uid() and f.state in ('pending','ready')) or (f.state='ready' and f.visibility='family') end);
$$;
revoke all on function public.app9012_ks_object(text,boolean) from public,anon;
grant execute on function public.app9012_ks_object(text,boolean) to authenticated;

create function public.app9012_keepsakes(p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid(); h uuid; p text; a jsonb:=coalesce(p_payload,'{}');
 idv uuid; f public.app9012_ks_files; n public.app9012_ks_nuggets; l public.app9012_ks_letters;
 lk public.app9012_ks_locks; result jsonb; meta jsonb; dest uuid; destname text; myname text;
 token text; pin text; unlocked boolean; kind text; mim text; sz bigint;
 offv integer:=greatest(0,least(coalesce((p_payload->>'offset')::integer,0),100000));
begin
 if u is null then raise exception 'authentication_required'; end if;
 select hp.household_id,hp.person_id into h,p from public.app9012_household_people hp
 where hp.linked_user_id=u and hp.link_status='linked' limit 1;
 if h is null or not public.app9012_media_access(h) then raise exception 'family_pilot_not_enabled'; end if;
 if a ? 'household_id' and a->>'household_id'<>h::text then raise exception 'account_changed'; end if;
 select coalesce(nullif(x->>'name',''),'Family member') into myname from public.app9012_households hh
 cross join lateral jsonb_array_elements(hh.people) x where hh.id=h and x->>'id'=p limit 1;
 if p_action='context' then return jsonb_build_object('user_id',u,'person_id',p,'household_id',h,'version',1); end if;
 if a ? 'id' then idv:=(a->>'id')::uuid; end if;

 if p_action='file_begin' then
   kind:=a->>'source_kind'; mim:=a->>'mime'; sz:=(a->>'bytes')::bigint;
   if kind not in ('waymark','chart') or not public.app9012_ks_source(h,p,kind,a->>'source_id',true) then raise exception 'save_your_source_first'; end if;
   if not ((mim in ('image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif') and sz<=12582912)
     or (mim in ('video/mp4','video/webm','video/quicktime') and sz<=47185920)
     or (mim in ('application/pdf','text/plain','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv') and sz<=20971520)) then raise exception 'unsupported_file'; end if;
   -- Serialise per account to enforce the per-source attachment limit.
   perform pg_advisory_xact_lock(hashtextextended(u::text,0));
   if not exists(select 1 from public.app9012_ks_files where id=idv) and
     (select count(*) from public.app9012_ks_files where owner_id=u and source_kind=kind and source_id=a->>'source_id' and state<>'hidden')>=20 then raise exception 'attachment_limit_20'; end if;
   insert into public.app9012_ks_files(id,household_id,owner_id,person_id,source_kind,source_id,filename,mime,bytes,visibility)
     values(idv,h,u,p,kind,a->>'source_id',a->>'filename',mim,sz,coalesce(a->>'visibility','private')) on conflict(id) do nothing;
   select * into strict f from public.app9012_ks_files where id=idv for update;
   if f.owner_id<>u or f.household_id<>h or f.source_kind<>kind or f.source_id<>a->>'source_id' or f.mime<>mim or f.bytes<>sz or f.filename<>a->>'filename' or f.visibility<>coalesce(a->>'visibility','private') or f.state='hidden' then raise exception 'upload_conflict'; end if;
   return jsonb_build_object('path',h::text||'/'||u::text||'/'||idv::text,'state',f.state);
 elsif p_action='file_finish' then
   select * into strict f from public.app9012_ks_files where id=idv and owner_id=u and household_id=h for update;
   if f.state='hidden' or not public.app9012_ks_source(h,p,f.source_kind,f.source_id,true) then raise exception 'source_unavailable'; end if;
   select metadata into meta from storage.objects where bucket_id='9012-entry-files' and name=h::text||'/'||u::text||'/'||idv::text and owner_id=u::text;
   if meta is null or coalesce((meta->>'size')::bigint,0)<>f.bytes or lower(split_part(coalesce(meta->>'mimetype',''),';',1))<>f.mime then raise exception 'upload_not_verified'; end if;
   update public.app9012_ks_files set state='ready' where id=idv;
   return jsonb_build_object('ready',true);
 elsif p_action='file_hide' then
   update public.app9012_ks_files set state='hidden' where id=idv and owner_id=u and household_id=h;
   if not found then raise exception 'not_owned'; end if; return jsonb_build_object('hidden',true);
 elsif p_action='file_list' then
   select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at),'[]') into result from (
     select af.*,af.household_id::text||'/'||af.owner_id::text||'/'||af.id::text as path
     from public.app9012_ks_files af where af.household_id=h and af.source_kind=a->>'source_kind' and af.source_id=a->>'source_id'
     and af.state='ready' and (af.owner_id=u or af.visibility='family')
     and public.app9012_ks_source(h,af.person_id,af.source_kind,af.source_id,false) order by af.created_at limit 20
   ) q; return result;
 elsif p_action='nugget_save' then
   if nullif(a->>'source_id','') is not null and not public.app9012_ks_source(h,p,'waymark',a->>'source_id',true) then raise exception 'source_unavailable'; end if;
   insert into public.app9012_ks_nuggets(id,household_id,owner_id,person_id,body,source_id,visibility)
     values(idv,h,u,p,trim(a->>'body'),nullif(a->>'source_id',''),coalesce(a->>'visibility','private'))
     on conflict(id) do update set body=excluded.body,source_id=excluded.source_id,visibility=excluded.visibility,updated_at=now()
     where public.app9012_ks_nuggets.owner_id=u and public.app9012_ks_nuggets.household_id=h and not public.app9012_ks_nuggets.archived
     returning * into n;
   if n.id is null then raise exception 'not_owned'; end if; return to_jsonb(n);
 elsif p_action='nugget_archive' then
   update public.app9012_ks_nuggets set archived=true,updated_at=now() where id=idv and owner_id=u and household_id=h;
   if not found then raise exception 'not_owned'; end if; return jsonb_build_object('archived',true);
 elsif p_action='nugget_list' then
   select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id),'[]') into result from (
     select gn.* from public.app9012_ks_nuggets gn where gn.household_id=h and not gn.archived and (gn.owner_id=u or gn.visibility='family')
     order by gn.created_at desc,gn.id limit 50 offset offv
   ) q; return result;
 end if;

 -- Unread count never returns message contents, names, PIN or unlock token.
 if p_action='letter_count' then
   return jsonb_build_object('count',(select count(*) from public.app9012_ks_letters where recipient_id=u and opened_at is null and recalled_at is null));
 end if;
 insert into public.app9012_ks_locks(user_id) values(u) on conflict do nothing;
 select * into strict lk from public.app9012_ks_locks where user_id=u for update;
 if p_action='letter_lock_status' then return jsonb_build_object('locked',lk.pin_hash is not null); end if;
 if p_action='letter_unlock' then
   if lk.blocked_until>now() then return jsonb_build_object('error','Too many attempts. Please wait 15 minutes.'); end if;
   pin:=coalesce(a->>'pin','');
   if lk.pin_hash is not null and (length(pin)>128 or extensions.crypt(pin,lk.pin_hash)<>lk.pin_hash) then
     update public.app9012_ks_locks set failures=failures+1,blocked_until=case when failures+1>=5 then now()+interval '15 minutes' else null end where user_id=u;
     return jsonb_build_object('error','Passcode not accepted.');
   end if;
   update public.app9012_ks_locks set failures=0,blocked_until=null where user_id=u;
   delete from public.app9012_ks_unlocks where user_id=u and expires_at<now();
   token:=encode(extensions.gen_random_bytes(32),'hex');
   insert into public.app9012_ks_unlocks values(u,encode(extensions.digest(token,'sha256'),'hex'),now()+interval '10 minutes');
   return jsonb_build_object('token',token);
 end if;
 unlocked:=lk.pin_hash is null or exists(select 1 from public.app9012_ks_unlocks where user_id=u
   and token_hash=encode(extensions.digest(coalesce(a->>'token',''),'sha256'),'hex') and expires_at>now());
 if not unlocked then raise exception 'letters_locked'; end if;
 if p_action='letter_lock' then
   delete from public.app9012_ks_unlocks where user_id=u; return jsonb_build_object('locked',true);
 elsif p_action='letter_set_pin' then
   pin:=coalesce(a->>'pin','');
   if pin<>'' and (length(pin)<6 or length(pin)>64 or octet_length(pin)>72) then raise exception 'use_6_to_64_characters_max_72_bytes'; end if;
   update public.app9012_ks_locks set pin_hash=case when pin='' then null else extensions.crypt(pin,extensions.gen_salt('bf',10)) end,failures=0,blocked_until=null where user_id=u;
   delete from public.app9012_ks_unlocks where user_id=u; return jsonb_build_object('saved',true);
 elsif p_action='letter_recipients' then
   select coalesce(jsonb_agg(q),'[]') into result from (
     select hp.linked_user_id as user_id,hp.person_id,coalesce(x->>'name','Family member') as name
     from public.app9012_household_people hp join public.app9012_households hh on hh.id=hp.household_id
     cross join lateral jsonb_array_elements(hh.people) x
     where hp.household_id=h and hp.link_status='linked' and hp.linked_user_id is not null and hp.linked_user_id<>u and x->>'id'=hp.person_id
     order by x->>'name',hp.person_id
   ) q; return result;
 elsif p_action='letter_send' then
   dest:=(a->>'recipient_id')::uuid;
   select coalesce(x->>'name','Family member') into destname from public.app9012_household_people hp
     join public.app9012_households hh on hh.id=hp.household_id cross join lateral jsonb_array_elements(hh.people) x
     where hp.household_id=h and hp.link_status='linked' and hp.linked_user_id=dest and dest<>u and x->>'id'=hp.person_id limit 1;
   if destname is null then raise exception 'recipient_needs_own_linked_account'; end if;
   insert into public.app9012_ks_letters(id,household_id,sender_id,recipient_id,sender_name,recipient_name,body,hand)
     values(idv,h,u,dest,coalesce(myname,'Family member'),destname,trim(a->>'body'),a->>'hand') on conflict(id) do nothing;
   select * into strict l from public.app9012_ks_letters where id=idv;
   if l.sender_id<>u or l.household_id<>h or l.recipient_id<>dest or l.body<>trim(a->>'body') or l.hand<>a->>'hand' then raise exception 'letter_request_conflict'; end if;
   return jsonb_build_object('sent',true,'id',idv);
 elsif p_action='letter_list' then
   select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id),'[]') into result from (
     select id,sender_id,recipient_id,sender_name,recipient_name,created_at,opened_at,closed_at,recalled_at
     from public.app9012_ks_letters where (recipient_id=u and recalled_at is null) or sender_id=u
     order by created_at desc,id limit 50 offset offv
   ) q; return result;
 elsif p_action in ('letter_open','letter_recall','letter_close') then
   -- Same row lock for open and recall: exactly one transition can win.
   select * into strict l from public.app9012_ks_letters where id=idv and (sender_id=u or recipient_id=u) for update;
   if p_action='letter_recall' then
     if l.sender_id<>u or l.opened_at is not null then raise exception 'already_opened_or_not_sender'; end if;
     update public.app9012_ks_letters set recalled_at=coalesce(recalled_at,now()) where id=idv;
     return jsonb_build_object('recalled',true);
   elsif p_action='letter_close' then
     if l.recipient_id<>u or l.opened_at is null or l.recalled_at is not null then raise exception 'not_opened_recipient'; end if;
     update public.app9012_ks_letters set closed_at=coalesce(closed_at,now()) where id=idv;
     return jsonb_build_object('archived',true);
   else
     if l.recalled_at is not null then raise exception 'letter_recalled'; end if;
     if l.recipient_id=u then
       update public.app9012_ks_letters set opened_at=coalesce(opened_at,now()) where id=idv returning * into l;
     end if;
     return to_jsonb(l);
   end if;
 end if;
 raise exception 'unknown_action';
end;
$$;
revoke all on function public.app9012_keepsakes(text,jsonb) from public,anon;
grant execute on function public.app9012_keepsakes(text,jsonb) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values(
 '9012-entry-files','9012-entry-files',false,47185920,
 array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','video/mp4','video/webm','video/quicktime','application/pdf','text/plain','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv']
);
create policy ks_guard on storage.objects as restrictive for all to authenticated
 using(bucket_id<>'9012-entry-files' or public.app9012_ks_object(name,false))
 with check(bucket_id<>'9012-entry-files' or public.app9012_ks_object(name,true));
create policy ks_anon_guard on storage.objects as restrictive for all to anon
 using(bucket_id<>'9012-entry-files') with check(bucket_id<>'9012-entry-files');
create policy ks_object_read on storage.objects for select to authenticated
 using(bucket_id='9012-entry-files' and public.app9012_ks_object(name,false));
create policy ks_object_insert on storage.objects for insert to authenticated
 with check(bucket_id='9012-entry-files' and public.app9012_ks_object(name,true));
create policy ks_no_overwrite on storage.objects as restrictive for update to public
 using(bucket_id<>'9012-entry-files') with check(bucket_id<>'9012-entry-files');
create policy ks_no_direct_delete on storage.objects as restrictive for delete to public using(bucket_id<>'9012-entry-files');
notify pgrst,'reload schema';
commit;
