---
name: icefresh-achievement-preflight
description: >
  Mandatory project-wide IceFresh.kz preflight for every new idea, improvement,
  feature request, bug-fix proposal, plan, backlog item, Codex task or agent task.
  Before answering as if work is needed, independently check whether the requested
  outcome is already implemented, partially implemented, verified, superseded or
  still missing. Use current project evidence, not memory alone. Never create a
  duplicate active task. If only part is missing, create only the delta. Do not
  list completed/DONE history in normal idea discussions unless the user asks.
risk: low
source: "IceFresh.kz internal project standard"
---

# IceFresh Achievement Preflight

## Purpose

For every IceFresh.kz idea or proposed change, verify the current project state **before** turning the idea into a task, plan, backlog item, prompt or recommendation.

The goal is to prevent duplicate work, stale plans and repeated implementation of functionality that already exists.

## Mandatory trigger

Run this preflight automatically whenever the user proposes or discusses any of the following:

- a new site/app idea;
- a UX/UI improvement;
- a feature request;
- a bug fix;
- a CRM/Finance/Production/Employees/Equipment change;
- an automation;
- a Security/QA improvement;
- a marketing/site enhancement;
- a Codex change batch;
- a task to add to the accumulated backlog;
- a request phrased as “сделать”, “добавить”, “улучшить”, “надо”, “идея”, “план”, “задача”, “в следующий релиз”.

Do not wait for the user to ask “это уже сделано?”.

## Core rule

> First determine the real current state. Only then decide whether a new task exists.

Never assume that an idea is missing simply because it was mentioned as an idea.
Never assume that it is complete simply because Development previously said so.

## Preflight procedure

### 1. Resolve the intended outcome

Translate the user's idea into a concrete outcome.

Example:

“Добавить несколько товаров в заказ” means the outcome is not just the presence of an Add button. The outcome includes the relevant end-to-end behavior: multiple order items, save/read-back, edit, totals, remove/re-add where required, backend consistency and the applicable acceptance flow.

### 2. Search current project evidence

Use the strongest relevant evidence available in the project. Depending on the idea, inspect:

- current project conversation/report history;
- GitHub issues and their current state/comments;
- GitHub PRs, commits and canonical branches;
- exact release candidate / artifact evidence;
- independent QA results;
- Security Gate results;
- Finance/CRM/UX acceptance results;
- Fibery/open task state when relevant and available;
- current production deployment/runtime evidence when relevant and available;
- current backend/source-of-truth data when the task is data-sensitive.

For website/app ideas, **do not treat GitHub `main` or an independent subset as proof of the production IceFresh site**. Confirm the canonical Sites/release/runtime state when that distinction matters.

### 3. Classify the idea

Internally classify it as one of:

- `NOT_STARTED` — no reliable evidence that the outcome exists;
- `PARTIAL` — some of the outcome exists, but a concrete gap remains;
- `IMPLEMENTED_UNVERIFIED` — implementation evidence exists, but required independent/runtime verification is missing;
- `VERIFIED` — the required outcome is supported by strong current evidence;
- `SUPERSEDED` — the idea has been replaced by a newer architecture/solution and should not be implemented as originally phrased;
- `NEEDS_VERIFICATION` — evidence is missing, stale or contradictory.

This classification is a reasoning control. Do not dump the label into every user-facing reply unless it helps.

## Evidence hierarchy

Prefer evidence in roughly this order:

1. Current production/runtime read-back + successful user-path verification.
2. Independent QA/Security/Finance/UX acceptance against the exact target.
3. Exact immutable artifact/release-gate evidence.
4. Canonical source/commit and regression tests.
5. Open/closed task or issue status with supporting evidence.
6. Development self-report.
7. Conversational recollection or memory alone.

A lower level must not override contradictory stronger evidence.

## No false completion

Do not mark an idea `VERIFIED` merely because:

- code exists;
- Development says PASS;
- an issue was closed without evidence;
- a branch exists;
- a UI screenshot looks correct;
- a task is marked Done;
- one part of an end-to-end flow works.

If the user's requested outcome requires independent evidence, require it.

## Duplicate prevention

Before adding a new active task:

1. Check whether the same outcome already exists in the current implementation.
2. Check whether an equivalent open task already exists.
3. Check previous reports/issues for a matching unresolved gap.
4. Reuse/update the existing task when appropriate instead of creating a duplicate.

If the idea is `VERIFIED`, **do not add it to the active backlog**.

If the idea is `PARTIAL`, create only the missing delta.

Example:

Do not create “Implement multi-item orders” when multi-item orders already work and only a 768px overflow remains. Create only “Fix 768px overflow in multi-item order editor”.

## User-facing response rule

The owner prefers idea discussions to focus on **tasks and plans**, not on long recaps of what is already completed.

Therefore:

- do not include a DONE/completed section in normal idea responses;
- do not repeat release history unless asked;
- if the idea is already fully verified, do not create a new active task; say only briefly that no new task is required, unless the user asks for proof/details;
- if partially implemented, describe only the remaining work;
- if verification is missing, make the next task a verification task rather than blindly reimplementing the feature;
- if the idea is genuinely new, add it to the active plan/backlog with priority and acceptance criteria.

## Accumulated backlog rule

Whenever the user accepts an IceFresh improvement:

1. Run this preflight first.
2. Add only unresolved work to the accumulated active task list.
3. Preserve priority, scope and measurable acceptance criteria.
4. Do not keep verified work in the active list.
5. Do not create duplicate tasks with different wording.

## Cross-agent behavior

This skill is project-wide and applies to all functional roles:

- Admin
- Architecture/Automation
- Development
- UX/UI
- CRM
- Production/Warehouse
- Finance
- Equipment
- Employees
- QA
- Security
- Marketing
- any future IceFresh agent

An agent must check existing state before routing work to another agent.

## When another agent is required

If the preflight determines that the idea depends on another role:

- route only the unresolved delta;
- include evidence for why the delta still exists;
- do not ask the other agent to redo already verified work;
- preserve separation of duties for independent QA/Security/Finance/UX gates.

## Freshness and contradictions

If evidence conflicts:

- prefer newer exact-target evidence over older reports;
- prefer runtime/read-back over assumptions;
- check whether the newer result refers to a different branch, artifact, preview or production target;
- if the contradiction cannot be resolved safely, classify as `NEEDS_VERIFICATION` and create a verification step.

## Final self-check before replying to an idea

Before every answer about an IceFresh idea, silently ask:

- Did I check whether this outcome already exists?
- Did I verify the correct canonical/production target where relevant?
- Am I relying on evidence rather than memory alone?
- Is there already an open task for the same outcome?
- Am I accidentally re-adding completed work?
- If only part is missing, did I define only the delta?
- If proof is missing, should the next step be verification instead of implementation?
- Am I keeping the user-facing answer focused on tasks and plans rather than DONE history?

If any answer is no, complete the preflight before responding.
