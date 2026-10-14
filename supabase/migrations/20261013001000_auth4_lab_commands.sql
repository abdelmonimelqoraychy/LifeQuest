grant lifequest_schema_owner,lifequest_command_owner to postgres with inherit false,set true;
grant create on schema public to lifequest_command_owner;
set local role lifequest_command_owner;
create function public.lifequest_lab_command(expected_actor uuid,request_id uuid,kind text,payload jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' set statement_timeout='5s' as $$
declare ctx jsonb; actor uuid; instant timestamptz; ident text; parent text; row_data record; child record;
 title text; content text; tag text; notes text; url text; topic text; day date;
 wins text; challenges text; gratitude text; tomorrow text; prompt text; response text; desired boolean;
 changed boolean:=true; detail jsonb; n integer:=0;
begin
 case kind
 when 'idea.create' then perform lifequest.payload_shape(payload,array['title','content','tag']);
 when 'idea.set_archived' then perform lifequest.payload_shape(payload,array['id','expectedRevision','archived']);
 when 'idea.delete','node.delete','resource.delete','journal.delete' then perform lifequest.payload_shape(payload,array['id','expectedRevision']);
 when 'node.create' then perform lifequest.payload_shape(payload,array['title'],array['parentId']);
 when 'resource.create' then perform lifequest.payload_shape(payload,array['title','notes','url','topic']);
 when 'resource.set_mastered' then perform lifequest.payload_shape(payload,array['id','expectedRevision','mastered']);
 when 'journal.save' then perform lifequest.payload_shape(payload,array['date','wins','challenges','gratitude','tomorrow','expectedRevision']);
 when 'creativity.submit' then perform lifequest.payload_shape(payload,array['prompt','response']);
 else raise exception 'COMMAND_UNKNOWN' using errcode='PT400';end case;
 if payload?'id' then ident:=lifequest.input_text(payload,'id',512,true);end if;
 if payload?'expectedRevision' and payload->'expectedRevision'<>'null'::jsonb then perform lifequest.target_revision(payload);end if;
 if payload?'title' then title:=lifequest.js_trim(lifequest.input_text(payload,'title',120,true));end if;
 if kind='idea.create' then content:=lifequest.input_text(payload,'content',10000);tag:=lifequest.input_text(payload,'tag',80);end if;
 if kind='node.create' and payload?'parentId' and payload->'parentId'<>'null'::jsonb then parent:=lifequest.input_text(payload,'parentId',512,true);end if;
 if kind='resource.create' then
  notes:=lifequest.input_text(payload,'notes',10000);url:=lifequest.input_text(payload,'url',2048);topic:=lifequest.input_text(payload,'topic',120);
  if not lifequest.resource_url_allowed(url) then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
 end if;
 if kind='journal.save' then
  day:=lifequest.input_date(payload,'date');wins:=lifequest.input_text(payload,'wins',10000);challenges:=lifequest.input_text(payload,'challenges',10000);
  gratitude:=lifequest.input_text(payload,'gratitude',10000);tomorrow:=lifequest.input_text(payload,'tomorrow',10000);
 end if;
 if kind='creativity.submit' then
  prompt:=lifequest.input_text(payload,'prompt',200,true);response:=lifequest.input_text(payload,'response',10000,true);
  if prompt<>all(array['Imagine dix usages inattendus pour un objet courant.','Ecris une histoire en exactement six phrases.','Propose trois solutions originales a un probleme quotidien.',
   'Dessine ou decris une invention pour economiser du temps.','Associe deux domaines sans rapport pour creer une idee.','Transforme une mauvaise habitude en mecanique de jeu.',
   'Invente un nouveau defi pour ton futur toi.','Concois une application utile en cinq fonctionnalites.','Redige une scene ou un personnage surmonte sa peur.','Trouve cinq variantes pour ameliorer un projet existant.']) then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
 end if;
 if kind in ('idea.set_archived','resource.set_mastered') then
  if jsonb_typeof(payload->case when kind='idea.set_archived' then 'archived' else 'mastered' end) is distinct from 'boolean' then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
  desired:=(payload->>case when kind='idea.set_archived' then 'archived' else 'mastered' end)::boolean;
 end if;
 ctx:=lifequest.command_begin(expected_actor,request_id,kind,payload);if ctx?'replay' then return ctx->'replay';end if;
 actor:=(ctx->>'actor')::uuid;instant:=(ctx->>'now')::timestamptz;
 case kind
 when 'idea.create' then
  ident:=gen_random_uuid()::text;insert into lifequest.ideas(user_id,id,title,content,tag,archived,created_at,sort_position)
   values(actor,ident,title,content,tag,false,instant,lifequest.next_position(actor,'ideas',true));detail:=jsonb_build_object('id',ident,'revision','0');
 when 'idea.set_archived','idea.delete' then
  select * into row_data from lifequest.ideas where user_id=actor and id=ident for update;
  if not found then raise exception 'NOT_FOUND' using errcode='PT404';end if;
  changed:=kind='idea.delete' or row_data.archived<>desired;
  if changed then perform lifequest.assert_revision(row_data.revision,payload);
   if kind='idea.delete' then delete from lifequest.ideas where user_id=actor and id=ident;
   else update lifequest.ideas set archived=desired,revision=revision+1 where user_id=actor and id=ident;end if;
  end if;detail:=jsonb_build_object('id',ident,'revision',(row_data.revision+case when changed then 1 else 0 end)::text);
 when 'node.create' then
  if parent is not null and not exists(select 1 from lifequest.mind_nodes where user_id=actor and id=parent) then parent:=null;end if;
  ident:=gen_random_uuid()::text;insert into lifequest.mind_nodes(user_id,id,title,parent_id,x,y,sort_position)
   values(actor,ident,title,parent,0,0,lifequest.next_position(actor,'mind_nodes'));detail:=jsonb_build_object('id',ident,'parentId',parent,'revision','0');
 when 'node.delete' then
  select * into row_data from lifequest.mind_nodes where user_id=actor and id=ident for update;
  if not found then raise exception 'NOT_FOUND' using errcode='PT404';end if;perform lifequest.assert_revision(row_data.revision,payload);
  for child in select id from lifequest.mind_nodes where user_id=actor and parent_id=ident order by id for update loop
   update lifequest.mind_nodes set parent_id=null,revision=revision+1 where user_id=actor and id=child.id;n:=n+1;
  end loop;
  delete from lifequest.mind_nodes where user_id=actor and id=ident;detail:=jsonb_build_object('id',ident,'rootedChildren',n);
 when 'resource.create' then
  ident:=gen_random_uuid()::text;insert into lifequest.resources(user_id,id,title,notes,url,topic,mastered,created_at,sort_position)
   values(actor,ident,title,notes,url,topic,false,instant,lifequest.next_position(actor,'resources',true));detail:=jsonb_build_object('id',ident,'revision','0');
 when 'resource.set_mastered','resource.delete' then
  select * into row_data from lifequest.resources where user_id=actor and id=ident for update;
  if not found then raise exception 'NOT_FOUND' using errcode='PT404';end if;changed:=kind='resource.delete' or row_data.mastered<>desired;
  if changed then perform lifequest.assert_revision(row_data.revision,payload);
   if kind='resource.delete' then delete from lifequest.resources where user_id=actor and id=ident;
   else update lifequest.resources set mastered=desired,revision=revision+1 where user_id=actor and id=ident;end if;
  end if;detail:=jsonb_build_object('id',ident,'revision',(row_data.revision+case when changed then 1 else 0 end)::text);
 when 'journal.save' then
  if day>(instant at time zone (ctx->>'zone'))::date then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
  select * into row_data from lifequest.journal_entries where user_id=actor and local_date=day for update;
  if found then
   perform lifequest.assert_revision(row_data.revision,payload);ident:=row_data.id;
   changed:=row(row_data.wins,row_data.challenges,row_data.gratitude,row_data.tomorrow) is distinct from row(wins,challenges,gratitude,tomorrow);
   if changed then update lifequest.journal_entries set wins=lifequest_lab_command.wins,challenges=lifequest_lab_command.challenges,gratitude=lifequest_lab_command.gratitude,tomorrow=lifequest_lab_command.tomorrow,revision=revision+1 where user_id=actor and id=ident;end if;
   detail:=jsonb_build_object('id',ident,'revision',(row_data.revision+case when changed then 1 else 0 end)::text);
  else
   if payload->'expectedRevision'<>'null'::jsonb then raise exception 'REVISION_CONFLICT' using errcode='PT409';end if;
   ident:=gen_random_uuid()::text;insert into lifequest.journal_entries(user_id,id,local_date,wins,challenges,gratitude,tomorrow,sort_position)
    values(actor,ident,day,wins,challenges,gratitude,tomorrow,lifequest.next_position(actor,'journal_entries',true));detail:=jsonb_build_object('id',ident,'revision','0');
  end if;
 when 'journal.delete' then
  select * into row_data from lifequest.journal_entries where user_id=actor and id=ident for update;
  if not found then raise exception 'NOT_FOUND' using errcode='PT404';end if;perform lifequest.assert_revision(row_data.revision,payload);
  delete from lifequest.journal_entries where user_id=actor and id=ident;detail:=jsonb_build_object('id',ident);
 when 'creativity.submit' then
  ident:=gen_random_uuid()::text;insert into lifequest.creativity_challenges(user_id,id,prompt,response,occurred_at,completed,sort_position)
   values(actor,ident,prompt,response,instant,true,lifequest.next_position(actor,'creativity_challenges',true));detail:=jsonb_build_object('id',ident,'revision','0');
 end case;
 return lifequest.command_end(ctx,changed,array['lab'],detail);
end; $$;
revoke all on function public.lifequest_lab_command(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.lifequest_lab_command(uuid,uuid,text,jsonb) to authenticated;
reset role;
revoke create on schema public from lifequest_command_owner;
grant lifequest_schema_owner,lifequest_command_owner to postgres with inherit false,set false;
