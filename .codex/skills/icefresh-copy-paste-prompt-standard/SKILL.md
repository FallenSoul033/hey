---
name: icefresh-copy-paste-prompt-standard
description: >
  Project-wide prompt-writing standard for IceFresh.kz. Use whenever the Admin
  agent prepares a prompt, handoff, task brief, retest request, release gate,
  production instruction, or "what should I send/write" message for another
  IceFresh agent/chat. Output one complete copy-paste-ready prompt in a single
  code block with all known context, exact artifact identities, constraints,
  ordered execution steps, stop conditions, acceptance criteria, rollback/safety
  rules, and a strict final report/verdict format. Avoid fragmented follow-up
  instructions that force the user to merge several messages manually.
risk: low
source: "IceFresh.kz internal project standard"
---

# IceFresh Copy-Paste Prompt Standard

Ты формируешь рабочие промпты для проекта IceFresh.kz.

Главное правило:

> Пользователь должен иметь возможность нажать Copy один раз, вставить весь текст в нужный чат/Work и сразу запустить работу без ручной сборки контекста из нескольких сообщений.

## Когда навык обязателен

Используй этот навык каждый раз, когда пользователь просит:

- «напиши промпт»;
- «что написать агенту?»;
- «скинь задачу для Development / QA / Security / UX/UI / CRM / Finance»;
- «отправь следующий этап»;
- «дай текст для Work»;
- prompt для retest, hotfix, release gate, production deploy, rollback, post-deploy QA;
- любой handoff между агентами IceFresh.kz.

Применяй также автоматически, когда Admin сам предлагает текст, который пользователь должен переслать другому агенту.

## Формат ответа по умолчанию

Сам промпт всегда отдавай как **один цельный fenced code block**:

```text
...весь промпт...
```

Не разбивай один рабочий промпт на несколько code block'ов.

Перед code block допустима максимум одна короткая фраза, например:

«Скопируй и отправь в Development:»

После code block не добавляй новые обязательные инструкции, которые пользователь должен вручную дописывать в промпт. Если инструкция нужна исполнителю — она должна уже находиться внутри единого блока.

## Принцип полноты

Промпт должен быть самодостаточным. Получающий агент не должен угадывать:

- что именно делать;
- какой release/candidate проверять;
- где artifact;
- какой hash считать правильным;
- что уже проверено;
- что нельзя менять;
- какой target использовать;
- что считается PASS;
- когда нужно STOP;
- какой отчёт вернуть Admin.

Если факт уже известен из проекта и нужен для безопасного выполнения — включай его прямо в prompt.

## Обязательная структура сложного промпта

Для release/development/QA/security/deployment задач используй этот порядок, если раздел применим:

1. **Заголовок задачи**
   - номер задачи;
   - release/version;
   - краткая цель.

2. **Роль исполнителя**
   - кто он в рамках задачи;
   - независимая ли это проверка;
   - от чего нельзя слепо наследовать verdict.

3. **Цель / ожидаемый результат**
   - одна ясная формулировка конечного состояния.

4. **Exact target / artifact identity**
   При наличии указывай буквально:
   - filename;
   - Drive ID;
   - byte size;
   - SHA-256;
   - trace branch;
   - trace commit;
   - GitHub Actions run/job;
   - Vercel project/deployment ID;
   - Supabase project ID;
   - production domains.

5. **Текущее подтверждённое состояние**
   - какие gates уже PASS;
   - какие дефекты уже исправлены;
   - какой baseline нельзя потерять;
   - какой rollback point существует.

6. **Scope**
   - что именно разрешено менять/проверять;
   - что вне scope.

7. **Жёсткие запреты / DO NOT**
   Явно перечисляй вещи, которые опасно сделать по ошибке, например:
   - не использовать GitHub main вместо canonical artifact;
   - не менять backend;
   - не менять Supabase;
   - не перезаписывать immutable ZIP;
   - не делать production deploy;
   - не ослаблять auth/RLS;
   - не менять source ради прохождения gate.

8. **Пошаговый execution plan**
   Для операционных задач используй нумерованные шаги:
   - Step 1 — identity gate;
   - Step 2 — clean extraction;
   - Step 3 — build/test;
   - Step 4 — runtime/browser verification;
   - Step 5 — deployment/alias switch;
   - Step 6 — data readback;
   - Step 7 — rollback safety;
   и т.д.

9. **STOP conditions**
   Отдельно укажи, когда исполнитель обязан остановиться, а не «починить по пути».

   Примеры:
   - hash не совпал;
   - source изменился вне разрешённого scope;
   - security-sensitive file затронут;
   - production target не совпадает;
   - deployment требует изменение immutable candidate;
   - данные baseline не восстановились.

10. **Acceptance criteria**
    Делай проверяемыми: PASS/FAIL, конкретные размеры, значения, количества тестов, DOM metrics, HTTP/runtime признаки, business totals.

11. **Rollback / data restoration**
    Для production или mutation-задач всегда указывай:
    - rollback deployment / backup;
    - baseline данных;
    - обязательный readback после rollback/restore.

12. **Final report template**
    В конце prompt всегда дай точные поля, которые исполнитель должен заполнить.

13. **Allowed final verdicts**
    Используй ограниченный набор точных строк, например:
    - `PASS TO QA RETEST`
    - `PASS TO ADMIN RELEASE GATE`
    - `READY FOR POST-DEPLOY QA`
    - `RETURN TO DEVELOPMENT`
    - `BLOCKED — <точная причина>`
    - `ROLLBACK REQUIRED — <точная причина>`

## Стиль

Пиши по-русски, простым операционным языком.

Предпочитай:

- короткие императивные предложения;
- точные IDs и значения;
- понятные заголовки;
- PASS/FAIL форматы;
- явные запреты;
- один источник истины;
- минимальную двусмысленность.

Не делай prompt «красивым эссе». Он должен быть рабочей инструкцией.

## Один prompt = один пакет действий

Если пользователь просит исполнителя:

- сделать deploy;
- сразу вывести на live domain;
- потом выполнить smoke;

и все эти действия относятся к одной безопасной операционной цепочке — включи их **сразу в один prompt**.

Не отвечай сначала «сделай deployment», а потом отдельным сообщением «и ещё переключи alias», если это можно было предусмотреть заранее.

Исключение: не объединяй действия, если между ними обязан стоять независимый gate или новое пользовательское разрешение.

Пример:

- Development исправил код → STOP → независимый QA.
- QA PASS → Admin решает production GO/NO-GO.

В таком случае нельзя давать Development указание самостоятельно считать свой QA достаточным.

## Exact artifact discipline

Для immutable release candidate:

1. Всегда указывай identity до extraction.
2. Требуй verification filename + byte size + SHA-256.
3. Не разрешай заменять ZIP веткой GitHub или локальной рабочей копией.
4. Если bytes изменились — это новый candidate, новый SHA и соответствующие gates.
5. Trace commit не считается artifact, если он только evidence/manifest.

## Production prompts

Production prompt должен явно содержать:

- точный approved candidate;
- production target IDs;
- текущий rollback deployment;
- запрет неканонических source;
- шаг переключения live alias/domain, если релиз должен стать публичным;
- immediate live smoke;
- baseline data readback;
- rollback trigger;
- требование не считать release закрытым до независимого post-deploy acceptance.

Если known tool/CLI может создавать служебные файлы, заранее опиши безопасный способ target selection, чтобы не заставлять исполнителя импровизировать и менять candidate.

## QA prompts

QA prompt должен подчёркивать независимость:

- не засчитывать Development verdict как QA PASS;
- проверить exact artifact identity самостоятельно;
- воспроизвести ключевой пользовательский сценарий;
- различать application defect и QA infrastructure defect;
- сохранять/восстанавливать production baseline;
- вернуть только один официальный verdict.

## Security prompts

Security prompt должен:

- указывать exact changed scope;
- проверять реальные trust boundaries;
- запрещать считать passing tests доказательством безопасности;
- отделять INFO от blocking finding;
- требовать финальный verdict, который однозначно маршрутизирует release дальше.

## Development prompts

Development prompt должен:

- содержать root cause или evidence текущего defect;
- ограничивать diff;
- запрещать unrelated refactor;
- определять test/build evidence;
- описывать candidate handling;
- указывать, нужен ли новый Security Gate при изменении security-sensitive файлов.

## UX/UI prompts

UX/UI prompt должен давать:

- конкретные viewport'ы;
- экран/элемент;
- что уже технически PASS;
- что оценивается визуально;
- blocker vs non-blocking improvements;
- запрет молча менять код во время независимой acceptance, если задача только на проверку.

## CRM / Finance prompts

CRM/Finance prompt должен содержать контрольные business values и источник истины.

Например для order QA:

- строки товаров;
- total;
- paid;
- debt;
- status;
- duplicate expectations;
- revenue recognition rules;
- rollback/readback при mutation test.

## Не повторять ошибку «добавь ещё одну строку»

Если после отправленного prompt пользователь уточняет логичное действие, которое очевидно должно было входить в исходную цепочку, при следующей подобной задаче включай его сразу.

Пример:

Плохо:
1. «Сделай production deploy».
2. После уточнения пользователя: «И ещё сразу загрузи на сайт».

Правильно:

Один prompt сразу содержит:
- deploy production;
- wait READY;
- switch live aliases;
- verify live domain;
- smoke;
- return deployment evidence.

## Минимальный шаблон

```text
TASK TITLE

Role:
...

Goal:
...

Exact target:
...

Known good state:
...

DO NOT:
...

STEP 1 — ...
...

STEP 2 — ...
...

STOP CONDITIONS:
...

ACCEPTANCE:
...

FINAL REPORT:
Field A: PASS/FAIL
Field B: ...

FINAL VERDICT:
`...` / `...`
```

## Проверка перед отправкой prompt пользователю

Перед финальным ответом мысленно проверь:

- Можно ли скопировать только один блок и выполнить задачу?
- Все ли известные exact IDs уже внутри блока?
- Нет ли обязательной инструкции после блока?
- Указаны ли DO NOT?
- Указаны ли STOP conditions?
- Понятно ли, что считать PASS?
- Понятно ли, что вернуть?
- Понятно ли, кто следующий gate?
- Не смешал ли prompt independent verification с self-approval?

Если любой ответ «нет» — дополни единый prompt до отправки.
