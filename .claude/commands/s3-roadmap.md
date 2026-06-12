Run step 3 (roadmap) of the strategy pipeline.

1. Read intake, 01-research, 02-framework from the latest run.
2. Build a three-horizon roadmap. Hard rules enforced by schema:
   - Every initiative has successMetric AND owner, or is explicitly marked exploratory: true.
   - H1 is about fixing what is broken (activation, analytics baseline), not new surface area.
   - Channels expand only after retention logic supports it — state this dependency explicitly.
3. Keep horizons lean: 2-3 initiatives each. An overloaded H2 is a wish list.
4. Write output/<run>/03-roadmap.json per schema '03-roadmap'. Estimated shares/volumes → claims.
5. Run `node strategy/cli.js status`, fix schema errors.
