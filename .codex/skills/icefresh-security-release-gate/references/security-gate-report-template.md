# IceFresh Security Gate Report Template

Use this template for final Security Gate output. Keep the user's exact RC/version in the title.

# SECURITY GATE — <RC VERSION / SCOPE>

**Exact artifact/hash: PASS/FAIL**  
Evidence level: DYNAMIC/LIVE/STATIC/CI/NOT RUN  
- Filename: `<candidate>`
- Byte size: `<size>`
- Expected SHA-256: `<hash>`
- Observed SHA-256: `<hash>`
- Artifact source/ID: `<source>`

**Trace/evidence integrity: PASS/FAIL**  
Evidence level: ...  
- Trace branch: `<branch>`
- Claimed final commit: `<sha>`
- Observed branch HEAD: `<sha>`
- Finalization/manifest scope: `<evidence-only | source-changing>`
- CI run/job: `<ids>`
- Exact artifact identity verified before extraction/build: YES/NO/NOT RUN

**Scope of changes: PASS/FAIL**  
Evidence level: ...  
Changed security-sensitive surfaces:
- `<file/category>`

State explicitly whether application/business logic, database schema, auth, runtime config, tests, typecheck/lint/build config, dependencies, or only evidence files changed.

**AI authentication: PASS/FAIL/NOT APPLICABLE**  
Evidence level: ...  
- unauthenticated request behavior;
- token validation boundary;
- active membership validation;
- missing/invalid env behavior.

**AI authorization boundaries: PASS/FAIL/NOT APPLICABLE**  
Evidence level: ...  
- staff scope;
- owner/admin scope;
- server-side role source;
- finance/management isolation;
- mock limitations.

**AI rate limiting: PASS/FAIL/NOT APPLICABLE**  
Evidence level: ...  
- hourly/user limit;
- monthly/org limit;
- concurrency/atomic reservation;
- client ability to mutate usage history;
- provider call ordering.

**Secrets exposure: PASS/FAIL**  
Evidence level: ...  
- repository secret scan;
- frontend/bundle scan;
- service-role/provider key boundary;
- provider key transport.

**Supabase env handling: PASS/FAIL/NOT APPLICABLE**  
Evidence level: ...

**Cloudflare bindings: PASS/FAIL/NOT APPLICABLE**  
Evidence level: ...  
- ASSETS;
- DB/D1;
- other bindings;
- generated binding types;
- committed vars/secrets.

**Preview/production isolation: PASS/FAIL/NOT APPLICABLE**  
Evidence level: ...  
- preview resource IDs;
- `remote:true`;
- loopback/local mode;
- production config separation.

**RLS: PASS/FAIL/NOT APPLICABLE**  
Evidence level: ...  
- protected tables;
- tenant predicates;
- direct grants;
- column-level self-escalation controls.

**RPC authorization: PASS/FAIL/NOT APPLICABLE**  
Evidence level: ...  
- PUBLIC/anon EXECUTE;
- authenticated EXECUTE;
- server-side active membership/role checks;
- SECURITY DEFINER/search_path.

**Issue #4 snapshot protection: PASS/FAIL/NOT APPLICABLE**  
Evidence level: ...  
- exact current snapshot edit;
- 3→2;
- 2→3;
- stale reject;
- partial reject;
- forged `_expected_item_count`;
- staff/manager boundaries;
- atomic rollback;
- control-order post-rollback baseline.

**Direct-write bypass: PASS/FAIL**  
Evidence level: ...  
- browser `.insert/.update/.delete/.upsert` scan;
- protected table grants;
- alternate privileged write paths.

**CORS: PASS/FAIL/NOT APPLICABLE**  
Evidence level: ...

**Edge Function/Deno security: PASS/FAIL/NOT APPLICABLE**  
Evidence level: ...

**Test integrity: PASS/FAIL**  
Evidence level: ...  
- deleted/weakened security assertions;
- test-only mocks;
- skipped/todo tests;
- independent targeted tests.

**Typecheck integrity: PASS/FAIL**  
Evidence level: ...  
- app typecheck;
- Worker typecheck;
- Wrangler-generated bindings;
- Supabase/Deno check;
- exclusions/skipLibCheck changes.

**Build/dependencies: PASS/FAIL/NOT RUN**  
Evidence level: ...  
- `npm ci`;
- lint;
- typecheck;
- build;
- tests;
- built-preview smoke;
- dependency/vulnerability scan if applicable.

## Security findings

For each finding:

`<SEVERITY>-<NN> — <title>`
- Affected boundary: ...
- Evidence: ...
- Impact/reachability: ...
- Release effect: blocking / non-blocking
- Required Development action: ...

If there are no reportable findings, say so explicitly. Keep INFO observations separate from vulnerabilities.

## Evidence and proof gaps

Summarize independently obtained evidence, e.g.:

- exact artifact locally hashed;
- Git branch/commit verified;
- CI workflow and job logs inspected;
- live Supabase functions/RLS/grants queried;
- transaction-scoped regressions rolled back;
- post-rollback control record re-read;
- secret/frontend scans performed;
- source/static tests run;
- checks that were NOT RUN and why.

Never describe Development's unsupported assertion as independent evidence.

## Release safety statement

`Production deployment was NOT performed by this Security Gate.`

# FINAL VERDICT: **`PASS TO QA RETEST`**

or

# FINAL VERDICT: **`RETURN TO DEVELOPMENT`**
