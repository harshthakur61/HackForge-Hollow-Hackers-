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

---

## 2. WebSocket Protocol (Node Gateway Port 4000)

### 2.1 Client to Server Messages

| Event | Payload | Description |
|:---|:---|:---|
| `replay:start` | `{ fromNight?: string }` | Start replay clock from specified date (default: first forecast night) |
| `replay:pause` | `{}` | Pause replay clock |
| `replay:resume` | `{}` | Resume replay clock |
| `replay:speed` | `{ tickMs: number }` | Adjust tick interval in milliseconds |
| `replay:seek` | `{ nightDate: string }` | Seek replay clock to 17:00 of specified night |
| `replay:reset` | `{}` | Reset replay to beginning |
| `config:set` | `{ strategy?: string, mode?: string, quantile?: number, pool?: number }` | Queues config update for next night |

### 2.2 Server to Client Messages

| Event | Payload | Description |
|:---|:---|:---|
| `status` | `{ state, simTime, tickMs, strategy, mode, nightDate }` | Clock status broadcast on change / connect |
| `tick` | `{ ts, phase: "day"\|"night", simulated: boolean, deposits, withdrawals, net_flow, balances: { cash, repo, overdraft }, repo_apy }` | Hourly tick (emitted once per `tickMs`) |
| `decision` | `{ night_date, decision, forecasts, pool, q_star }` | Emitted at 17:00 when sweep decision executes |
| `event` | `{ ts, type: "repo_break"\|"overdraft"\|"alert", amount, fee, message }` | Emitted when repo breaks or overdraft occurs |
| `settlement`| `{ night_date, interest, break_fee, overdraft_cost, net_pnl, actual_required_usd, forecast_buffer_usd, covered, cumulative }` | Emitted at 08:00 when repo matures |
