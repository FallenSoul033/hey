# IceFresh.kz RC1.6.2 Finalization Evidence

Finalization completed without changing application/source candidate bytes.

## Candidate identity

- filename: `IceFresh_RC1_6_2_Canonical_QA.zip`
- byte size: `2184536`
- SHA-256: `95ee0240991070260ab7a50d3c32a4d129e79d00a7f7d7334e87b90c53acc3b0`
- candidate bytes changed during finalization: `NO`
- immutable predecessor `IceFresh_RC1_6_1_Canonical_QA.zip` was not modified

## Independent GitHub-hosted exact-artifact gate

- workflow: `RC1.6.2 Exact Artifact Build Gate`
- GitHub Actions run ID: `32635199824`
- job ID: `97183780175`
- runner: GitHub-hosted Ubuntu 24.04
- transport: encrypted carrier + GitHub Actions OIDC key release
- identity verification occurred before extraction

### Exact identity result

- filename: `IceFresh_RC1_6_2_Canonical_QA.zip` — PASS
- byte size: `2184536` — PASS
- SHA-256: `95ee0240991070260ab7a50d3c32a4d129e79d00a7f7d7334e87b90c53acc3b0` — PASS
- exact artifact identity gate: PASS

## Build-quality gate results

- `npm ci --no-audit --no-fund`: PASS
- lint (`npm run lint`): PASS
- full project typecheck (`npm run typecheck`): PASS
  - app / TypeScript: PASS
  - Cloudflare Worker / Wrangler-generated bindings + TypeScript: PASS
  - Supabase Edge Function / Deno check: PASS
- build (`npm run build`): PASS
- full Node test suite (`node --test tests/*.test.mjs`): PASS — 82 passed, 0 failed
- built-preview HTTP smoke (`npm run preview:built`, `http://127.0.0.1:8787/`): PASS — 19105 response bytes
- exact artifact build gate summary: PASS

## Release controls

- trace branch: `canonical/sites-rc1.6.2-build-gate-fix`
- production deployment: `NOT PERFORMED`
- application/source changes during finalization: `NONE`
- next stage: independent Security Gate
- security handoff: `READY`
