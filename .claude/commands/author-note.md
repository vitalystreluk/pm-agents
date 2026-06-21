Help the author capture a piece of their own voice — context, rationale, a risk flag,
a caveat — and route it correctly. Communicate in the language the author writes in.

## The routing fork (the author decides, never you)
A piece of authorial input is one of two things, and only the author can say which:
1. It CHANGES a conclusion ("the verdict is wrong because…", "this initiative should be
   cut", "the North Star is mis-chosen"). → This must go through /s6-review or a direct
   step edit, so it flows into state and the affected steps get re-run. It is NOT a note.
2. It's a LAYER on top ("worth flagging that…", "the reason I chose this is…", "this is
   contested, we discussed it separately", "their real entry price is higher"). → This is
   an author note: it lives alongside the strategy and gets woven into the body. It does
   not change any conclusion.

When the author gives you input, help them sharpen it, then ASK which one it is. Do not
classify it yourself — surface the fork and let them choose. If they say it changes a
conclusion, point them to /s6-review (or the specific step to edit) and STOP — do not
write a note. Only proceed to write a note for case 2.

## Writing the note (case 2 only)
1. Help the author phrase the point crisply (1–4 sentences). Keep THEIR point; you may
   tighten wording, but confirm the wording back before writing.
2. Determine the `anchor` — where in the document it belongs:
   - a section: tldr | market | customer | north-star | roadmap | monetization |
     what-needs-true
   - or a claim id (e.g. r01, f05) if the note is about a specific number/claim.
   Ask the author if it's ambiguous.
3. Determine `kind`: context | rationale | risk | caveat (pick the best fit; ask if unsure).
4. Write it with the CLI — you never edit notes.json by hand:
   `node strategy/cli.js note add --anchor <anchor> --kind <kind> --body "<text>"`
5. Tell the author the note is saved but NOT yet in the document, and that running
   /s7-synthesis will weave it into the body. Offer to run /s7-synthesis now, or to keep
   collecting more notes first and weave them all in one pass.

## Boundaries
- The note records the author's view verbatim-in-spirit; s7 may rephrase for flow when
  weaving, and the author polishes the final result. You are not writing the strategy —
  you are capturing the author's commentary on it.
- You never decide that a note is important enough to override a conclusion. That routing
  is the author's call (the fork above).
- To see or remove notes: `node strategy/cli.js note list` / `note remove --id <id>`.

FACTS INSIDE A NOTE (V3.3): if the author's note rests on a number that isn't already a
claim (e.g. "their live entry price is R$189"), do NOT route it to a step and do NOT leave
a raw number in the body. Capture it as a fact ON the note via repeatable --claim:
  node strategy/cli.js note add --anchor monetization --kind caveat \
    --body "Their live entry tier is above our proposed Starter — cannibalization is sharper." \
    --claim "m07 | Current live BotConversa Beginner tier | 189 | BRL/month | <source> | benchmark" \
    --claim "m08 | Current live BotConversa Pro tier | 199 | BRL/month | <source> | benchmark"
The fact becomes a real ledger claim (provenance note:<id>); s7 then weaves the body and
references the numbers as tokens. This removes the old "should I edit step 5?" detour — an
author-introduced fact lives in the author layer, never in a step's output. Confirm id /
value / source with the author before writing. Author facts are almost always
kind=benchmark (a verified external/observed fact), so they never enter the collect-data
queue.
