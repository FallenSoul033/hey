# RC1.6.2.1 Desktop Modal Hotfix — Finalization Evidence

Candidate: `IceFresh_RC1_6_2_1_Canonical_QA.zip`

- Google Drive ID: `15UY2z1mWMdF1YxYK_0cJUzlI1_UOoY0u`
- Byte size: `2184261`
- SHA-256: `448a0935bf7e6e78c8d508dc2ac6cbf5d3f5647169061846ee1b104cbd3969e3`
- Candidate bytes changed after published SHA: **NO**
- Admin byte-level diff from RC1.6.2: only `public/admin.css`
- Security-sensitive candidate files changed: **NO**
- Production deployment: **NOT PERFORMED**

## Independent exact-artifact gate

GitHub Actions workflow: `RC1.6.2.1 Exact Artifact Gate`

- Trigger: manual `workflow_dispatch`
- GitHub-hosted runner: Ubuntu 24.04
- Run ID: `32655405328`
- Job ID: `97233200991`
- Job conclusion: **success**

Identity was verified before extraction:

- filename: `IceFresh_RC1_6_2_1_Canonical_QA.zip`
- byte size: `2184261`
- SHA-256: `448a0935bf7e6e78c8d508dc2ac6cbf5d3f5647169061846ee1b104cbd3969e3`
- exact artifact identity: **PASS**

Only after identity PASS did the runner extract and execute:

- `npm ci --no-audit --no-fund`: **PASS** — 473 packages installed
- `npm run lint`: **PASS**
- `npm run typecheck`: **PASS**
  - app TypeScript: **PASS**
  - Cloudflare Worker types + TypeScript: **PASS**
  - Supabase Edge Function / Deno check: **PASS**
- `npm run build`: **PASS** — all vinext build phases completed
- `node --test tests/*.test.mjs`: **PASS** — 82/82 passed, 0 failed
- built-preview smoke: **PASS** — `/` returned 19105 bytes and runtime log check found no `Server error`, `TypeError:` or `Unhandled`
- final gate summary: **EXACT ARTIFACT BUILD GATE: PASS**

This commit is release evidence only and does not modify application/source bytes.

Final development verdict: **READY FOR QA #35**
