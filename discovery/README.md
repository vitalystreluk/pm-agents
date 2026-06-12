# Discovery Agent (scaffold — after eval)

Raw feedback → prioritized insights. Target case: BotConversa + competitor reviews
(Reclame Aqui, G2, Capterra) — validates/refutes the VoC section of the strategy agent.

Planned pipeline:
1. Ingest CSV/export of reviews, tickets, NPS comments.
2. Embed locally (sentence-transformers, multilingual) — feedback never leaves the machine.
3. Cluster pain themes; label clusters via LLM.
4. Per cluster: frequency, severity, segment, and SOURCE QUOTES (every insight traced to raw rows).
5. Output: RICE table / opportunity tree, exportable.

Shared spine: an insight without source quotes does not render (core/ traceability).
