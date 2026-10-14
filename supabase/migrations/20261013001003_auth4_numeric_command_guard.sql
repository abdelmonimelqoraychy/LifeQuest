-- Explicit command rejection for the confirmed unsupported minimum subnormal.
-- Native float8 can represent its bit pattern; rules_progress arithmetic underflows.
grant lifequest_schema_owner,lifequest_command_owner to postgres with inherit false,set true;
set local role lifequest_schema_owner;
grant create on schema lifequest to lifequest_command_owner;
reset role;
set local role lifequest_command_owner;
create function lifequest.assert_reward_number(value numeric) returns void
language plpgsql immutable strict set search_path='' as $$
declare bits text;
begin
 if not(value>=0 and value<'Infinity'::numeric) then raise exception 'UNSUPPORTED_NUMBER' using errcode='PT409';end if;
 bits:=encode(float8send(value::double precision),'hex');
 if value>0 and bits in ('0000000000000000','0000000000000001') then raise exception 'UNSUPPORTED_NUMBER' using errcode='PT409';end if;
end; $$;
create or replace function lifequest.credit(actor uuid,source text,source_id text,period text,base numeric,attribute text,instant timestamptz,zone text,title text,arc text default null) returns jsonb
language plpgsql volatile set search_path='' as $$
declare receipt record; days date[]; streak integer; reward integer; before_level integer; after_level integer; ident text:=gen_random_uuid()::text;
 ref text:=case when source='quest' then source_id else 'lifequest:activity:'||source||':'||source_id end;
begin
 if source<>all(array['quest','boss','focus']) then raise exception 'SOURCE_INVALID';end if;
 select * into receipt from lifequest.xp_events where user_id=actor and source_ref=ref and period_key=period;
 if found then return jsonb_build_object('credited',false,'xp',receipt.awarded_xp::text,'receiptId',receipt.id);end if;
 perform lifequest.assert_reward_number(base);
 perform lifequest.assert_reward_number((select total_xp from lifequest.hunters where user_id=actor));
 -- Refuse finite numeric values not representable by the tested JS/float8 path.
 select (lifequest.rules_progress(total_xp::double precision)->>'level')::integer into before_level from lifequest.hunters where user_id=actor;
 select coalesce(array_agg((occurred_at at time zone zone)::date),'{}') into days from lifequest.xp_events where user_id=actor and source_kind='quest';
 streak:=lifequest.rules_streak(days,(instant at time zone zone)::date);reward:=lifequest.rules_reward(base,streak);
 insert into lifequest.xp_events(user_id,id,source_ref,source_id,source_kind,period_key,awarded_xp,attribute,occurred_at,title_snapshot,arc_id_snapshot,rules_version,provenance,sort_position)
 values(actor,ident,ref,source_id,source,period,reward,attribute,instant,title,arc,'lifequest-v1','cloud',lifequest.next_position(actor,'xp_events'));
 update lifequest.hunters set total_xp=total_xp+reward where user_id=actor;
 select (lifequest.rules_progress(total_xp::double precision)->>'level')::integer into after_level from lifequest.hunters where user_id=actor;
 perform lifequest.sync_titles(actor,zone,instant);
 return jsonb_build_object('credited',true,'xp',reward::text,'receiptId',ident,'levelBefore',before_level,'levelAfter',after_level);
end; $$;
revoke all on function lifequest.assert_reward_number(numeric),lifequest.credit(uuid,text,text,text,numeric,text,timestamptz,text,text,text) from public,anon,authenticated;
reset role;
set local role lifequest_schema_owner;
revoke create on schema lifequest from lifequest_command_owner;
reset role;
grant lifequest_schema_owner,lifequest_command_owner to postgres with inherit false,set false;
