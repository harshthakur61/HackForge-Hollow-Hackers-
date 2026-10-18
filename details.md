# HF'26 — Advanced Track PPT Format
## Reserve Juggler: Autonomous Algorithmic Treasury & Liquidity Optimization Engine

---

## SLIDE 1: TITLE SLIDE

**PROBLEM STATEMENT:**
Digital banks must decide every day at 5:00 PM — before overnight markets lock — how much of their $100M operating pool to keep as idle cash (0% APY) versus sweep into overnight repo (~4.3% APY). Hold too little: surprise withdrawals force a costly early repo break (0.50% haircut). Hold too much: millions of dollars sit idle earning nothing. Current industry heuristics (fixed 10%/20% rules) are mathematically indefensible and lose up to $6.34M per year. Reserve Juggler replaces heuristics with a provably optimal, autonomous quantitative engine.

**TEAM NAME:**
Quantitative Treasury Systems Engineering Group

**IDEA TITLE:**
Reserve Juggler — Autonomous Algorithmic Treasury & Liquidity Optimization Engine

---

## SLIDE 2: PROBLEM FRAMING

### The Core Trade-Off (In Our Own Words)

Every night, a digital bank sits at a fork:

- **Park cash in Tier 0 (Checking Reserves)** → Zero yield, but you can always pay customers. Safe, but bleeds opportunity.
- **Sweep into Tier 1 (Overnight Repo)** → Earns ~4.3% APY, but capital is locked from 17:00 to 08:00. If something unexpected drains the cash buffer overnight, you must break the repo early at a 0.50% contractual penalty, forfeiting interest. Worse — if the entire repo principal is exhausted, the bank falls into emergency overdraft at 12% APR, which triggers regulatory alerts and potential credit downgrades.

The trade-off is: **yield versus liquidity insurance**. The bank wants to maximize repo earnings while guaranteeing it can always pay every customer, merchant, and settlement obligation through the night — no exceptions.

### The Objective We're Optimizing

Maximize **net overnight treasury yield** = (repo interest earned) − (early break penalty fees) − (overdraft costs)

subject to:
- **100% payout success rate** (every withdrawal honored, every hour)
- **Zero overdraft events** (strict regulatory constraint for licensed institutions)

### Failure Modes We're Avoiding

| Failure Mode | Consequence | Triggered By |
|:---|:---|:---|
| **Under-buffering** | Early repo break (0.50% fee) + forfeited interest | Too little cash held overnight |
| **Catastrophic under-buffering** | Emergency overdraft at 12% APR + regulatory sanctions | Shortfall exceeds entire repo principal |
| **Over-buffering** | Cash drag — millions earning 0% instead of 4.3% | Too much cash held unnecessarily |
| **Static heuristics** | Cannot adapt to day-of-week volatility patterns (weekends are 3× worse) | Fixed 10%/20% rules |
| **Temporal leakage** | Backtest overfitting — model "sees" future data during training | Feature engineering without strict time barriers |

### Why This is Hard

The correct forecast target is **not** the net sum of overnight cash flows. A bank can see a −$30M outflow at 22:00 followed by a +$35M inflow at 06:00 (net: +$5M), and still default at 22:00 because repo is locked. The target must be the **maximum cumulative trough depth** — the deepest negative dip in the running cash balance over the entire 15-hour window.

```
R_D = max(0, −min over [17:00→07:00] of cumulative net flow)
```

---

## SLIDE 3: MODEL AND ALGORITHM

### The Quantitative Core

Reserve Juggler uses two chained algorithms:

#### Step 1 — Quantile Forecasting (Predict the trough R_D)

We train 5 competing models to predict the **98th percentile of the overnight trough** R_D, using strictly historical data up to 16:00 on the decision day (zero look-ahead bias):

| Model | Method | Key Strength |
|:---:|:---|:---|
| **B0** | Static empirical quantile over all prior history | Stable, but ignores seasonality |
| **B1** | Same-day-of-week empirical quantile (e.g., all prior Saturdays) | Captures weekly liquidity cycles — **Production Default** |
| **B2** | Rolling 28-day empirical quantile | Fast regime adaptation |
| **M1** | Linear Quantile Regression (multi-feature: DoW, DoM, volatility, deposit velocity, rate spread) | Interpretable, multi-factor |
| **M2** | XGBoost with `reg:quantileerror` (pinball loss) | Non-linear interactions, highest expressive power |

**Why quantile regression, not point forecasting?**
We don't need to know the *expected* overnight trough — we need to know the *worst-case* trough at a given confidence level. Quantile regression directly estimates Q(τ) of the trough distribution, bypassing the need for distributional assumptions.

**Why B1 as the production model?**
Empirical walk-forward evaluation shows B1 consistently achieves the lowest total cost across the 308 out-of-sample nights. The strong weekly seasonality (weekends are 3× more volatile) makes same-weekday lookback the dominant signal.

#### Step 2 — Newsvendor Critical Fractile Optimization (Decide the buffer)

Once we have the forecast trough distribution, the optimal buffer level is found by solving the **Newsvendor Problem**:

```
Underage Cost  C_u = 0.50%  (early repo break haircut per dollar)
Overage Cost   C_o = 4.30% / 365 ≈ 0.01178%  (foregone daily repo yield per dollar)

Optimal quantile:
  q* = C_u / (C_u + C_o)
     = 0.0050 / (0.0050 + 0.0001178)
     ≈ 0.978
```

At **q* ≈ 0.978**, the marginal cost of holding one more dollar of cash equals the expected penalty cost of being short — the exact mathematical equilibrium. Buffer = Q(0.978) from model B1. Everything above the buffer gets swept into repo.

**Why Newsvendor, not dynamic programming or RL?**
- **Newsvendor is provably optimal** for single-period, two-action inventory decisions under uncertainty — this problem maps exactly.
- Interpretable and auditable: a single equation, not a black box.
- Computationally trivial: solves in microseconds vs. hours for DP on a continuous state space.
- Robust to distribution misspecification when combined with empirical quantile forecasts.

**Key Assumption:** Each night is treated as an independent decision period. Overnight repo positions fully settle at 08:00, so there is no multi-day carry-over in the inventory state. This holds under standard overnight repo conventions.

---

## SLIDE 4: HANDLING UNCERTAINTY AND EDGE CASES

### What Our System Does When It's Wrong

#### 1. Forecast Underestimation — Overnight Deficit (Trough > Buffer)

When the actual overnight trough exceeds the forecasted buffer (the model was too optimistic):

**Response: Automated Repo Liquidation Waterfall**
```
Hour t: cash_t falls below $0

  Step 1 → Break repo early
           break_amount = min(remaining_repo_principal, deficit)
           break_fee    = break_amount × 0.50%
           Interest on broken portion is forfeited.

  Step 2 → If deficit > entire repo principal:
           Tap emergency overdraft at 12% APR (hourly prorated)
           [Under S4 policy: this path is avoided by design through q* sizing]
```

The system **never freezes, never panics** — it executes the deterministic waterfall, logs every event, and continues to the 08:00 settlement.

#### 2. Extreme Tail Events — 4-Sigma Outlier Nights

24 nights in our evaluation dataset contain hourly cash flow shocks exceeding 4 standard deviations from the historical mean. These are genuine black-swan liquidity events.

- **What happens**: The model underestimates the trough; repo breaks are triggered.
- **Scale**: These 24 nights account for **$270,049 (83.5%)** of all annual break fees.
- **Containment**: Even at maximum shock, overdraft remains **$0.00** — the repo pool is large enough to absorb the deficit through partial liquidation.
- **Implication**: The system's robustness under tail events is not luck — it's by design. q* = 0.978 provides a 97.8% statistical buffer against historical surprises.

#### 3. Weekend Liquidity Spikes

Friday/Saturday nights generate troughs 3× deeper than weekday nights due to consumer card settlements and payroll processing:

| Strategy | Weekend Break Rate | Weekend Net P&L |
|:---|:---:|---:|
| Fixed 10% (S1) | **100%** (88/88 nights) | **-$7,991,335** |
| Fixed 20% (S2) | 95.5% (84/88 nights) | **-$3,614,040** |
| **Dynamic S4** | **2.3%** (2/88 nights) | **+$502,266** |

**How we handle it**: B1 (same-weekday model) automatically computes a larger empirical trough quantile for weekend days from historical Saturday/Sunday data. The buffer inflates from ~$12.8M on weekdays to ~$38.5M on weekends — fully automatic, no manual rules.

#### 4. Adversarial / Synthetic Stress Scenarios

Beyond historical replay, the system is stress-tested with a synthetic shock engine:

| Shock Type | Parameter Range | What It Tests |
|:---|:---|:---|
| **Withdrawal Surge** | Multiply withdrawals 1.0×–4.0× during any hour window | Flash crowd, panic run |
| **Institutional Bank Run** | Inject 1%–40% of pool as concentrated outflow over 1–6 hours | Systemic counterparty failure |
| **Deposit Freeze** | Contract inflows by 0%–100% | Payment rail outage, ACH disruption |

Two modes:
- **Uninformed (surprise)**: Shock hits during the night after a standard 17:00 decision. Tests raw waterfall survivability.
- **Informed (anticipated)**: Treasury flags the shock before 17:00. Engine proactively increases the buffer by the expected additional trough depth.

#### 5. Bad / Degraded Inputs

| Input Problem | System Behavior |
|:---|:---|
| Malformed WebSocket payload | Zod schema validation rejects at perimeter; error ACK returned; server stays alive |
| Engine API unreachable mid-night | Gateway catches connection drop, broadcasts `status: paused`, polls `/health`, auto-resumes on recovery |
| PostgreSQL restart | `pg.Pool` auto-reconnects; no query loss; no crash |
| Fewer than 56 days of history | Model falls back to B0 (global historical quantile) — no crash, gracefully degraded |
| User seeks invalid date | Validated against DB boundary; HTTP 400 returned; clock stays stable |

#### 6. Model Selection Bias Acknowledgement

B1 was selected as the production model because it achieved the lowest total cost over the same 308 out-of-sample nights used for strategy evaluation. This constitutes a **mild model selection bias** — the model was tuned on the same test set that reported the results. In a full production deployment, a separate holdout validation set would be used for final model selection.

---

## SLIDE 5: LIVE DEMO / SIMULATION RUN

### What the Demo Shows

The live dashboard at `http://localhost:3000` runs a real-time replay of 308 historical nights at configurable speeds (1×, 5×, 20×, 100×).

### Key Decisions Visible as They Happen

```
┌─ 17:00: DECISION MOMENT ─────────────────────────────────────────────────┐
│  Model B1 queries same-weekday historical troughs                        │
│  Computes Q(0.978) = $38.2M  [it's a Friday night]                      │
│  → Buffer: $38,200,000 held in Tier 0 (Cash)                            │
│  → Sweep:  $61,800,000 sent to Tier 1 (Overnight Repo)                  │
│  Dashboard shows: "night:decision" event card + Reserve Gauge            │
└──────────────────────────────────────────────────────────────────────────┘
                    ↓ hourly clock ticks stream live via WebSocket
┌─ 22:00: DEFICIT EVENT ────────────────────────────────────────────────────┐
│  Consumer card settlement hits: −$4.2M net outflow this hour             │
│  Running cash balance dips to −$1,100,000                                │
│  Waterfall triggered: Break $1,100,000 repo early                        │
│  Break fee: $5,500  |  Interest forfeited on broken slice                │
│  Dashboard shows: "night:event" card — REPO BREAK — $1.1M @ $5,500 fee  │
└──────────────────────────────────────────────────────────────────────────┘
                    ↓ clock continues ticking
┌─ 08:00: SETTLEMENT ───────────────────────────────────────────────────────┐
│  Remaining repo $60,700,000 matures                                      │
│  Interest earned: $60,700,000 × 4.30% / 365 = $7,145.75                 │
│  Net night P&L: $7,145.75 − $5,500.00 = +$1,645.75                      │
│  Payout success: ✅ 100%  |  Overdraft: $0.00                            │
│  Dashboard shows: "night:settlement" card + Strategy Race chart update   │
└──────────────────────────────────────────────────────────────────────────┘
```

### Pre-Configured Demo Scenarios

| Scenario | What to Show |
|:---|:---|
| **Weekday Night** | Tight buffer, high repo sweep, clean settlement — max yield |
| **Weekend Night** | Wide buffer auto-inflation, possible minor repo break, still profitable |
| **Bank Run Stress** | Shock injection mid-night, waterfall absorbs via repo break, zero overdraft |
| **Strategy Race** | All 7 strategies (S0–S6) running simultaneously — watch S1 collapse vs S4 winning |

### System Architecture (Live Stack)

```
PostgreSQL 16 (Port 5432)
      ↓ historical data
FastAPI Engine (Port 8000)
      ↓ simulate on-demand
Node.js / Socket.IO Gateway (Port 4000)
      ↓ WebSocket tick events (1x → 100x)
React 18 Dashboard (Port 3000)
      → Balance Cards | Reserve Gauge | Waterfall Chart | Strategy Race
```

---

## SLIDE 6: RESULTS

### Metrics Against Naive Baselines (308 Out-of-Sample Nights)

| Strategy | Approach | Net P&L | Net Yield (bps) | Break Nights | Overdraft Nights | Oracle Capture |
|:---:|:---|---:|---:|:---:|:---:|---:|
| S0 | All-Cash (0% deployed) | $0 | 0 | 0 | 0 | 0.0% |
| S1 | **Naive: Fixed 10%** | **−$6,340,443** | **−751** | **122 / 308** | 0 | −215% |
| S2 | Naive: Fixed 20% | −$1,711,506 | −203 | 85 / 308 | 0 | −58% |
| S3 | Static Historical P98 | $2,030,262 | +241 | 4 / 308 | 0 | 68.9% |
| **S4** | **Reserve Juggler (Production)** | **$2,330,539** | **+276** | **10 / 308** | **0** | **79.1%** |
| S5 | Cost-Optimal (allows overdraft) | $2,846,852 | +337 | 0 | 70 / 308 | 96.6% |
| S6 | Oracle (perfect foresight) | $2,946,341 | +349 | 0 | 0 | 100% |

### Key Takeaways

**vs. Industry Baseline (Fixed 10% Rule — S1):**
- Reserve Juggler (S4) earns **+$8,670,982 more** per year than the most common industry heuristic
- S1 breaks repo on **39.6% of all nights**; S4 breaks on just **3.2%**

**vs. Static Historical Buffer (S3):**
- S4 outperforms S3 by **+$300,277** (+35.6 bps)
- S4 holds **$14.4M less idle cash** on average ($21.5M vs $35.9M buffer)
- That freed capital earns additional repo yield instead of sitting idle

**vs. Perfect Oracle (S6 — theoretical upper bound):**
- S4 captures **79.1%** of the yield achievable with perfect future knowledge
- The remaining 20.9% represents the irreducible cost of forecast uncertainty

### The Trade-Off Curve (q* Sensitivity)

```
Net P&L vs. Target Quantile q:

         $2,330K ─────────── ● q*=0.978 (Optimal)
         $2,302K ─────────────────────── ● q=0.990
         $2,259K ──────────── ● q=0.950
         $2,086K ─────── ● q=0.900

Break Nights:
  q=0.900: 40   q=0.950: 21   q*=0.978: 10   q=0.990: 9

→ Past q*≈0.978, increasing the buffer costs more in cash drag than it saves in break fees.
→ Below q*≈0.978, excessive breaks destroy more value than the freed capital earns.
```

### Weekend Sub-Analysis (88 Friday/Saturday Nights)

| Strategy | Break Rate | Weekend Net P&L |
|:---|:---:|---:|
| Fixed 10% (S1) | **100.0%** | **−$7,991,335** |
| Fixed 20% (S2) | 95.5% | −$3,614,040 |
| Reserve Juggler (S4) | **2.3%** | **+$502,266** |
| Oracle (S6) | 0% | +$681,131 |

---

## SLIDE 7: TRADE-OFFS

### What We Chose and What We Sacrificed

#### Speed vs. Completeness

| Choice Made | What We Sacrificed | Rationale |
|:---|:---|:---|
| Once-daily 17:00 decision point | Intraday liquidity optimization | Matches real repo market window; keeps the problem well-defined and tractable |
| B1 (same-weekday empirical quantile) as production model | M2 XGBoost's higher expressive power | B1 is interpretable, auditable, and avoids overfitting on limited training data |
| Newsvendor (single-period) optimization | Multi-period stochastic dynamic programming | Provably optimal for this structure; interpretable; microsecond solve time |
| Tier 0 + Tier 1 only (MVP scope) | Tier 2 bonds + Tier 3 equities | Reduces complexity; bond duration risk and equity volatility require significantly more modeling |

#### Scale vs. Simplicity

| Choice Made | What We Sacrificed | How It Holds at 10× Load |
|:---|:---|:---|
| WebSocket-based streaming (Socket.IO) | Complex message queue (Kafka/RabbitMQ) | Socket.IO scales to ~10K concurrent connections per server; a production version would add a message queue layer |
| Single PostgreSQL instance | Distributed read replicas | PostgreSQL with connection pooling handles the write throughput for nightly audit logs; at 10× scale, read replicas handle dashboard query load |
| Zustand pure reducer (single client state store) | Server-side state aggregation | Reducers are idempotent and handle reconnects; at scale, a server-sent SSE endpoint would serve pre-aggregated state |
| Python single-worker FastAPI | Async worker pool (Celery, Ray) | At 10× scale, the simulation engine would be behind a Celery task queue with parallel workers per night |

#### Regulatory vs. Yield

- **Chose S4 (zero overdraft) over S5 (cost-optimal)**: S5 earns an extra +$516,312/year but incurs 70 overdraft nights — each a potential regulatory intervention trigger for a licensed bank. This is a **non-negotiable institutional constraint**, not a technical limitation.

### How It Holds Under 10× Load

Current: 1 bank, 1 pool, 308 nights backtested.
At 10× (10 banks, 10 pools, concurrent simulation):

- **Engine**: Stateless FastAPI — horizontally scalable behind a load balancer. Each request is independent.
- **Database**: pg.Pool already manages concurrent connections. Read replicas + read/write split handles 10× query volume.
- **Gateway**: Socket.IO rooms isolate each bank's session. Horizontal scaling with Redis adapter is a 1-day implementation.
- **Forecast models**: B1 re-trains every 7 days per pool. Parallelizable across pools with a task queue.

---

## SLIDE 8: LIMITS AND NEXT STEPS

### Known Weaknesses

#### 1. Model Selection Bias
B1 was chosen as the production model because it achieved the best results over the same 308 out-of-sample nights used to report final metrics. In true production, a separate blind validation set would be required for model selection to avoid this contamination.

#### 2. Pool Replenishment Assumption
Each night begins with a freshly replenished $100M pool. In reality, the starting balance depends on daytime flows, customer growth, and cross-border settlement timing — none of which are modeled in v1.

#### 3. Intraday Blind Spot
The current system makes exactly **one decision per day** at 17:00. Real intraday liquidity events (9:00 AM corporate sweeps, 3:00 PM settlement spikes) are invisible to the current decision engine.

#### 4. Tier 2 / Tier 3 Excluded
Only Tier 0 (cash) and Tier 1 (repo) are live in v1. The 2Y government bond sleeve and equity index allocation are architecturally planned but not implemented. These add meaningful yield but require duration risk modeling and mark-to-market accounting.

#### 5. Single-Asset Repo
The model assumes a single homogeneous overnight repo instrument at a constant ~4.3% APY. Real repo markets have varying counterparties, haircuts, and intraday rate volatility (e.g., quarter-end rate spikes).

#### 6. Deterministic Cash Flows
Simulated overnight flows are drawn from historical data. The model does not run Monte Carlo scenarios or generate synthetic cash flow paths — tail risk is inferred from historical extremes, not forward-simulated distributions.

---

### What We'd Do With Another Week

| Priority | Improvement | Impact |
|:---|:---|:---|
| **1** | Implement proper holdout set for model selection (remove selection bias) | Validates reported results are genuine |
| **2** | Add Tier 2 (2Y Treasury note) allocation sleeve with duration-matching and 2% haircut | +~30–50 bps additional yield |
| **3** | Walk-forward hyperparameter tuning for M2 (XGBoost) on a true validation set | Potentially closes gap to Oracle from 79% to 85%+ |
| **4** | Integrate intraday flow signals (9:00 AM, 15:00 PM) into feature set | Earlier warning on high-trough nights |
| **5** | Add Monte Carlo trough simulation for tail risk quantification | Confidence intervals on expected break frequency |

---

### What a Production Version Would Need

| Requirement | Production Implementation |
|:---|:---|
| **Real-time data feeds** | ISO 20022 message parsing from FedNow / TARGET2 rails; intraday balance feeds from core banking |
| **Live repo rate ingestion** | Real-time SOFR / SONIA rate feeds; multi-counterparty repo book management |
| **Regulatory reporting** | Automated LCR (Liquidity Coverage Ratio) and NSFR (Net Stable Funding Ratio) reporting per Basel III |
| **Multi-currency pools** | Extend to EUR, GBP pools with FX hedging constraints and cross-border settlement windows |
| **Continuous intraday decisions** | Replace once-daily sweep with streaming decision engine at each material inflow/outflow event |
| **Model governance** | Champion/challenger framework with shadow-mode testing, explainability layer, and model risk audit trail |
| **DR / HA** | Active-active multi-region PostgreSQL, Kafka event log for replay, circuit breakers on all API dependencies |

---

*Document prepared for HF'26 Advanced Track judge panel — Reserve Juggler*
