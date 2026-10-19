-- Grant only the new source-link column to the existing command owner.
-- The owner role already has column-level INSERT for the original Boss fields.
grant lifequest_schema_owner to postgres with inherit false,set true;
set local role lifequest_schema_owner;
grant insert(source_mind_node_id) on lifequest.boss_missions to lifequest_command_owner;
reset role;
grant lifequest_schema_owner to postgres with inherit false,set false;
