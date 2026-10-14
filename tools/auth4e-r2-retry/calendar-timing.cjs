const { Client } = require('../auth2/node_modules/pg');
const stack = require('./stack.cjs');
(async () => {
 const db = new URL(stack.status().DB_URL); db.username = 'supabase_admin';
 const client = new Client({ connectionString: db.href }); await client.connect();
 try {
  const row = (await client.query('select zone,probes from lifequest.calendar_activation limit 1')).rows[0];
  const start = Date.now(); await client.query('select lifequest.calendar_digest($1,$2::jsonb)', [row.zone, JSON.stringify(row.probes)]);
  console.log(JSON.stringify({ probeCount: row.probes.length, digestMilliseconds: Date.now() - start }));
 } finally { await client.end(); }
})().catch(() => { console.log('Read-only calendar timing failed safely'); process.exitCode = 1; });
