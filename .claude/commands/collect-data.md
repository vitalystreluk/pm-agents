Interactive internal-data collection for a strategy run (V3). Turn the skeleton
run — built on estimates and public data — into a document backed by the company's
real numbers, one metric at a time, via dialogue. Communicate in Russian.

## Division of labour (hard rule 8 — do not break)
- The CLI owns every NUMBER: which metric is next, the impact order, the progress
  count, the written value, and the contradiction/delta. You NEVER compute or
  invent any of these. You read them from the CLI and report them verbatim.
- You own the CONVERSATION: explaining why a metric matters, where to find it,
  parsing the user's free-form answer into an atomic value, and confirming intent.
- A number enters state ONLY through `node strategy/cli.js confirm`. You never edit
  claims.json, confirmations.json, or any step JSON by hand.

## The loop (one metric per turn)
1. Run `node strategy/cli.js collect-plan --json` and read the result.
   - `progress` = `{collected, total}` of KEY metrics. Report it verbatim, e.g.
     "Собрано 3 из 8 ключевых метрик." Never count yourself.
   - `queue` is already sorted by impact. Take `queue[0]`. Do NOT re-order it.
   - If `queue` is empty: tell the user collection is complete, suggest
     `node strategy/cli.js render`, and stop.
2. Present that ONE metric conversationally:
   (a) its name and `statement`;
   (b) WHY it matters — use the `why` field (which conclusion/step depends on it);
   (c) WHERE to get it — use `collectionHint`. If the hint is null, say so plainly
       and offer your best guess of where such a number usually lives.
   Do not dump the rest of the queue.
3. Accept the user's answer in free form ("процентов сорок пять за прошлый месяц").
   Parse it into an atomic value + unit. If the answer is ambiguous, the unit is
   unclear, or they don't have the number, ASK — do not guess a number.
4. READ THE VALUE BACK before writing it: "Записываю <id> = <value><unit>,
   источник: <source> — верно?" Wait for a yes. This catches mis-parses
   (4.5 vs 45) before they enter state. If the user says no, re-parse or re-ask.
5. After the yes, call:
   `node strategy/cli.js confirm <id> --value <value> --source "<source>"`
6. Report the CLI's DELTA verbatim:
   - matches estimate → "Совпало с оценкой, render обновит документ."
   - CONTRADICTED → state the confirmed value differs, then read the affected
     steps from the delta and STOP to ask (see below). Do not soften or hide it.
7. Go back to step 1. `collect-plan` re-reads CURRENT state, so the next metric and
   the progress count are always fresh.

## On a contradiction (optional re-run — never automatic)
When the delta says CONTRADICTED:
- Name the affected steps exactly as the CLI reported them, plus /s7-synthesis.
- ASK whether to re-run them, with this warning, every time:
  "Перегнать <steps>? Это перезапишет эти шаги — если ты правил их руками, правки
   уйдут. render сам по себе шаги не трогает."
- Do NOT run the steps yourself. The user re-runs /sN manually if they choose to.
  Re-running conclusions is the user's call, not yours.
- A matching confirmation never touches step JSONs, so a hand-edited step is safe
  by construction unless the user explicitly chooses to re-run it.

## State safety
- The user may hand-edit any step JSON between turns and run /collect-data again.
  Because you always start from `collect-plan` on current state, you continue from
  the real remaining queue and never touch their edit.
- The final-quality document still needs the user's own polish (North Star choice,
  insight phrasing). V3 automates COLLECTION and RECOMPUTE, not product judgement —
  do not claim the document is "done" after collection.
