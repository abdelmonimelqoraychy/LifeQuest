# Hunter Classes V1 local test

This harness is pinned to the synthetic local project `lifequest-hunter-classes-v1-20261015` only. It has no remote-link, reset, drop, volume-delete, import, or personal-stack command.

`node tools/hunter-classes/stack.cjs prepare` creates the previously absent project folder under `C:/Users/hp/myproject`, copies the 27 existing migrations byte-for-byte, and writes a local-only configuration. It does not need or start Docker. `preflight` requires the Linux Docker engine and checks resources filtered by this exact project name and the fixed ports before `start`.

For the retained test stack, `resume-preflight` verifies that only its expected volume remains, its target containers/networks are absent, and its fixed ports are free; `resume` then starts only that exact project without reset or volume cleanup.

The test sequence is deliberately two-stage: install the 27 historical migrations, create synthetic Auth fixtures and save an old-shape onboarding draft/profile baseline, then call `append-class-migration` to verify the 27-version history and append only migration 28. `class-check.cjs` exercises the profile RPC with real local Auth JWTs and SQL reads limited to `example.test` fixtures. `prepare-frontend`, `build-frontend.cjs`, and `browser-check.cjs` use a copy without any `.env` files or `.next` output. The production build uses placeholder local URL/key values; the Chrome run obtains the actual local API settings from this exact test project. `stop` stops only this project and preserves its volumes.

The fixed browser port is `31790`; Supabase uses shadow/API/DB/Studio/Mailpit ports `65020–65024`. Credentials remain in process memory and are never printed or written to reports.


`class-rpc-repeat-check.cjs` replays Auth/onboarding, class RPC idempotence/concurrency, A/B isolation, effective ACLs and progression invariants using two new `example.test` actors on the pinned stack; it compares aggregate deltas and never resets or deletes fixtures.

`browser-check.cjs <label> --trace` uses a fresh synthetic account, confirms its email, logs out, signs in through `/login`, and waits for rendered onboarding/class state rather than sleeping for a fixed interval. `instrument-bootstrap.cjs instrument|restore` adds/removes temporary Auth, snapshot, route, Proxy and client markers only in `frontend-isolated`, and `restore` checks byte-for-byte source equality before a clean build. Browser reports and traces remain under the ignored `.results` directory.
