# Reserve Juggler: Strategy Performance & Backtest Results

This document presents the complete empirical results computed from the walk-forward evaluation dataset across 308 out-of-sample nights (indices 56 to 363, covering 2026-02-26 through 2026-12-30).

Every figure in this document is derived from deterministic policy execution over the historical dataset (`market_data` in PostgreSQL).

---

## 1. Summary of Evaluated Strategies

All strategies start each night at 17:00 with a replenished pool of **$100,000,000.00**. Decisions are executed at 17:00 and simulated hour-by-hour over the 15-hour overnight window through 08:00 maturity.

- **`S0_all_cash`**: $100M held entirely in Tier 0 Cash (0% APY). Zero interest, zero risk.
- **`S1_fixed_10`**: Fixed 10% ($10M) cash buffer; remaining $90M swept to repo.
- **`S2_fixed_20`**: Fixed 20% ($20M) cash buffer; remaining $80M swept to repo.
- **`S3_static`**: Static buffer set to the historical P98 of the overnight trough prior to index 56 (~$35.9M); remainder swept to repo.
- **`S4_policy_zero_overdraft`** (Production Default): Dynamic reserve buffer using Model B1 (day-of-week empirical quantile) at critical fractile $q^* \approx 0.98$. Overnight cash deficits are covered by breaking repo early (0.50% haircut). Zero emergency overdrafts.
- **`S5_policy_cost_optimal`**: Dynamic reserve buffer using Model B1 at cost-optimal quantile $q^* \approx 0.75$. Deficits are absorbed via emergency overdraft (12.0% APR) rather than breaking repo early.
- **`S6_oracle`**: Perfect foresight upper bound. Sweeps exactly $(100\text{M} - \text{actual required buffer})$; zero breaks, zero overdrafts. Not deployable in production.

---

## 2. Overall Performance (All 308 Evaluation Nights)

### Table 1: Comprehensive Strategy Performance

| Strategy | Total Interest ($) | Break Fees ($) | Overdraft Cost ($) | Net P&L ($) | Net Yield (bps) | Mean Buffer ($) | Break Nights | Overdraft Nights | Worst Shortfall ($) | Payout Success | Capture Ratio |
|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `S0_all_cash` | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 100,000,000.00 | 0 | 0 | 0.00 | 100.0% | 0.0000 |
| `S1_fixed_10` | 2,849,267.82 | 9,189,711.28 | 0.00 | -6,340,443.46 | -751.38 | 10,000,000.00 | 122 | 0 | 36,660,691.28 | 100.0% | -2.1520 |
| `S2_fixed_20` | 2,617,273.10 | 4,328,779.12 | 0.00 | -1,711,506.01 | -202.82 | 20,000,000.00 | 85 | 0 | 26,660,691.28 | 100.0% | -0.5809 |
| `S3_static` | 2,168,742.21 | 138,479.82 | 0.00 | 2,030,262.39 | 240.60 | 35,945,807.02 | 4 | 0 | 10,869,569.69 | 100.0% | 0.6891 |
| **`S4_policy_zero_overdraft`** | **2,653,808.27** | **323,269.29** | **0.00** | **2,330,538.98** | **276.18** | **21,522,953.54** | **10** | **0** | **18,941,086.62** | **100.0%** | **0.7910** |
| `S5_policy_cost_optimal` | 2,866,323.24 | 0.00 | 19,471.63 | 2,846,851.61 | 337.37 | 15,460,999.97 | 0 | 70 | 21,153,755.59 | 100.0% | 0.9662 |
| `S6_oracle` | 2,946,341.25 | 0.00 | 0.00 | 2,946,341.25 | 349.16 | 13,103,605.46 | 0 | 0 | 0.00 | 100.0% | 1.0000 |

### Key Takeaways:
1. **Rule-of-Thumb Baselines Collapse**: Fixed 10% and fixed 20% heuristics are catastrophic failures in production. Because liquidity troughs frequently exceed $25M on weekends, $S1$ incurs $9.19M in early redemption penalty fees across 122 nights, producing a **-$6.34M net loss**.
2. **Policy Engine Superiority**: The production policy ($S4$) captures **79.1%** of the theoretical Oracle upper bound ($2.33M vs $2.95M), outperforming the static baseline ($S3$) by **+$300,276.59** (+35.6 bps) while holding $14.4M less idle cash on average.
3. **Zero Overdraft Guarantee**: $S4$ honors 100% of payout obligations and incurs **exactly 0 overdraft nights** across the entire 308-night backtest.

---

## 3. The Price of Safety ($S5 - S4$)

The trade-off between strict zero-overdraft compliance and cost-minimization is quantified by the **Price of Safety**:

$$\text{Price of Safety} = \text{Net P\&L}(S5) - \text{Net P\&L}(S4) = \$2,846,851.61 - \$2,330,538.98 = \mathbf{\$516,312.63}$$

- **Yield Premium**: Allowing emergency overdrafts increases net yield by **61.19 bps** (from 276.18 bps to 337.37 bps).
- **Operational Reality**: To achieve that extra $516k, $S5$ operates with an overdraft facility on **70 out of 308 nights** (22.7% of all nights). For a licensed banking institution, triggering emergency central bank or sponsor bank overdrafts on 70 nights a year presents existential regulatory and counterparty risks. Hence, **$S4$ is the non-negotiable production default**.

---

## 4. Weekend Dynamics (Friday & Saturday Nights Only — 88 Nights)

Friday and Saturday nights exhibit the largest liquidity outflows of the week due to weekend consumer spending, settlement holds, and payroll processing.

### Table 2: Weekend Performance (88 Nights)

| Strategy | Total Interest ($) | Break Fees ($) | Overdraft Cost ($) | Net P&L ($) | Net Yield (bps) | Mean Buffer ($) | Break Nights | Overdraft Nights | Worst Shortfall ($) | Capture Ratio |
|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `S0_all_cash` | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 100,000,000.00 | 0 | 0 | 0.00 | 0.0000 |
| `S1_fixed_10` | 681,130.89 | 8,672,465.89 | 0.00 | -7,991,335.00 | -3314.59 | 10,000,000.00 | 88 | 0 | 36,660,691.28 | -11.7325 |
| `S2_fixed_20` | 680,644.77 | 4,294,684.50 | 0.00 | -3,614,039.72 | -1499.01 | 20,000,000.00 | 84 | 0 | 26,660,691.28 | -5.3059 |
| `S3_static` | 617,582.21 | 138,479.82 | 0.00 | 479,102.39 | 198.72 | 35,943,850.33 | 4 | 0 | 10,869,569.69 | 0.7034 |
| `S4_policy_zero_overdraft` | 593,560.99 | 91,295.47 | 0.00 | 502,265.51 | 208.33 | 38,515,092.92 | 2 | 0 | 9,530,092.24 | 0.7374 |
| `S5_policy_cost_optimal` | 655,052.18 | 0.00 | 4,150.96 | 650,901.22 | 269.98 | 32,389,201.96 | 0 | 23 | 13,744,937.59 | 0.9556 |
| `S6_oracle` | 681,130.89 | 0.00 | 0.00 | 681,130.89 | 282.51 | 29,710,149.75 | 0 | 0 | 0.00 | 1.0000 |

### Findings:
- Fixed 10% breaks **100% of Friday and Saturday nights** (88/88 nights), losing $7.99M on weekends alone.
- $S4$ automatically widens its reserve buffer to an average of **$38.52M** on weekends (compared to $21.52M on weekdays). As a result, it breaks on only **2 out of 88 weekend nights**, generating $502,265.51 in net interest.

---

## 5. Tail Risk & Outlier Shocks (>4-Sigma Outlier Nights — 24 Nights)

Outlier nights are defined as dates containing an hourly deposit or withdrawal shock exceeding 4 standard deviations from the hour-of-day mean.

### Table 3: Performance Under Extreme Liquidity Stress (24 Nights)

| Strategy | Total Interest ($) | Break Fees ($) | Overdraft Cost ($) | Net P&L ($) | Net Yield (bps) | Mean Buffer ($) | Break Nights | Overdraft Nights | Worst Shortfall ($) |
|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `S0_all_cash` | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 100,000,000.00 | 0 | 0 | 0.00 |
| `S1_fixed_10` | 238,696.09 | 779,954.05 | 0.00 | -541,257.96 | -759.84 | 10,000,000.00 | 11 | 0 | 36,660,691.28 |
| `S2_fixed_20` | 218,788.18 | 393,943.68 | 0.00 | -175,155.50 | -245.89 | 20,000,000.00 | 5 | 0 | 26,660,691.28 |
| `S3_static` | 180,074.63 | 101,831.42 | 0.00 | 78,243.22 | 109.84 | 35,876,975.91 | 2 | 0 | 10,869,569.69 |
| `S4_policy_zero_overdraft` | 226,709.88 | 270,049.56 | 0.00 | -43,339.69 | -60.84 | 18,164,178.24 | 6 | 0 | 18,941,086.62 |
| `S5_policy_cost_optimal` | 249,345.73 | 0.00 | 9,841.15 | 239,504.58 | 336.23 | 12,269,079.45 | 0 | 11 | 21,153,755.59 |
| `S6_oracle` | 247,360.64 | 0.00 | 0.00 | 247,360.64 | 347.26 | 12,940,570.76 | 0 | 0 | 0.00 |

### Findings:
- Unpredictable shocks account for **$270,049.56** (83.5%) of $S4$'s total annual break fees ($323,269.29).
- Even during extreme 4-sigma shocks, the early redemption waterfall absorbs 100% of the shortfall: **overdraft is never triggered**.

---

## 6. Sensitivity Analysis: Target Quantile $q$ (308 Nights)

The table below demonstrates policy performance across target quantiles $q \in [0.900, 0.995]$ using model B1:

### Table 4: Diagnostic Quantile Sensitivity (Evaluated on Same Nights, Not Tuned)

| Quantile $q$ | Mean Buffer ($) | Total Interest ($) | Break Fees ($) | Overdraft Cost ($) | Net P&L ($) | Net Yield (bps) | Break Nights | Overdraft Nights | Capture Ratio |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0.900 | 17,247,223.36 | 2,790,247.39 | 704,509.64 | 0.00 | 2,085,737.75 | 247.17 | 40 | 0 | 0.7079 |
| 0.950 | 19,037,964.22 | 2,734,570.99 | 475,306.28 | 0.00 | 2,259,264.70 | 267.74 | 21 | 0 | 0.7668 |
| **0.980** | **21,655,116.39** | **2,649,369.94** | **319,833.75** | **0.00** | **2,329,536.19** | **276.07** | **10** | **0** | **0.7907** |
| 0.990 | 23,159,633.12 | 2,598,568.58 | 296,064.78 | 0.00 | 2,302,503.80 | 272.86 | 9 | 0 | 0.7815 |
| 0.995 | 23,159,633.12 | 2,598,568.58 | 296,064.78 | 0.00 | 2,302,503.80 | 272.86 | 9 | 0 | 0.7815 |

### Findings:
- At $q=0.900$, under-buffering costs $704k in break fees across 40 break nights.
- At $q \ge 0.990$, over-buffering creates drag: the opportunity cost of idle cash exceeds the reduction in break fees, lowering Net P&L.
- The critical fractile $q^* = \frac{C_u}{C_u + C_o} \approx 0.978$ directly balances under-buffering penalty against over-buffering cost.

---

## 7. Strategic Sleeve Performance (Tier 2 Bonds & Tier 3 Equities)

Capital: **$50,000,000.00** separate strategic capital held buy-and-hold (no look-ahead, no rebalancing, zero transaction costs).
Replay Window: **7,384 hours** (from `2026-02-26 17:00:00` through `2026-12-31 08:00:00`).

### Asset Dynamics Over Replay Window:
- **Tier 3 Equity Index**: Fell from **$5,080.96** to **$3,563.81** (**-29.86%** bear market collapse).
- **Tier 2 Bond Yield**: Rose from **4.272%** to **4.970%** (**+69.8 bps** rate hike), causing bond clean price to drop from **101.014** to **99.674** (**-1.33%**). Carry earned partially mitigated price loss.
- **Tier 1 Repo Rate**: Began at **4.258%** and closed at **4.031%**.

### Ex-Ante Risk Budget Working (Window Start):
- Maximum acceptable stressed loss tolerance: $T = 0.05$ (5% of sleeve)
- Equity stress loss: $L_e = 1 - (1 - 2.326 \times 0.18 \times \sqrt{30/252}) \times (1 - 0.15) = 27.28\%$
- Bond stress loss: $L_b = 1 - (1 - 1.92 \times 100 / 10000) \times (1 - 0.02) = 3.88\%$
- Budget Split (50/50):
  - Equity Weight: $w_e = 0.5 \times 0.05 / 0.2728 = \mathbf{9.16\%}$
  - Bond Weight: $w_b = \min(0.5 \times 0.05 / 0.0388, 1 - 0.20 - w_e) = \mathbf{64.41\%}$
  - Repo Weight: $w_r = 1 - w_e - w_b = \mathbf{26.43\%}$ ($\ge 20\%$ floor)

### Summary Performance Across Strategic Sleeve Configurations:

| Configuration | Weights (Repo / Bond / Eq) | Final MV ($) | Net P&L ($) | Total Return | Ann. Return | Excess vs Repo ($) | Ann. Vol (Daily) | Max Drawdown ($) | Max Drawdown (%) | Worst 24h Change ($) | Liq-Adj End ($) | Liq-Adj Worst ($) |
|:---|:---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Conservative** | 100 / 0 / 0 | 51,724,267.17 | +1,724,267.17 | +3.45% | +4.10% | $0.00 | 0.00% | $0.00 | 0.00% | $0.00 | 51,724,267.17 | 50,000,000.00 |
| **Risk Budget** | 26.4 / 64.4 / 9.2 | 49,921,380.51 | -78,619.49 | -0.16% | -0.19% | -$1,802,886.66 | 3.10% | $1,018,933.11 | 2.02% | -$370,513.18 | 48,778,532.05 | 48,238,086.36 |
| **Income** | 50 / 50 / 0 | 51,509,524.32 | +1,509,524.32 | +3.02% | +3.59% | -$214,742.85 | 1.93% | $679,690.68 | 1.33% | -$209,998.12 | 50,996,576.50 | 49,490,258.43 |
| **Balanced** | 40 / 40 / 20 | 48,221,667.98 | -1,778,332.02 | -3.56% | -4.21% | -$3,502,599.19 | 3.99% | $2,572,980.95 | 5.10% | -$608,768.37 | 46,759,202.45 | 46,426,879.63 |
| **Growth** | 20 / 30 / 50 | 43,268,409.19 | -6,731,590.81 | -13.46% | -15.77% | -$8,455,857.98 | 9.38% | $8,058,081.22 | 15.87% | -$1,386,511.90 | 40,330,372.30 | 39,835,989.71 |

*Note: All preset labels are "in-sample illustration, not tuned".*

### Break-Even Holding Periods (Years):
- **Tier 2 Bonds (2.0% Haircut)**:
  - **Ex-Ante**: $2.0\% / (4.272\% - 4.258\%) = \mathbf{142.86\text{ years}}$ (due to the narrow 1.4 bps starting yield spread over repo).
  - **Ex-Post**: **null (—)**. Bond clean price fell under rising yields, causing realized annual bond return to lag repo (+3.67% vs +4.10%, excess = -0.44%).
- **Tier 3 Equity Index (15.0% Haircut)**:
  - **Ex-Ante**: $15.0\% / (10.0\% - 4.258\%) = \mathbf{2.61\text{ years}}$ (using problem statement expected APY of 10%).
  - **Ex-Post**: **null (—)**. The equity index fell -29.86% over the period, resulting in a negative excess return vs repo (-38.88% annual excess).

