// strategy/fixtures.js — demo state for `cli.js demo`.
// Lets you test the full render path (ledger → tokens → DOCX) with zero LLM calls.
// Content is a compressed BotConversa-flavored example.

const intake = {
  product: 'BotConversa',
  description: 'WhatsApp chatbot builder for Brazilian SMBs',
  market: 'Brazil, micro and small businesses',
  competitors: ['ManyChat', 'SocialHub', 'Toolzz AI'],
  verticals: ['beauty salons', 'clinics', 'pet shops'],
  author: 'Vitaly Streluk',
  createdAt: new Date().toISOString(),
  version: '0.1-demo',
};

const fixtures = {
  intake,

  '01-research': {
    competitors: [
      { name: 'SocialHub', positioning: 'WhatsApp + CRM in one place', pricing: 'from ~R$79/mo', pricingVerifiedDate: '2026-06-01' },
      { name: 'Toolzz AI', positioning: 'AI agent builder, BYO OpenAI key', pricing: 'from ~R$97/mo', pricingVerifiedDate: '2026-06-01' },
      { name: 'ManyChat', positioning: 'Global multi-channel, English-only', pricing: 'Pro from $15/mo', pricingVerifiedDate: '2026-06-01' },
    ],
    vocSignals: [
      { signal: 'Only 20% of BR consumers report good chatbot experience', source: 'PROCON-SP 2024' },
      { signal: 'Platform instability is the dominant complaint theme', source: 'Reclame Aqui Oct 2025 - Mar 2026' },
    ],
    claims: [
      { id: 'br_chatbot_trust', statement: 'Share of BR consumers reporting good chatbot experience', value: 20, unit: '%', source: 'PROCON-SP 2024', status: 'public', usedIn: [] },
      { id: 'complaints_6mo', statement: 'Reclame Aqui complaints over 6 months', value: 79, unit: '', source: 'Reclame Aqui', status: 'public', usedIn: [] },
    ],
  },

  '02-framework': {
    northStar: {
      name: 'SBI — Successful Business Interaction',
      definition: 'A completed bot-driven interaction delivering measurable value: booking, payment, qualified lead.',
      gamingRisks: ['Bot over-counts: booking made then cancelled', 'Client disputes SBIs in slow months', 'Vendor incentive to inflate counts when SBI is also the billing unit'],
    },
    metricTree: {
      customer: ['TTFV', 'Activation Rate (SBI in 7 days)', 'Month-1 churn'],
      product: ['SBI per active bot', 'Fallback Rate', 'Zombie bots'],
      financial: ['MRR', 'LTV/CAC', 'SBI dispute rate'],
    },
    firstDashboard: ['Paying accounts by plan', 'TTFV', 'Activation Rate', 'Active bots', 'Total SBI 7d', 'MRR + churn'],
    claims: [
      { id: 'churn_m1', statement: 'Month-1 churn rate of new paying clients', value: 40, unit: '%', source: 'illustrative example for demo purposes', status: 'estimate', usedIn: [] },
      { id: 'ttfv_baseline', statement: 'Time to first value (signup → first SBI)', value: null, unit: ' days', source: 'estimate', status: 'estimate', usedIn: [] },
    ],
  },

  '03-roadmap': {
    horizons: [
      {
        name: 'H1 (0-3 mo)', objective: 'Stop activation churn, establish analytics baseline',
        initiatives: [
          { name: 'AI Onboarding Concierge', problem: 'New client faces blank canvas, never reaches first SBI', successMetric: '70% of new clients reach first SBI within 24h', owner: 'PM + 1 backend eng' },
          { name: 'Churn survey + vertical segmentation', problem: 'No churn reason data; aggregates hide vertical differences', successMetric: 'Exit survey response rate ≥40%; churn by vertical available', owner: 'PM' },
        ],
      },
      {
        name: 'H2 (3-9 mo)', objective: 'AI core that is hard to copy',
        initiatives: [
          { name: 'Auto-RAG / Voice-to-Knowledge', problem: 'Manual FAQ setup is the top configuration-abandonment driver', successMetric: 'Fallback Rate -30% for Auto-RAG accounts vs control', owner: 'PM + ML eng' },
          { name: 'Vertical packages (beauty, clinics)', problem: 'Generic flows require configuration the client will not do', successMetric: 'TTFV < 1 day for package users', owner: 'PM' },
        ],
      },
      {
        name: 'H3 (9-12+ mo)', objective: 'Channel expansion',
        initiatives: [
          { name: 'Instagram Bot', problem: 'Leads from Instagram go cold at night; competitors already ship this', successMetric: '25% of active accounts attach Instagram in 90 days', owner: 'PM + eng' },
          { name: 'Voice Bot', problem: 'Clinics pay R$2000+/mo for receptionists; no SMB voice product exists', exploratory: true },
        ],
      },
    ],
    claims: [
      { id: 'ig_base_share', statement: 'Share of current base running Instagram profiles', value: 80, unit: '%', source: 'estimate', status: 'estimate', usedIn: [] },
    ],
  },

  '04-scoring': {
    rubric: {
      criteria: [
        { name: 'Reach', weight: 3 }, { name: 'Churn impact', weight: 3 },
        { name: 'Differentiation', weight: 2 }, { name: 'Build complexity (inverted)', weight: 2 },
        { name: 'Monetization fit', weight: 2 }, { name: 'Risk (inverted)', weight: 1 },
      ],
    },
    features: [
      { name: 'Instagram Bot', scores: { Reach: 8, 'Churn impact': 7, Differentiation: 4, 'Build complexity (inverted)': 7, 'Monetization fit': 7, 'Risk (inverted)': 5 } },
      { name: 'Voice Bot', scores: { Reach: 4, 'Churn impact': 5, Differentiation: 9, 'Build complexity (inverted)': 3, 'Monetization fit': 6, 'Risk (inverted)': 3 } },
    ],
    claims: [],
  },

  '05-monetization': {
    recommendedModel: 'Hybrid: low base fee + per-SBI fee with monthly cap',
    verdict: 'conditional',
    dependsOnClaims: ['avg_sbi_month'],
    alternativesConsidered: [
      { model: 'Cheaper fixed starter tier', whyNot: 'Solves buyer remorse but keeps "paid for nothing" churn trigger in low months; weaker differentiation. Remains the fallback if SBI volume data kills hybrid.' },
      { model: 'Longer free trial', whyNot: 'Delays rather than removes the value-delivery question; no revenue alignment.' },
    ],
    sensitivityTable: [
      { 'SBI/month': 10, 'Hybrid revenue': 'R$117', 'Fixed R$199': 'R$199', Delta: '-R$82' },
      { 'SBI/month': 25, 'Hybrid revenue': 'R$147', 'Fixed R$199': 'R$199', Delta: '-R$52' },
      { 'SBI/month': 51, 'Hybrid revenue': 'R$199', 'Fixed R$199': 'R$199', Delta: 'break-even' },
      { 'SBI/month': 100, 'Hybrid revenue': 'R$297 (cap)', 'Fixed R$199': 'R$199', Delta: '+R$98' },
    ],
    breakEven: '51 SBIs/month at R$97 base + R$2/SBI vs fixed R$199. If median is below this ({{claim:avg_sbi_month}}), hybrid is a structural ARPU cut for the migrating base.',
    claims: [
      { id: 'avg_sbi_month', statement: 'Median SBI per active paying account per month', value: null, unit: '', source: 'estimate — requires 30-day instrumented measurement', status: 'estimate', usedIn: [] },
    ],
  },

  '06-review': {
    p0: [
      { issue: 'Hybrid pricing verdict could ship as GREEN without SBI volume data', status: 'fixed', resolution: 'Verdict forced to CONDITIONAL by schema; dependsOnClaims gate added' },
      { issue: 'Instagram-base 80% share had no source', status: 'declared', resolution: 'Marked as estimate in ledger; in data request for v2' },
    ],
    p1: [
      { issue: 'Churn target trajectory not benchmarked against comparable onboarding interventions', note: 'accepted for v0.1; R7-style research planned' },
    ],
  },

  '07-synthesis': {
    tldr: 'BotConversa\u2019s core problem is activation, not acquisition: month-1 churn is {{claim:churn_m1}}, and the highest-leverage fix is the AI Onboarding Concierge (H1). Channels (Instagram, Voice) come after the leaky bucket is fixed \u2014 every channel multiplies by retention rather than adding to it. Hybrid pricing is promising but CONDITIONAL: its break-even sits at 51 SBIs/month and median SBI volume is {{claim:avg_sbi_month}}.',
    sections: [
      {
        title: 'Why activation before channels',
        paragraphs: [
          'Only {{claim:br_chatbot_trust}} of Brazilian consumers report a good chatbot experience \u2014 a new client arrives skeptical and leaves at the first sign of friction. With month-1 churn at {{claim:churn_m1}}, launching new channels routes more traffic into the same broken funnel.',
          'H1 therefore concentrates on the Concierge and the analytics baseline; H2 deepens value (Auto-RAG, vertical packages); H3 expands channels once retention math supports it.',
        ],
        bullets: ['Concierge target: first SBI within 24h for 70% of new activations', 'TTFV baseline to be measured first: {{claim:ttfv_baseline}}'],
      },
      {
        title: 'Competitive picture',
        paragraphs: [
          'SocialHub attacks with CRM depth, Toolzz with AI-first positioning and voice. ManyChat\u2019s gutted free tier creates migration demand. The window is real but not quantified \u2014 regulatory claims stay out of this version until cited.',
        ],
      },
    ],
  },
};

module.exports = fixtures;
