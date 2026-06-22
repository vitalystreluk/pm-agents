Run step 0 (corporate strategy) of the strategy pipeline — the prism every step below reads.
The product strategy is SUBORDINATE to the company's goal. This step fixes that goal first.
Communicate in the language the user writes in.

Output: output/<run>/00-corporate.json, shape:
  { primaryGoal, intent, priorities[], antiGoals[], horizon, riskAppetite, rationale, source }
  - primaryGoal: profitability | market-share | new-markets | vertical-software-contour | exit | survival | other
  - intent: the elaboration (e.g. "maximize near-term profit", "win the salon vertical end-to-end")
  - priorities: ordered list of what matters most under that goal
  - antiGoals: what the company explicitly will NOT pursue (prevents scope creep downstream)
  - horizon: e.g. "2-3 years" · riskAppetite: low | medium | high
  - rationale: WHY this goal — especially if derived or if the company had no stated strategy
  - source: intake | founder-dialogue | derived

## HYBRID trigger
1. Read intake.json. If it has a `companyStrategy` field, take it as the goal — do NOT
   interrupt with a dialogue. Map it to the shape (e.g. companyStrategy "profitability: max"
   → primaryGoal "profitability", intent "maximize near-term profit", source "intake"), infer
   sensible priorities/antiGoals from context, and write 00-corporate.json. State briefly what
   you recorded and move on.
2. If there is no companyStrategy, run the DIALOGUE below.

## DIALOGUE (only when intake doesn't specify it)
You are helping the founder(s) name the company goal — or discover they don't have one yet,
which is common for SMB software. Ask, one focused question at a time:
  - What does success look like in 2–3 years — profit now, market share, new markets, becoming
    the whole software stack of a vertical, an exit?
  - What are you explicitly NOT trying to do?
  - Horizon and appetite for risk?
If the founders have no explicit strategy: do NOT invent one. Surface the realistic options,
lay out the trade-offs honestly (e.g. "max profit now" vs "grab share and monetize later" are
DIFFERENT product strategies and lead to different North Stars and roadmaps), and help them
choose — record the choice with source "founder-dialogue" or "derived" and a rationale that
says plainly how it was reached (including "no prior stated strategy; agreed in this session").
Read back the recorded goal before writing. You write 00-corporate.json directly.

## Why this matters downstream
Every later step subordinates to this goal. The same product facts yield a different North
Star, roadmap, and monetization under "max profit" vs "vertical-software-contour". Do not let
this file be decorative — it is the frame. If the chosen goal makes a later step's standard
move wrong (e.g. profit-max disfavors a land-grab roadmap), that tension must surface there,
not be smoothed over.

This step never invents a strategy the company doesn't have; it either records what they state
or helps them decide, transparently.
