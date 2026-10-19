# Mind Map to Boss V1 fictional validation

This harness targets only the new local project `lifequest-mind-map-boss-v1-20261018` under `C:\Users\hp\myproject`. It copies the repository's exact 31 migrations, records SHA-256 values, and refuses a pre-existing target directory, matching Docker resources, occupied ports, a remote project link, or migration drift.

Run `node tools/mind-map-boss/stack.cjs prepare`, then `start`, `migrate`, and `node tools/mind-map-boss/check.cjs`. `start` and `migrate` never reset the database. The RPC harness creates confirmed `example.test` identities and synthetic Hunter rows, validates only UTC calendar behavior against the existing TypeScript oracle and PostgreSQL, then exercises the existing Auth, snapshot, Lab, and Boss RPCs. It writes a sanitized group summary under `.results/`.

Validation found two candidate migration issues before the end-to-end pass: an ambiguous PL/pgSQL `parent_id` reference and a missing effective `INSERT` grant for the new source-link column. Additive migrations 030 and 031 repair these. The harness appends each pending migration only after verifying the prior history and source hashes.

`node tools/mind-map-boss/stack.cjs stop` stops only this project and retains its Docker volume. There is deliberately no reset, delete, prune, or volume removal command. Do not point this harness at a personal or historical project.

## Validation result — 18 October 2026

The fictional stack passed four SQL/Auth/RPC groups across all 31 migrations. They verify the nullable source FK and unique index, the limited source-column grant, private helper permissions and RLS, confirmed synthetic Auth, ordered-branch conversion, same-request idempotence, stale revision and membership conflicts, duplicate/delete refusal, legacy unlinked Boss compatibility, snapshot linkage, and unchanged XP/ledger. The fixture uses only `example.test` accounts. The final stack was stopped; its single test volume remains retained and its test ports are free.

The isolated frontend copy passed TypeScript, ESLint, all 197 frontend tests, and the Webpack production build. Chrome passed the production flow at desktop and mobile sizes: login, Mind Map branch preview, edited title/objectives/weights, explicit confirmation, stale-branch refusal, offline retry using the same request ID, and a double-submit producing one Boss. The snapshot links each Boss to its source and the Hunter remains at zero XP with no ledger event. Mobile has one-column steps and no horizontal overflow. Captures and a sanitized result summary are kept under the ignored `.results/` directory.

The first browser attempts exposed harness timing defects: CDP waits returned DOM objects instead of booleans, and the login form could be submitted before React hydration. The waits now use boolean predicates and wait for React to attach before submitting. After that change, the flow passed; no Auth, bootstrap, or snapshot defect was reproduced. Impeccable detection returned no findings after the weighted bar switched from animating `width` to `transform`.

Migrations 029–031 were installed only on the fictional stack. Migration 029 adds the nullable source link, branch validation and existing-command integration; 030 fixes the helper's PL/pgSQL variable-name collision; 031 grants the command owner INSERT on only the new source column. The migration uses guarded function-definition replacements, so source-shape drift intentionally aborts rather than silently patching an unexpected RPC definition. No personal stack, Hunter, Boss, migration history, volume, backup, or account was accessed or changed. Personal activation remains a separate operation and is not authorized by this test result.
