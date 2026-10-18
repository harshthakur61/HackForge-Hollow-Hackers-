# Reserve Juggler: project spec

## Problem
A digital bank moves ~$20M per hour in deposits and withdrawals. Each hour we decide
where every dollar sits. Goal: maximise net yield minus fees and penalties while paying
100% of withdrawals on time. Data: 8,760 hourly rows (one year) in data/treasury_4tier_dataset.csv.

## Tiers (all rates, fees and haircuts are read from CSV columns, never hardcoded)
- Tier 0 cash: 0% APY, instant, no cost.
- Tier 1 overnight repo: ~4.3% floating APY. Entry only when repo_sweep_window_open
  (17:00), matures when repo_sweep_mature (08:00). Breaking early costs a 0.5% fee.
- Tier 2 2Y bonds: ~4.8% yield plus capital PnL (dP ~ -Dmod * dy). Liquidation haircut 2%.
- Tier 3 equity index: ~10% expected, sigma 18%. Emergency liquidation haircut 15%.
- Emergency overdraft: penalty APR from the CSV (12%), prorated by duration.

## Hard rules
1. Repo can only be entered at 17:00 and matures at 08:00. From 08:00 to 17:00 spare cash sits in Tier 0.
2. Forecast target is required_buffer_usd = max(0, -(min cumulative net_flow_usd over the 15 rows 17:00 on D through 07:00 on D+1)), not the net total.
3. Pool convention: each night starts at 17:00 with config POOL_USD (default 100,000,000), assumed externally replenished, structural drift ignored.
4. Features may use ONLY rows with timestamp <= D 16:00 (decision is at 17:00; the 17:00 row's flows happen after the decision).
5. Target quantile q* = Cu / (Cu + Co), Cu = early_redemption haircut / 100, Co = repo_rate_apy / 100 / 365 (config flag for 15h accrual), default ~0.98.
6. Default policy: zero overdrafts (hard constraint), with a toggle for a cost-optimal mode.
7. Backtests are walk-forward with no look-ahead. Never train on future rows.
8. All decision logic lives in Python (engine/). Node orchestrates and streams. React displays.
9. Never invent data or parameters. If something is missing, stop and ask.

## Step 4 Simulation & Policy Engine Conventions
- Scope: Tier 0 and Tier 1 only. Only the 15-hour night is simulated (rows 17:00 on D through 07:00 on D+1). Daytime is identical for every strategy and is excluded.
- Each night starts with pool POOL_USD (default 100,000,000), externally replenished.
- Decision at 17:00 uses only the forecasts table (walk-forward rows for night D).
- Repo interest = swept_remaining * repo_apy/100/365 per night (config ACCRUAL = "overnight_1d" default, or "15h" = times 15/24). Interest is paid at 08:00 maturity.
- Cash flows apply hour by hour. Shortfall = cumulative cash below zero.
- Policy mode "zero_overdraft" (default): shortfall is covered by breaking repo early. Fee = early_redemption_haircut_pct/100 * amount broken. The broken amount forfeits that night's interest (conservative). Only if the shortfall exceeds the whole repo balance does an overdraft occur, for the excess.
- Policy mode "cost_optimal": no repo breaking; shortfall is covered by overdraft. Cost accrues hourly: overdraft_balance * overdraft_apr/100/365/24, using the balance after that hour's flow. The overdraft is repaid at 08:00 maturity.
- Payouts are always honored in both modes. Track overdraft events separately.

## Strategic Sleeve Conventions (Tier 2 Bonds & Tier 3 Equities)
- Operating pool (S0 to S6, nightly, replenished) is unchanged. The sleeve is separate
  capital, SLEEVE_USD default 50,000,000, invested at the start of the replay window and held
  (buy and hold, no rebalancing, zero transaction costs because the dataset has none).
- Window: from 17:00 of the first night that has forecasts to the 08:00 settlement of the last
  night, valued every hour including daytime.
- Repo part: rolled nightly, interest per night = balance * repo_apy/100/365 under the ACCRUAL
  convention, credited and compounded at 08:00 maturity.
- Bond part: units = allocation / (bond_price_index/100). Clean mark-to-market from
  tier2_bond_price_index plus carry accrued hourly as yield_pct/100/8760 on the previous clean
  value, kept in a separate accrued-carry bucket (not compounded). Report clean value and carry.
- Equity part: units = allocation / tier3_stock_index_price; value = units * price. Price
  return only, no dividends (the dataset has none). The "~10% expected APY" is NOT used in any
  realized figure; keep EQUITY_EXPECTED_APY=10 in config labelled "per problem statement, not
  in the dataset", used only for the ex-ante break-even.
- Haircuts come from the market_data columns (bond 2.0, equity 15.0), never hardcoded.
- Liquidation-adjusted value = repo + bonds*(1 - bond_haircut) + equities*(1 - equity_haircut).
- Presets, fixed weights (repo/bonds/equity): conservative 100/0/0; income 50/50/0;
  balanced 40/40/20; growth 20/30/50. Label them "in-sample illustration, not tuned".
- Default "risk_budget" rule, using only data available at the window start and the constant
  columns: tolerance T (default 5% of sleeve) is the maximum acceptable stressed loss.
  Equity stress loss L_e = 1 - (1 - z99*sigma*sqrt(h/252)) * (1 - equity_haircut/100) with
  sigma from tier3_stock_volatility_pct/100, z99 = 2.326, h = LIQ_HORIZON_DAYS (default 30).
  Bond stress loss L_b = 1 - (1 - D_mod*YIELD_SHOCK_BP/10000) * (1 - bond_haircut/100) with
  D_mod from tier2_bond_mod_duration and YIELD_SHOCK_BP default 100.
  Split the budget 50/50: w_e = 0.5*T/L_e; w_b = min(0.5*T/L_b, 1 - REPO_FLOOR - w_e) with
  REPO_FLOOR default 0.20; w_r = 1 - w_e - w_b. Return weights and working. Custom weights accepted
  if sum=1, within [0,1], repo weight >= REPO_FLOOR; otherwise 422.
- Liquidity waterfall: when night's shortfall exceeds pool cash plus repo balance, then in
  zero_overdraft mode sell bonds first (haircut), then equities (haircut), and only then
  overdraft the remainder; in cost_optimal mode sell nothing and overdraft. Record each sale
  as an event with amount and fee.

## Stack (do not swap tools without asking)
Frontend: React, TypeScript, Vite, Tailwind, Recharts, socket.io-client, TanStack Query, Zustand.
Backend: Node 20, Express, Socket.IO, zod, pg, dotenv, cors, tsx.
Engine: Python 3.11, FastAPI, pandas, NumPy, SciPy, scikit-learn, XGBoost >= 2.0
(quantile objective reg:quantileerror), statsmodels, joblib, pydantic, psycopg, pytest.
Database: PostgreSQL 16 in Docker Compose. Redis is not used in the MVP.

## Structure
data/ db/init/ engine/ (app/, scripts/, tests/) server/ web/ notebooks/ docs/

## Conventions
Python type hints and pytest tests. TypeScript strict mode. Secrets only in .env;
commit .env.example. Small commits, one per step.