# Reserve Juggler

**Reserve Juggler** is an autonomous, quantitative treasury management and liquidity optimization engine for digital banking. Operating on 8,760 hourly records (~$20M/hour gross flow), it balances overnight repo yield against early redemption penalties and emergency overdraft costs while maintaining a **100% payout success rate**.

---

## 1. Architecture

```mermaid
graph TD
    subgraph Data Layer
        DB[(PostgreSQL 16<br/>market_data | forecasts | decisions)]
    end

    subgraph Analytics & Policy Engine [Python 3.11 / FastAPI - Port 8000]
        FE[Feature Engineering<br/>Strict Temporal Barrier &le;16:00]
        MD[Quantile Forecasting Models<br/>B0, B1, B2, M1, M2]
        PE[Policy Engine<br/>Critical Fractile q* Calculation]
        SIM[Night Simulator & Trace<br/>15h Overnight Waterfall]
    end

    subgraph Streaming & Orchestration Gateway [Node 20 / Express / Socket.IO - Port 4000]
        GW[Clock & State Orchestrator<br/>1x to 100x Replay Clock]
        ZOD[Zod Contract Validation<br/>Incoming & Outgoing Payloads]
        REST[REST Proxies<br/>/api/nights, /api/kpis, /api/decisions]
    end

    subgraph Client Application [React 18 / Vite / Tailwind - Port 3000]
        UI[Live Executive Dashboard]
        ZST[Zustand Pure State Reducer]
        RC[Recharts Time Series & Race]
    end

    DB -->|Read market_data| FE
    FE --> MD
    MD --> PE
    PE --> SIM
    SIM -->|Persist walk-forward results| DB

    DB -->|Query historical decisions| REST
    SIM -->|Simulate custom decisions| GW
    GW -->|WebSocket: tick, decision, event, settlement| ZST
    REST -->|TanStack Query REST fetch| ZST
    ZST --> UI
    UI --> RC
```

---

## 2. Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ and Python 3.11+ (for local development)

### 1. Environment Setup
```bash
cp .env.example .env
```

### 2. One-Command Bootstrap (Clean Slate to Working System)
The bootstrap script is idempotent and handles database initialization, data validation, forecast backtesting, and strategy evaluation:
```bash
# Via Docker Compose (Recommended)
docker compose run --rm bootstrap

# Or locally (using .venv)
python engine/scripts/bootstrap.py
```

### 3. Launch the Stack
```bash
docker compose up -d
```

### 4. Exposed Ports

| Service | Port | Description |
|:---|:---|:---|
| **Web Dashboard** | `3000` | React executive dashboard with live charts, demo mode, and audit logs |
| **Server Gateway** | `4000` | Node.js Socket.IO orchestrator and REST API (`http://localhost:4000/api/health`) |
| **Engine API** | `8000` | Python FastAPI decision engine (`http://localhost:8000/health`) |
| **Database** | `5432` | PostgreSQL 16 store (`market_data`, `forecasts`, `decisions`) |

Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 3. Project Structure

```text
├── db/init/                   # PostgreSQL DDL schemas (01_schema, 02_forecasts, 03_decisions)
├── docs/                      # Quantitative reports and findings
│   ├── API_CONTRACT.md        # Strict REST and WebSocket schema contract
│   ├── DEMO.md                # 4-minute executive demo script and Q&A
│   ├── RESULTS.md             # Complete backtest tables, weekend findings, sensitivity
│   ├── backtest/              # Step 4 strategy backtest charts and reports
│   ├── eda/                   # Step 2 exploratory data analysis findings
│   └── forecast/              # Step 3 quantile forecasting benchmark reports
├── engine/                    # Python policy and simulation engine
│   ├── app/
│   │   ├── config.py          # Central financial parameters and defaults
│   │   ├── features.py        # Leakage-free feature engineering (<= 16:00 strictly)
│   │   ├── main.py            # FastAPI service endpoints
│   │   ├── models.py          # B0, B1, B2 empirical & M1, M2 quantile models
│   │   ├── policy.py          # Critical fractile interpolation & decision logic
│   │   ├── schemas.py         # Pydantic contract models
│   │   ├── simulator.py       # 15-hour overnight simulator and trace generator
│   │   └── strategies.py      # Strategy definitions (S0 to S6)
│   ├── scripts/
│   │   ├── bootstrap.py       # One-command idempotent system initializer
│   │   ├── load_csv.py        # CSV validator and bulk PostgreSQL loader
│   │   ├── backtest_forecast.py   # Walk-forward forecast backtest
│   │   └── backtest_strategies.py # Walk-forward strategy backtest
│   └── tests/                 # Pytest test suite (leakage, models, simulator, API)
├── server/                    # Node.js Replay and Streaming Server
│   ├── scripts/
│   │   ├── smoke.ts           # 3-night socket integration smoke test
│   │   ├── full_replay_check.ts   # 308-night E2E correctness check
│   │   └── pick_demo_nights.py    # Programmatic demo scenario selector
│   └── src/
│       ├── contract.ts        # Zod contract schemas matching engine/schemas.py
│       └── index.ts           # Express server, Socket.IO gateway, clock runner
└── web/                       # React 18 Executive Dashboard
    ├── src/
    │   ├── components/        # TopBar, Controls, BalanceCards, ReserveGauge, Charts, etc.
    │   ├── contract.ts        # Synchronized client-side Zod validation schemas
    │   ├── hooks/             # useReplaySocket singleton, TanStack Query hooks
    │   ├── store/             # Zustand state management and chronological reducers
    │   └── utils/             # Null-safe financial number formatters
    ├── Dockerfile             # Multi-stage production build (Node 20 -> Nginx Alpine)
    └── nginx.conf             # Static SPA router with reverse proxy to server
```

---

## 4. Configuration Options

Runtime options are configured via environment variables or runtime WebSocket commands (`config:set`):

| Variable / Key | Default | Description |
|:---|:---|:---|
| `POOL_USD` | `100000000.0` | Replenished starting pool size at 17:00 ($100M). |
| `ACCRUAL` | `"overnight_1d"` | Repo interest convention: `"overnight_1d"` ($rate/365$) or `"15h"` ($rate/365 \times 15/24$). |
| `POLICY_MODE` | `"zero_overdraft"` | Default waterfall: `"zero_overdraft"` (breaks repo early) vs `"cost_optimal"` (allows overdraft). |
| `MODEL_FOR_POLICY`| `"B1"` | Forecasting model used for policy decisions (`"B1"` same-weekday empirical quantile). |
| `TICK_MS` | `1000` | Replay interval per simulated hour: `1000` (1x), `200` (5x), `50` (20x), `10` (100x), or `2` (test mode). |

---

## 5. System Hardening & Edge Case Handling

The table below summarizes system behavior across operational failure and edge-case modes:

| Test Case | Scenario / Trigger | System Behaviour & Guarantee |
|:---|:---|:---|
| **1. Engine Container Down** | Engine stopped mid-night during replay. | Server catches failure, emits an alert event, transitions status to `paused`, and polls `/health`. Once engine restarts, replay auto-resumes cleanly. |
| **2. PostgreSQL Restart** | Database restarted while running. | `pg.Pool` automatically reconnects dropped client sockets on the next query. REST queries retry seamlessly without crash. |
| **3. Browser Refresh Mid-Night** | Client reloads page mid-night. | UI re-syncs state from server status broadcast. Zustand reducer strictly ignores any duplicate or out-of-order ticks. |
| **4. Multiple Browser Tabs** | Multiple tabs connect simultaneously. | Server broadcasts identical synchronized state via Socket.IO room; all tabs view the exact same synchronized clock and ticks. |
| **5. Seek Boundary Dates** | Seek to first (`2026-02-26`) or last night (`2026-12-30`). | Validated against forecast night index; clock cleanly repositions to 17:00 without timeline drift. Invalid dates rejected. |
| **6. Speed Adjustments** | Speed changed mid-simulation (1x to 100x). | Active timeout is cleared and immediately rescheduled at the new interval. Zero dropped ticks or time skips. |
| **7. Config Change Mid-Night** | User toggles strategy or quantile during night. | Change is queued; UI shows a "Pending at 17:00" badge. Configuration applies strictly at the next 17:00 decision window. |
| **8. Reset and Re-start** | User clicks Reset then Start Replay. | Simulation timer is cleared, night slice is reset, and replay restarts cleanly at 2026-02-26 17:00. |
| **9. Replay Completion** | Simulation reaches final hour (2026-12-31 23:00). | State transitions cleanly to `finished`; replay timer unregisters; server remains active and responsive without error. |
| **10. Invalid Socket Payloads**| Malformed payload sent to Socket.IO. | Rejected immediately by Zod schema validation; error is logged and socket receives an error ack; server continues running. |

---

## 6. How to Run Test Suites

### 1. Python Engine Tests (Pytest)
Validates feature leakage barriers ($\le 16:00$), baseline models, simulation accounting, and FastAPI endpoints:
```bash
pytest engine/tests -v
```

### 2. Node Server Integration Smoke Test
Runs 3 simulated nights at 5ms/tick and asserts monotonic timestamps and exact decision matching:
```bash
npm --prefix server run smoke
```

### 3. Full Replay End-to-End Correctness Check
Runs all 308 out-of-sample nights at maximum safe speed (2ms/tick) and asserts:
- 0 out-of-order ticks across 7,384 hours.
- 0 overdraft nights for S4.
- Exact match to the cent ($0.00 difference) against the PostgreSQL `decisions` table for all 7 strategies:
```bash
npm --prefix server run test:replay
```

### 4. Web Dashboard Unit Tests & Typecheck
Runs Vitest suite (store reducers, chronological ordering, number formatters, chart selector) and TypeScript compilation:
```bash
npm --prefix web run test
npm --prefix web run build
```

---

## 7. Assumptions & Known Limitations

1. **Pool Replenishment Convention**: Each simulated night begins at 17:00 with a replenished pool of **$100,000,000.00**. Daytime net flows (08:00 to 17:00) and cumulative structural deposit growth are assumed to be managed externally by core banking operations.
2. **Interest Accrual Convention**: Overnight repo interest is earned on the remaining swept principal and credited at 08:00 maturity. Under `"overnight_1d"`, interest equals $\text{principal} \times \frac{\text{repo\_apy}}{100 \times 365}$. Early redeemed repo principal forfeits interest for that night.
3. **Model Selection Bias**: The default model for S4 and S5 (`MODEL_FOR_POLICY = 'B1'`) was selected based on achieving the lowest total cost in Step 3 over the same out-of-sample nights. This diagnostic selection is subject to model selection bias.
4. **Deterministic Outflows**: In the current MVP, Tier 2 (2Y government bonds) and Tier 3 (equity indices) are excluded from the nightly sweep, focusing capital allocation strictly on Tier 0 Cash and Tier 1 Overnight Repo.
