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
2. Forecast target is the worst running cumulative net outflow over 17:00 to 08:00 (the trough), not the net total.
3. Default policy: zero overdrafts (hard constraint), with a toggle for a cost-optimal mode.
4. Backtests are walk-forward with no look-ahead. Never train on future rows.
5. All decision logic lives in Python (engine/). Node orchestrates and streams. React displays.
6. The CSV has no balances, so the starting pool is a config value (default $50M).
7. Never invent data or parameters. If something is missing, stop and ask.

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