---
name: icefresh-copy-paste-prompt-standard
description: >
  Mandatory project-wide prompt standard for IceFresh.kz. Use whenever Admin
  prepares a prompt, handoff, task brief, retest, release gate, production,
  rollback, recovery, post-deploy or other instruction that the user will copy
  into another IceFresh agent/chat/Work. Output one complete self-contained
  copy-paste-ready prompt in one code block. Include all known exact IDs,
  artifact identities, constraints, DO NOT rules, ordered steps, STOP conditions,
  acceptance criteria, rollback/data restoration, end-to-end execution rules,
  and a strict final report/verdict. The executor must not return early with
  intermediate results when safe authorized work remains.
risk: low
source: "IceFresh.kz internal project standard"
---

# IceFresh Copy-Paste Prompt Standard

Ты формируешь рабочие промпты для проекта IceFresh.kz.

Главное правило:

> Пользователь должен нажать Copy один раз, вставить весь текст в нужный чат/Work и запустить задачу без ручной сборки контекста из нескольких сообщений.

## Когда навык обязателен

Используй его для любого handoff между агентами IceFresh.kz, включая Development, QA, Security, UX/UI, CRM, Finance, Admin, production deploy, rollback, incident recovery, release gate и post-deploy acceptance.

Применяй также автоматически, когда сам предлагаешь пользователю текст, который он должен переслать другому агенту.

## Формат ответа

Сам рабочий prompt всегда отдавай одним цельным fenced code block:

```text
...весь промпт...
```

Перед блоком допустима только короткая фраза вроде «Скопируй и отправь в Work:».

После блока не добавляй обязательные инструкции, которые пользователю пришлось бы вручную дописывать. Если инструкция нужна исполнителю — она должна уже быть внутри единого блока.

## Самодостаточность

Получающий агент не должен угадывать:

- что делать;
- какой release/candidate использовать;
- где artifact;
- filename / Drive ID / byte size / SHA-256;
- trace branch / commit / CI run, если применимо;
- production project/domain/deployment IDs;
- Supabase project ID, если применимо;
- что уже PASS;
- какой baseline нельзя потерять;
- что разрешено и запрещено;
- что считать PASS/FAIL;
- когда STOP;
- какой отчёт и verdict вернуть.

Все известные и нужные для безопасного выполнения факты включай прямо в prompt.

## Обязательная структура сложного prompt

Если раздел применим, используй такой порядок:

1. TASK TITLE / номер / release / цель.
2. Role — роль исполнителя и независимость проверки.
3. Goal — конечное состояние, а не только первый шаг.
4. Exact target / artifact identity.
5. Known good state / уже пройденные gates / baseline / rollback point.
6. Scope.
7. DO NOT — явные запреты.
8. Ordered execution plan.
9. CRITICAL EXECUTION RULE — DO NOT RETURN EARLY.
10. STOP CONDITIONS.
11. ACCEPTANCE CRITERIA.
12. ROLLBACK / DATA RESTORATION.
13. FINAL REPORT.
14. ALLOWED FINAL VERDICTS.

## Exact artifact discipline

Для immutable candidate:

1. Identity gate всегда до extraction.
2. Проверять filename + byte size + SHA-256.
3. Не заменять ZIP GitHub branch, main или локальной рабочей копией.
4. Если bytes изменились — это новый candidate, новый SHA и новые обязательные gates.
5. Trace commit — evidence, а не замена artifact, если release определён ZIP-файлом.

## DO NOT rules

В зависимости от задачи явно запрещай опасные действия, например:

- не использовать GitHub main вместо canonical artifact;
- не менять backend/Supabase/migrations вне scope;
- не ослаблять Auth/RLS/permissions;
- не менять immutable candidate ради прохождения gate;
- не делать unrelated refactor;
- не удалять rollback deployment;
- не менять DNS без прямого разрешения;
- не выполнять production mutation без recovery/readback плана;
- не считать Development self-check независимым QA.

## Один prompt = одна разрешённая end-to-end цепочка

Если действия логически относятся к одной безопасной цепочке и между ними не требуется независимый gate или новое пользовательское разрешение, включай их сразу в один prompt.

Пример production:

deploy → wait READY → switch live aliases → verify live domain → smoke → data readback → collect evidence → final report.

Пример incident recovery:

verify rollback target → rollback/promote → verify aliases → live recovery smoke → read-only root-cause investigation → recommendation → final report.

Не выдавай сначала «сделай deploy», потом отдельным сообщением «и ещё переключи alias», если это можно было предусмотреть заранее.

## CRITICAL EXECUTION RULE — DO NOT RETURN EARLY

Для операционных задач, Work/Codex, deployment, recovery, QA automation и других длинных цепочек prompt обязан содержать правило:

> Не возвращайся к Admin с промежуточным результатом, частичным отчётом или сообщением «следующий шаг нужно сделать отдельно», пока остаются безопасные действия, уже разрешённые этим заданием.

Исполнитель должен самостоятельно пройти всю разрешённую цепочку end-to-end.

Если один официальный/безопасный способ не сработал, но существует другой безопасный способ в рамках уже выданного разрешения — проверить/использовать его и продолжить, не возвращаясь после первой неудачной команды.

Не запрашивать новое подтверждение для шагов, которые уже прямо разрешены prompt.

Возвращаться только когда:

### A. Получен конечный результат

Выполнены все применимые шаги, проверки, readback, smoke, investigation и собран полный FINAL REPORT.

### B. Достигнут настоящий HARD STOP

Продолжение невозможно безопасно без хотя бы одного из следующего:

- нового разрешения Admin/пользователя;
- изменения immutable candidate;
- создания нового release candidate;
- изменения production данных без уже выданного разрешения;
- изменения DNS/секретов/permissions вне scope;
- необратимого действия;
- отсутствующих credentials/access;
- независимого gate, который по архитектуре обязан выполняться другим агентом.

При HARD STOP executor обязан вернуть:

- точную причину blocker;
- какие безопасные варианты уже самостоятельно проверены;
- почему дальнейшее действие требует Admin/другого gate;
- одно конкретное следующее действие для продолжения.

Промежуточный статус сам по себе не является FINAL REPORT.

## Независимые gates не объединять

Правило end-to-end не отменяет separation of duties.

Примеры:

- Development исправил код → STOP → независимый QA.
- Security Gate выполняется независимо, если затронут security-sensitive scope.
- QA PASS → Admin production GO/NO-GO.
- Production deploy → отдельный post-deploy acceptance, если он принят процессом.

Исполнитель не имеет права self-approve независимый gate только ради «не возвращаться рано».

## Production prompts

Production prompt должен включать:

- exact approved candidate;
- exact target project/team IDs;
- production domains;
- rollback deployment;
- canonical deployment mechanism;
- запрет неканонического source;
- wait until READY;
- live alias/domain switch, если это часть разрешения;
- immediate live smoke;
- backend/data baseline readback при необходимости;
- rollback trigger;
- правило DO NOT RETURN EARLY;
- строгий FINAL REPORT.

Если deployment tooling создаёт служебные файлы, заранее укажи безопасный targeting method, чтобы executor не импровизировал с immutable candidate.

## QA prompts

QA prompt должен:

- быть независимым от Development verdict;
- самостоятельно проверить exact artifact identity;
- воспроизвести ключевой пользовательский сценарий;
- различать application defect и QA infrastructure defect;
- восстанавливать baseline после mutation;
- не возвращаться после первой проверки, если весь test matrix уже разрешён;
- вернуть один официальный verdict.

## Security prompts

Security prompt должен:

- указывать exact changed scope;
- проверять trust boundaries;
- не считать passing tests доказательством безопасности;
- отделять INFO от blocker;
- выполнять весь разрешённый security checklist до final verdict;
- возвращать однозначный маршрут release дальше.

## Development prompts

Development prompt должен:

- содержать evidence/root cause текущего defect;
- ограничивать diff;
- запрещать unrelated refactor;
- определять build/test evidence;
- определять candidate handling;
- указывать, нужен ли новый Security Gate;
- выполнять все разрешённые self-checks до handoff, а не возвращаться после первого исправленного файла.

## UX/UI prompts

UX/UI prompt должен содержать:

- конкретные viewport'ы;
- экран/элемент;
- технический baseline;
- визуальные acceptance criteria;
- blocker vs non-blocking distinction;
- запрет молча менять код во время независимой acceptance;
- полный viewport matrix до final verdict.

## CRM / Finance prompts

Всегда включай контрольные business values, source of truth, duplicate/revenue/status rules и обязательный restore/readback для mutation tests.

## STOP CONDITIONS

STOP conditions должны быть конкретными. Примеры:

- hash mismatch;
- target/project mismatch;
- unexpected source mutation;
- security-sensitive scope расширился;
- rollback target не работает;
- baseline не восстановился;
- operation требует новое пользовательское разрешение;
- следующий шаг обязан выполнять независимый verifier.

Не путай обычную ошибку одной команды с HARD STOP, если есть другой безопасный официальный путь внутри scope.

## Acceptance criteria

Делай критерии измеримыми: PASS/FAIL, конкретные totals, viewports, HTTP status, DOM metrics, exact test count, console/runtime errors, aliases, baseline readback.

## FINAL REPORT

В конце prompt дай точные поля для заполнения.

Финальный отчёт должен позволять Admin сразу понять:

- что реально выполнено;
- какой exact target/artifact использован;
- что изменилось;
- что проверено;
- baseline/rollback сохранён ли;
- есть ли blocker;
- какой официальный verdict.

Допустимые verdicts задавай заранее, например:

- `PASS TO QA RETEST`
- `PASS TO ADMIN RELEASE GATE`
- `READY FOR POST-DEPLOY QA`
- `PRODUCTION RESTORED — READY FOR ADMIN REVIEW`
- `RETURN TO DEVELOPMENT`
- `BLOCKED — <точная причина>`
- `ROLLBACK REQUIRED — <точная причина>`
- `HARD STOP — <точная причина>`

## Проверка перед отправкой prompt пользователю

Перед ответом проверь:

- Пользователь может скопировать один блок и выполнить всю задачу?
- Все exact IDs/values внутри?
- Все логичные действия одной цепочки уже внутри?
- Нет ли обязательной инструкции после code block?
- Есть ли DO NOT?
- Есть ли DO NOT RETURN EARLY?
- Ясно ли, что является HARD STOP?
- Есть ли STOP conditions?
- Есть ли acceptance criteria?
- Есть ли rollback/data restoration?
- Есть ли строгий FINAL REPORT?
- Ясно ли, кто следующий независимый gate?
- Не смешан ли self-check с independent approval?

Если хотя бы один ответ «нет» — дополни единый prompt до отправки.
