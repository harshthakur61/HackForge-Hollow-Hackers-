# Reserve Juggler: 4-Minute Executive Demo Script & Q&A

This demo script walks an executive or treasury committee through Reserve Juggler's capabilities using the live dashboard (`http://localhost:3000`).

All dates and scenarios were selected programmatically from PostgreSQL `decisions` and `market_data` tables (`server/scripts/pick_demo_nights.py`).

---

## 1. Selected Demo Scenarios

| Scenario | Date | Category | Key Characteristics |
|:---|:---|:---|:---|
| **Scenario 1** | **`2026-10-03`** | Saturday Heavy Drain Covered | **$41.2M actual drawdown** covered by **$42.3M buffer**. Zero break fees, zero overdrafts. Net P&L: **+$6,353.37**. |
| **Scenario 2** | **`2026-08-15`** | Mid-Month Payday Spike | **$33.8M drawdown** on the 15th covered by **$38.1M buffer**. Net P&L: **+$6,801.71**. |
| **Scenario 3** | **`2026-07-03`** | >4-Sigma Shock & Repo Break | **$47.5M drawdown** exceeds $38.0M buffer. **$9.5M repo broken early** with **$47,650.46 fee**. **Zero overdraft**. |

---

## 2. 4-Minute Step-by-Step Demo Script

### Minute 1: The Problem & The Baseline (0:00 – 1:00)
- **Action**: Open `http://localhost:3000`. Point out the Top Bar: simulated clock (`2026-02-26 17:00`), connection status pill (`Connected`), phase badge (`DAY` / `NIGHT`), and the Tier Balance cards.
- **What to say**:
  > *"Every evening at 17:00, our digital bank moves tens of millions in customer deposits and withdrawals. We face a high-stakes trade-off: every dollar left in Tier 0 Cash earns zero interest, while every dollar swept into overnight repo earns ~4.3% APY. But breaking repo early costs a 0.50% penalty fee, and dipping into emergency overdraft costs a punitive 12% APR.
  >
  > Most banks rely on crude heuristics like keeping a fixed 10% or 20% in cash. As our historical audit table shows below, a fixed 10% rule-of-thumb lost over $6.3 million because weekend liquidity drains routinely exceed $25 million. Reserve Juggler replaces heuristics with an autonomous, mathematically rigorous policy engine."*

---

### Minute 2: Scenario 1 — Weekend Outflow Mastery (1:00 – 2:00)
- **Action**: In the **Demo** dropdown, select **`2026-10-03: Saturday Large Drain ($41.2M covered)`**. Select speed **`20x`** (or `5x`). Click **Start Replay**.
- **What to watch**:
  1. At 17:00, the sweep decision executes: **Buffer allocated = $42.3M**, **Repo swept = $57.7M**.
  2. The Reserve Gauge shows the buffer comfortably set at the B1 Model $P98$ forecast.
  3. As the night progresses from 17:00 to 07:00, the cash balance plunges by over $41M.
  4. At 08:00, repo matures with zero early redemptions. The **COVERED** badge appears.
- **What to say**:
  > *"Notice October 3rd, a Saturday. The policy engine recognized the weekend calendar signature and expanded our cash buffer to $42.3M. Overnight, customer net outflows drained $41.2M. Under a fixed 10% policy, we would have broken repo and lost thousands in fees. Here, the buffer absorbed the shock with $1.1M to spare, earning $6,353 in overnight interest without a single penalty fee."*

---

### Minute 3: Scenario 2 & 3 — Payday Spikes & Repo Break Defense (2:00 – 3:00)
- **Action 1**: In the **Demo** dropdown, select **`2026-08-15: Payday Spike ($33.8M mid-month drain)`**.
- **What to say**:
  > *"On the 15th of the month, payroll batches hit accounts. The policy engine adapts, allocating $38.1M in buffer and fully absorbing the $33.8M drawdown."*
- **Action 2**: In the **Demo** dropdown, select **`2026-07-03: >4-Sigma Shock & Repo Break ($9.5M broken)`**.
- **What to watch**:
  1. At 21:00 or 22:00, cash drops below zero.
  2. A red vertical marker appears on the Night Chart, and the Event Feed logs `Repo early redemption break: $9,530,092`.
  3. Tier 1 Repo balance immediately drops by $9.53M to replenish Tier 0 Cash.
  4. Overdraft remains strictly **$0.0M**.
- **What to say**:
  > *"Now watch July 3rd, heading into the holiday weekend. An unprecedented 4-sigma withdrawal shock hit the bank. The outflow exceeded our forecast buffer by $9.5 million.
  >
  > Under our Zero-Overdraft policy, the engine instantly executed an early repo break: $9.53M was liquidated from Tier 1 to restore Tier 0 Cash, paying a $47.7k haircut fee. Notice that the emergency overdraft card stayed at exactly zero. The waterfall protected the bank from regulatory overdraft sanctions."*

---

### Minute 4: Economics, The Race, and The Price of Safety (3:00 – 4:00)
- **Action**: Scroll to the **Cumulative Performance KPI Strip** and the **Multi-Strategy Race Chart**. Toggle S4, S5, and S6 Oracle lines.
- **What to say**:
  > *"Across the entire 308-night backtest, Reserve Juggler delivered **$2,330,538.98 in Net P&L**, achieving an annualized net yield of **276.2 bps** on the $100M pool and capturing **79.1%** of the theoretical Oracle upper bound.
  >
  > What if our credit line permitted overdrafts? Toggle to S5, our Cost-Optimal policy: Net P&L rises to $2.85M (+61 bps). The difference—**$516,312.63**—is what we call the **Price of Safety**. It is the exact cost of guaranteeing zero central bank overdrafts.
  >
  > Every decision is auditable down to the cent in our Decision Audit Log. The system is deterministic, fully automated, and ready for production deployment."*

---

## 3. Executive Q&A

### Q1: Why zero overdraft by default?
**Answer**:
> In banking, emergency overdraft is not merely an interest expense; it is a regulatory event. Dipping into an unarranged sponsor bank overdraft or central bank liquidity facility signals liquidity distress, triggers heightened supervisory oversight, and can lead to rating downgrades or increased deposit insurance premiums. The 0.50% repo break fee is an orderly contractual transaction; an emergency overdraft is an operational failure. Therefore, zero overdraft ($S4$) is our non-negotiable default.

### Q2: Why not predict the shocks?
**Answer**:
> Extreme >4-sigma liquidity shocks (e.g. sudden corporate treasury transfers or market sell-offs) are by definition unpredictable tail events with near-zero historical recurrence. Attempting to fit complex non-linear models to predict idiosyncratic shocks invariably results in severe over-fitting, false alarms, and excessive cash drag during normal operations.
>
> Instead of futilely trying to forecast the timing of black-swan shocks, Reserve Juggler applies **quantile regression combined with an early-redemption waterfall**. We forecast the predictable distribution of everyday flows accurately and rely on deterministic repo liquidation to absorb unpredictable shocks safely.

### Q3: What is the Oracle?
**Answer**:
> The Oracle ($S6$) is a theoretical benchmark computed with perfect hindsight. For each night, it looks at the exact minimum cash flow that occurred overnight and sweeps precisely $(100\text{M} - \text{actual trough})$ into repo. It incurs $0 in break fees and $0 in overdrafts.
>
> It cannot be deployed in production because no one has perfect foresight of future transactions. We include it in our dashboard and reports as a mathematical upper bound to measure our **Capture Ratio** ($79.1\%$ for $S4$, $96.6\%$ for $S5$).

### Q4: How is look-ahead prevented?
**Answer**:
> Strict temporal barriers are enforced across our entire architecture:
> 1. **Feature Separation**: At 17:00 on day $D$, features may use *only* market rows timestamped on or before $D$ 16:00. The flows that occur between 17:00 and 18:00 happen *after* the decision is executed.
> 2. **Walk-Forward Expanding Window**: Models are trained solely on prior history (days $1 \dots D-1$) and retrained every 7 nights. No row from night $D$ or later is ever present in the training set.
> 3. **Contract Guarantees**: Our backend endpoints (`/night/:date`, `/forecast/:date`) never expose future actual drawdowns to decision algorithms.

### Q5: What changes with a real balance sheet?
**Answer**:
> In this MVP, we modeled a single $100M pool with Tier 0 Cash and Tier 1 Overnight Repo. On a live institutional balance sheet:
> 1. **Multi-Asset Waterfall**: Tier 2 (2Y Government Bonds with duration risk and 2% haircut) and Tier 3 (Equity indices with 15% haircut) would be dynamically allocated using mean-variance optimization subject to liquidity coverage constraints (LCR).
> 2. **Intraday Liquidity**: The sweep window would operate continuously rather than once a day, interfacing via ISO 20022 messaging with real-time gross settlement (RTGS) systems like FedNow or TARGET2.
> 3. **Behavioral Customer Modeling**: Instead of modeling aggregate net flow as a single time series, customer balances would be segmented by behavioral stickiness (retail deposits vs volatile institutional deposits).
