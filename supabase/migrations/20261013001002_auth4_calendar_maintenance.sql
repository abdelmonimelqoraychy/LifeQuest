-- Environment maintenance is distinct from gameplay. Enables a trusted migration
-- role to activate a verified calendar without superuser filesystem access.
grant lifequest_schema_owner,lifequest_command_owner to postgres with inherit false,set true;
set local role lifequest_schema_owner;
create policy calendar_maintenance_read on lifequest.calendar_activation for select to lifequest_schema_owner using(true);
create policy calendar_maintenance_insert on lifequest.calendar_activation for insert to lifequest_schema_owner with check(true);
create policy calendar_maintenance_update on lifequest.calendar_activation for update to lifequest_schema_owner using(true) with check(true);
-- No DELETE policy, no change to the twenty Hunter table policies, no public grant.
reset role;
set local role lifequest_command_owner;
grant execute on function lifequest.calendar_digest(text,jsonb) to lifequest_schema_owner;
reset role;
grant lifequest_schema_owner,lifequest_command_owner to postgres with inherit false,set false;
