# pm-agents

**A product strategy built as a *render of state* — not an editable file. Every number knows its source, every verdict knows what data it's still waiting on, and the product strategy is subordinate to the company's goal.**

A system I'm building and refining, pressure-tested on a real case (a Brazilian SMB WhatsApp-automation SaaS). This README is for people who build with tools, not slides — it shows how the document is made, and what happens the moment real internal data goes in.

> The core rule: **an AI conclusion you can't trace back to data is an opinion.** Everything here exists to make the difference visible.

---

## The one idea: a document is a render, not a file

Every quantitative claim lives in a **Claim Ledger** as a typed record:

```
{ id, statement, value, unit, source, status }   status ∈ estimate | public | confirmed | revised
```

The prose never contains a raw number — it references claims as `{{claim:id}}` tokens, and the renderer resolves them with their live status. A number and its status live in *one* record.

So the classic strategy-deck failure — *page 1 says "no data yet", page 11 quotes it as confirmed* — is **impossible by construction**, not by proofreading. When a number changes, every sentence that used it changes with it, everywhere, in one re-render. If you've ever watched a deck rot as the numbers drift, you know why this matters.

A few rules the system enforces on itself (it cannot be talked out of them):

- **The model never grades its own work.** Feature-scoring totals are computed by code from a visible rubric. The monetization verdict **cannot be `green` while it still depends on an unconfirmed number** — the validation rejects it. A verdict can't pass its own gate before the data exists.
- **A close call is named, not hidden.** When two options score within 10% of each other, the document flags it as a toss-up and breaks the tie on logic (sequence, dependency), not on a fake-precise decimal.
- **It says what it doesn't know.** Unconfirmed numbers render as an explicit, prioritized data request — not as confident-sounding filler.

One battle run took the document from **38 broken claim markers to 0**, and a ledger of **42 null values down to 12 honest unknowns** — each rendered as "here's what to measure, and why."

---

## How the strategy is built

The pipeline runs as a sequence of steps. The deterministic parts (validation, ledger, scoring math, rendering) are plain Node — zero LLM. The reasoning steps run as Claude Code slash commands. The model proposes; the code validates.

```
s0 corporate strategy   →  what is the company actually trying to win?
s1 research             →  competitors, pricing (web-verified, with dates), market moment
s2 framework            →  North Star + metric tree (every metric tied to a claim)
s3 roadmap              →  three horizons; no initiative without a success metric and an owner
s4 scoring              →  visible rubric, code-computed totals, toss-up rule
s5 monetization         →  alternatives weighed, sensitivity table, a gated verdict
s6 review               →  adversarial self-review before anything is written
s7 synthesis            →  the document, woven from state
s8 feature specs        →  the key bets, specified in depth (optional)
s10 gaps & risks        →  what this doesn't cover, and the risks to the whole bet (optional)
```

### s0 — the strategy is subordinate to *your* goal

This is the top of the pyramid, and most tools skip it. **A product strategy is meaningless until you know what the company is optimizing for.** Profitability? Market share? New markets? Owning the entire software stack of a vertical?

The same product facts produce a *different* North Star, a different roadmap, and a different price under "durable profitability" than under "grab share now." So `/s0-corporate` fixes the company goal first — and if the founders don't have one written down yet (most SMB software doesn't), it doesn't invent one. It lays out the real options and the trade-offs and helps decide, on the record. Everything below then reads through that prism, and if a standard product move conflicts with the company goal, the document **surfaces the tension instead of smoothing it over**.

### Depth, not a feature catalog

A roadmap that lists initiatives is a catalog. The key bets get **specified** — how it works, the technical approach, honest build effort, the metrics it moves, and what could go wrong (`s8`). And because outcome-based pricing only works if the billing unit is tamper-resistant, any model that bills on an earned outcome (an SBI) **must** carry an integrity policy: what counts as a verified outcome (confirmed by the customer's end-user, never asserted by the platform), the dispute rule, the rate-limit against gaming, and governance over the conflict of interest. That's not bolted on — the system refuses to ship outcome-billing without it.

### It tells you where it's thin

The document ends with two sections most strategies avoid: **what it does not cover** (capacity, GTM channels, a candid retrospective — each tagged with *why* it's deferred and what would close it) and the **strategy-level risks** — including the sharp one: *as general-purpose models get better, why won't a Lovable-style builder assemble the bot directly and make a dedicated SMB platform redundant?* The document states that risk plainly and answers it, rather than hoping no one asks.

---

## What happens when real internal data goes in

Right now the document runs on public data, industry benchmarks, and what a founding team confirms verbally. The moment real internal numbers connect, the document **rewrites itself**:

```bash
node strategy/cli.js collect-plan       # the agent's own data request, ranked by impact
# then in Claude Code: /collect-data  — a guided dialogue, one metric at a time:
#   what it needs, why it matters, where in the company's systems it lives
node strategy/cli.js render             # the document re-renders from the new state
```

It asks only for numbers that live in internal systems (churn, MRR, activation, cost-to-serve) — never for a price the strategy itself proposed, or a competitor fact already public. And when a real number **contradicts** an estimate, it doesn't quietly relabel it — it produces a **delta report** naming every conclusion that was built on the old value, so they get re-examined on purpose. (In one run, confirming a competitor's real entry price inverted the positioning logic — and the document flagged exactly which sections had to be re-reasoned, instead of silently rewording them.)

The order is by impact: a number the monetization verdict depends on gets collected before a decorative figure. Numbers, market reads, capacity, a sharper company goal — each new input is a trigger to rewrite, with the audit trail intact.

---

## The supporting agents

The strategy agent is the product; two others feed it.

- **Discovery** turns raw customer feedback (Reclame Aqui, app-store reviews, support logs) into pain clusters — fully on-device, feedback never leaves the machine — where every insight carries a code-computed frequency and severity and every quote traces to a real source row. Today the strategy's Voice-of-Customer section runs on public signals; discovery is how it gets rebuilt on a company's actual customers' words. The LLM here never reports a number.
- **Eval** compares feature variants (e.g. two onboarding-concierge prompts) *before* engineering builds anything — simulated dialogues, an LLM judge held behind a calibration gate, and a quality×cost×latency comparison. It once correctly refused to declare a winner when the fancier variant bought nothing measurable.

---

## Run it yourself

```bash
npm install
node strategy/cli.js demo && node strategy/cli.js render    # zero-LLM smoke test — see a document render from state
```

Then a real run starts with the company goal:

```bash
node strategy/cli.js init --product "Acme" --description "..." --market "..." \
  --competitors "..." --verticals "..." --author "You"
# in Claude Code: /s0-corporate  → then /s1-research … /s7-synthesis
```

The whole orchestration is a handful of markdown files and ~600 lines of CLI. No framework. That's deliberate — you can read all of it.

---

## Honest limitations

- Confirmations are one-at-a-time today (no bulk CSV import); delta reports name affected steps, but re-running them is a manual call — by design, so a human decides before conclusions move.
- Discovery is validated on a synthetic corpus; the real run on 300–500 reviews is the next step, and frequencies describe people who *wrote* a review, not all users.
- The reasoning steps run through Claude Code (subscription-based); an autonomous API runner is a deliberate non-goal for now.
- The current reference run is a rehearsal on illustrative numbers — the structure is real; the figures become real once internal data is connected.

---

## Stack

Node.js CLI (validation, ledger, scoring math, rendering — all zero-LLM) · Claude Code as the reasoning-step runner (`.claude/commands/`) · `docx` + LibreOffice for output · no frameworks, on purpose.

---

*Vitaly Streluk · [LinkedIn](https://www.linkedin.com/in/vitaly-streluk)*
