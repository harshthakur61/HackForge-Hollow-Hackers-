# Reserve Juggler: API & WebSocket Contract

This contract defines all REST endpoints and WebSocket protocols shared between the Python FastAPI Engine (`engine/`) and the Node Replay Server (`server/`).

---

## 1. REST Endpoints (Engine Port 8000 & Node Gateway Port 4000)

### 1.1 `GET /health` (or `/api/health`)
Checks service health and forecast date boundary availability.
- **Response `200 OK`**:
```json
{
  "status": "ok",
  "db_ok": true,
  "forecast_nights_count": 308,
  "first_night": "2026-02-26",
  "last_night": "2026-12-30"
}
```

### 1.2 `GET /config` (or `/api/config`)
Returns effective runtime config and theoretical critical fractiles $q^* = \frac{C_u}{C_u + C_o}$.
- **Response `200 OK`**:
```json
{
  "pool_usd": 100000000.0,
  "accrual": "overnight_1d",
  "policy_mode": "zero_overdraft",
  "model_for_policy": "B1",
  "default_haircut_pct": 0.5,
  "default_overdraft_apr_pct": 12.0,
  "q_star_zero_overdraft": 0.9783,
  "q_star_cost_optimal": 0.7477
}
```

### 1.3 `GET /nights` (or `/api/nights`)
Returns sorted list of night dates (YYYY-MM-DD) that have forecasts.
- **Response `200 OK`**:
```json
{
  "nights": ["2026-02-26", "2026-02-27", "...", "2026-12-30"]
}
```

### 1.4 `GET /forecast/{night_date}` (or `/api/forecast/{night_date}`)
Returns model quantile forecasts for the given night. **Never includes actual outcomes**.
- **Response `200 OK`**:
```json
{
  "night_date": "2026-02-26",
  "forecasts": [
    { "model": "B0", "quantile": 0.5, "buffer_usd": 7666598.78 },
    { "model": "M1", "quantile": 0.98, "buffer_usd": 21655116.39 }
  ]
}
```
- **Error `404 Not Found`**: Unknown date or date without forecasts.

### 1.5 `GET /night/{night_date}`
Simulates or retrieves the decision, simulation result, and 16-row trace (15 overnight hours + 08:00 settlement) for a night.
- **Query Parameters**:
  - `strategy`: e.g. `"S4"`, `"S0_all_cash"`, `"S4_policy_zero_overdraft"`, `"S5_policy_cost_optimal"`. Default `"S4"`.
  - `mode`: Optional override (`"zero_overdraft"` | `"cost_optimal"`).
  - `quantile`: Optional fixed quantile override (e.g. `0.98`).
  - `pool`: Optional pool override (e.g. `100000000.0`).
- **Response `200 OK`**:
```json
{
  "night_date": "2026-02-26",
  "strategy": "S4_policy_zero_overdraft",
  "is_custom": false,
  "decision": {
    "buffer_usd": 21655116.39,
    "sweep_usd": 78344883.61,
    "quantile_used": 0.9783,
    "model": "B1",
    "reason": "Mode=zero_overdraft, Model=B1, q*=0.9783...",
    "q_star_zero": 0.9783,
    "q_star_opt": 0.7477
  },
  "result": {
    "interest": 9178.45,
    "break_fee": 0.0,
    "broken_amount": 0.0,
    "overdraft_peak": 0.0,
    "overdraft_cost": 0.0,
    "net_pnl": 9178.45,
    "shortfall_peak": 0.0,
    "payouts_honored": true,
    "idle_cash_at_17": 21655116.39
  },
  "actual_required_usd": 1254000.0,
  "trace": [
    {
      "ts": "2026-02-26T17:00:00",
      "deposits": 13000000.0,
      "withdrawals": 14000000.0,
      "net_flow": -1000000.0,
      "cash": 20655116.39,
      "repo": 78344883.61,
      "overdraft": 0.0,
      "event": null,
      "event_amount": 0.0,
      "event_fee": 0.0
    }
  ]
}
```

### 1.6 `GET /kpis?through=YYYY-MM-DD` (or `/api/kpis`)
Returns cumulative KPIs per strategy up through `through` date.
- **Response `200 OK`**:
```json
{
  "through": "2026-12-30",
  "strategies": [
    {
      "strategy": "S4_policy_zero_overdraft",
      "nights": 308,
      "interest": 2653808.27,
      "break_fees": 323269.29,
      "overdraft_cost": 0.0,
      "net_pnl": 2330538.98,
      "net_yield_bps": 276.18,
      "mean_buffer": 21522953.54,
      "repo_break_nights": 10,
      "overdraft_nights": 0,
      "payout_success_rate": 100.0
    }
  ]
}
```

### 1.7 `GET /decisions?limit=50&before=YYYY-MM-DD&strategy=S4` (or `/api/decisions`)
Returns decision audit log rows with reason strings.
- **Response `200 OK`**:
```json
{
  "decisions": [
    {
      "night_date": "2026-12-30",
      "strategy": "S4_policy_zero_overdraft",
      "model": "B1",
      "quantile_used": 0.9783,
      "buffer_usd": 21655116.39,
      "sweep_usd": 78344883.61,
      "repo_apy": 4.12,
      "reason": "Mode=zero_overdraft...",
      "interest": 8840.12,
      "break_fee": 0.0,
      "overdraft_cost": 0.0,
      "net_pnl": 8840.12
    }
  ]
}
```

### 1.8 `POST /stress/night` (or `/api/stress/night`)
Simulates synthetic liquidity stress scenarios applied strictly to flows after the 17:00 decision for a chosen night.
- **Request Body**:
```json
{
  "night_date": "2026-10-03",
  "scenario": "withdrawal_surge",
  "params": {
    "m": 2.0,
    "hour_from": 3,
    "hour_to": 9
  },
  "strategy": "S4_policy_zero_overdraft",
  "mode": "zero_overdraft",
  "informed": false
}
```
- **Response `200 OK`**:
```json
{
  "night_date": "2026-10-03",
  "scenario": "withdrawal_surge",
  "params": { "m": 2.0, "hour_from": 3, "hour_to": 9 },
  "strategy": "S4_policy_zero_overdraft",
  "mode": "zero_overdraft",
  "informed": false,
  "baseline_decision": { ... },
  "stressed_decision": { ... },
  "baseline_result": { "interest": ..., "break_fee": ..., "net_pnl": ... },
  "stressed_result": { "interest": ..., "break_fee": ..., "net_pnl": ... },
  "deltas": { "net_pnl": -..., "break_fee": ..., "overdraft_cost": ..., ... },
  "baseline_trace": [ ... ],
  "stressed_trace": [ ... ]
}
```
- **Error `422 Unprocessable Entity`**: Parameter out of allowed bounds.

### 1.9 `POST /stress/batch` (or `/api/stress/batch`)
Runs synthetic liquidity stress scenarios across evaluation nights for strategies S1 through S6.
- **Request Body**:
```json
{
  "scenario": "withdrawal_surge",
  "params": {
    "m": 2.0,
    "hour_from": 3,
    "hour_to": 9
  },
  "informed": false,
  "night_filter": "fri_sat"
}
```
- **Response `200 OK`**:
```json
{
  "scenario": "withdrawal_surge",
  "params": { "m": 2.0, "hour_from": 3, "hour_to": 9 },
  "informed": false,
  "night_filter": "fri_sat",
  "nights_count": 88,
  "summary_text": "Across 88 nights under withdrawal_surge, the policy (S4) broke repo on 4 of 88 nights and paid $18,450.00 in fees with 0 overdraft nights.",
  "results": [
    {
      "strategy": "S1_fixed_10",
      "net_pnl": 0.0,
      "break_fee": 0.0,
      "overdraft_cost": 0.0,
      "repo_break_nights": 0,
      "overdraft_nights": 0,
      "worst_shortfall": 0.0,
      "baseline_net_pnl": 0.0,
      "delta_net_pnl": 0.0
    }
  ]
}
```

### 1.10 `GET /sleeve/config` (or `/api/sleeve/config`)
Returns default parameters, presets, and ex-ante risk-budget working calculations.
- **Response `200 OK`**:
```json
{
  "sleeve_usd": 50000000.0,
  "presets": {
    "conservative": { "repo": 1.0, "bonds": 0.0, "equity": 0.0 },
    "income": { "repo": 0.5, "bonds": 0.5, "equity": 0.0 },
    "balanced": { "repo": 0.4, "bonds": 0.4, "equity": 0.2 },
    "growth": { "repo": 0.2, "bonds": 0.3, "equity": 0.5 }
  },
  "preset_labels": {
    "conservative": "in-sample illustration, not tuned",
    "income": "in-sample illustration, not tuned",
    "balanced": "in-sample illustration, not tuned",
    "growth": "in-sample illustration, not tuned"
  },
  "parameters": {
    "tolerance_t": 0.05,
    "z99": 2.326,
    "liq_horizon_days": 30,
    "yield_shock_bp": 100.0,
    "repo_floor": 0.2,
    "equity_expected_apy": 10.0
  },
  "risk_budget_working": {
    "T": 0.05,
    "z99": 2.326,
    "h_days": 30,
    "sigma": 0.18,
    "equity_haircut_pct": 15.0,
    "L_e": 0.27279,
    "D_mod": 1.92,
    "yield_shock_bp": 100.0,
    "bond_haircut_pct": 2.0,
    "L_b": 0.038816,
    "repo_floor": 0.2,
    "weights": { "repo": 0.26429, "bonds": 0.644064, "equity": 0.091646 }
  }
}
```

### 1.11 `GET /sleeve/path` (or `/api/sleeve/path`)
Calculates the hourly mark-to-market path and summary statistics for a given preset or custom weights.
- **Query Parameters**:
  - `preset`: e.g. `"risk_budget"`, `"conservative"`, `"income"`, `"balanced"`, `"growth"`
  - `weights`: e.g. `"0.2643,0.6441,0.0916"` or `"repo:0.2643,bonds:0.6441,equity:0.0916"`
  - `sleeve_usd`: float (default `50000000.0`)
  - `through`: Optional cutoff date (YYYY-MM-DD)
- **Response `200 OK`**:
```json
{
  "preset": "risk_budget",
  "sleeve_usd": 50000000.0,
  "weights": { "repo": 0.26429, "bonds": 0.644064, "equity": 0.091646 },
  "path": [
    {
      "ts": "2026-02-26T17:00:00",
      "repo_mv": 13214500.0,
      "bond_clean_mv": 32203200.0,
      "bond_carry": 0.0,
      "equity_mv": 4582300.0,
      "total_mv": 50000000.0,
      "benchmark_mv": 50000000.0,
      "excess_vs_repo": 0.0,
      "drawdown_from_peak": 0.0
    }
  ],
  "summary": {
    "total_return": -0.00157,
    "annualised_return": -0.00186,
    "pnl": -78619.49,
    "excess_pnl_vs_repo": -1802886.66,
    "annualised_volatility_daily": 0.0215,
    "max_drawdown_amount": 1018933.11,
    "max_drawdown_pct": 2.02,
    "worst_24h_change": -370513.18,
    "liquidation_adjusted_end": 48600000.0,
    "liquidation_adjusted_worst": 47900000.0,
    "break_even_ex_ante_years": { "bonds": 142.86, "equity": 2.61 },
    "break_even_ex_post_years": { "bonds": null, "equity": null }
  }
}
```

### 1.12 `GET /sleeve/compare?through=YYYY-MM-DD` (or `/api/sleeve/compare`)
Returns multi-strategy comparison summary table across `risk_budget` and the 4 presets.

---

## 2. WebSocket Protocol (Node Gateway Port 4000)

### 2.1 Client to Server Messages

| Event | Payload | Description |
|:---|:---|:---|
| `replay:start` | `{ fromNight?: string, sleeve_preset?: string, sleeve_weights?: object, sleeve_usd?: number }` | Start replay clock from specified date (only while idle) |
| `replay:pause` | `{}` | Pause replay clock |
| `replay:resume` | `{}` | Resume replay clock |
| `replay:speed` | `{ tickMs: number }` | Adjust tick interval in milliseconds |
| `replay:seek` | `{ nightDate: string }` | Seek replay clock to 17:00 of specified night |
| `replay:reset` | `{}` | Reset replay to beginning |
| `config:set` | `{ strategy?: string, mode?: string, quantile?: number, pool?: number, sleeve_preset?: string, sleeve_weights?: object, sleeve_usd?: number }` | Queues config update (sleeve updates accepted only while idle) |

### 2.2 Server to Client Messages

| Event | Payload | Description |
|:---|:---|:---|
| `status` | `{ state, simTime, tickMs, strategy, mode, nightDate, sleeve?: object }` | Clock status broadcast on change / connect |
| `tick` | `{ ts, phase: "day"\|"night", simulated: boolean, deposits, withdrawals, net_flow, balances: { cash, repo, overdraft }, repo_apy, sleeve?: { repo, bonds, equities, carry, total, benchmark, cum_excess } }` | Hourly tick (emitted once per `tickMs`). `sleeve` field is OPTIONAL. |
| `decision` | `{ night_date, decision, forecasts, pool, q_star }` | Emitted at 17:00 when sweep decision executes |
| `event` | `{ ts, type: "repo_break"\|"bond_sale"\|"equity_sale"\|"overdraft"\|"alert", amount, fee, message }` | Emitted when repo breaks, sleeve assets are liquidated, or overdraft occurs |
| `settlement`| `{ night_date, interest, break_fee, overdraft_cost, net_pnl, actual_required_usd, forecast_buffer_usd, covered, cumulative, sleeve?: object }` | Emitted at 08:00 when repo matures |

