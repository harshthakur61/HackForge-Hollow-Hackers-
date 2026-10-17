/**
 * index.ts: Node replay server and WebSocket streaming orchestrator (port 4000).
 * Connects to PostgreSQL (market_data) and calls FastAPI engine (ENGINE_URL)
 * for decisions and simulation traces.
 */

import express from "express";
import http from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { Pool } from "pg";
import {
  HealthResponseSchema,
  NightsResponseSchema,
  KpisResponseSchema,
  DecisionsResponseSchema,
  ForecastResponseSchema,
  NightDetailResponseSchema,
  NightDetailResponse,
  ForecastResponse,
  ReplayStatus,
  ReplayTick,
  DecisionEvent,
  ReplayEvent,
  SettlementEvent,
  StrategyKpi,
  ConfigSetPayloadSchema,
} from "./contract";

// Load environment variables
const envPath = path.resolve(__dirname, "../../.env");
dotenv.config({ path: envPath });
dotenv.config();

const PORT = parseInt(process.env.SERVER_PORT || process.env.PORT || "4000", 10);
const ENGINE_URL = process.env.ENGINE_URL || "http://localhost:8000";
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://juggler:juggler@localhost:5432/treasury";
const DEFAULT_TICK_MS = parseInt(process.env.TICK_MS || "1000", 10);

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Database pool for read-only market_data queries
const pgPool = new Pool({
  connectionString: DATABASE_URL,
});

interface MarketHour {
  ts: string;
  deposits_usd: number;
  withdrawals_usd: number;
  net_flow_usd: number;
  tier1_repo_rate_apy: number;
}

// In-memory lookup of hourly market data and forecast nights
let marketDataMap = new Map<string, MarketHour>();
let marketTimeline: string[] = [];
let forecastNightsList: string[] = [];

// Replay State Machine
interface ReplayState {
  state: "idle" | "playing" | "paused" | "finished";
  simTime: string; // ISO string e.g. "2026-02-26T17:00:00"
  tickMs: number;
  strategy: string;
  mode: "zero_overdraft" | "cost_optimal";
  quantile?: number;
  pool: number;
  nightDate: string;
  queuedConfig: {
    strategy?: string;
    mode?: "zero_overdraft" | "cost_optimal";
    quantile?: number;
    pool?: number;
  };
}

const replayState: ReplayState = {
  state: "idle",
  simTime: "2026-02-26T17:00:00",
  tickMs: DEFAULT_TICK_MS,
  strategy: "S4_policy_zero_overdraft",
  mode: "zero_overdraft",
  quantile: undefined,
  pool: 100000000.0,
  nightDate: "2026-02-26",
  queuedConfig: {},
};

let replayInterval: NodeJS.Timeout | null = null;
let currentNightDetail: NightDetailResponse | null = null;
let currentForecasts: ForecastResponse | null = null;
const prefetchCache = new Map<string, NightDetailResponse>();

function getStatusPayload(): ReplayStatus {
  return {
    state: replayState.state,
    simTime: replayState.simTime,
    tickMs: replayState.tickMs,
    strategy: replayState.strategy,
    mode: replayState.mode,
    nightDate: replayState.nightDate,
  };
}

function broadcastStatus() {
  io.emit("status", getStatusPayload());
}

async function fetchFromEngine<T>(
  url: string,
  schema: { parse: (val: unknown) => T }
): Promise<T> {
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Engine request failed [${resp.status}] ${url}: ${text}`);
  }
  const data = await resp.json();
  return schema.parse(data);
}

async function prefetchNight(
  nightDate: string,
  strat: string,
  mode: string,
  quantile?: number,
  pool?: number
): Promise<NightDetailResponse> {
  const cacheKey = `${nightDate}:${strat}:${mode}:${quantile ?? ""}:${pool ?? ""}`;
  if (prefetchCache.has(cacheKey)) {
    return prefetchCache.get(cacheKey)!;
  }
  const params = new URLSearchParams({
    strategy: strat,
    mode: mode,
  });
  if (quantile !== undefined) params.set("quantile", quantile.toString());
  if (pool !== undefined) params.set("pool", pool.toString());

  const url = `${ENGINE_URL}/night/${nightDate}?${params.toString()}`;
  const detail = await fetchFromEngine(url, NightDetailResponseSchema);
  prefetchCache.set(cacheKey, detail);
  return detail;
}

// Format Date object to "YYYY-MM-DDTHH:00:00"
function toHourIso(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:00:00`;
}

function parseHourIso(iso: string): Date {
  return new Date(iso);
}

function addHours(iso: string, hours: number): string {
  const d = parseHourIso(iso);
  d.setHours(d.getHours() + hours);
  return toHourIso(d);
}

// Replay Step (Called once per tickMs)
async function performTick() {
  if (replayState.state !== "playing") return;

  const currentTs = replayState.simTime;
  const currentDateObj = parseHourIso(currentTs);
  const hour = currentDateObj.getHours();
  const dateStr = currentTs.slice(0, 10);

  // 1. If 17:00 -> Decision execution and night simulation start
  if (hour === 17) {
    // Apply queued config updates at 17:00 (never mid-night)
    if (replayState.queuedConfig.strategy) {
      replayState.strategy = replayState.queuedConfig.strategy;
    }
    if (replayState.queuedConfig.mode) {
      replayState.mode = replayState.queuedConfig.mode;
    }
    if (replayState.queuedConfig.quantile !== undefined) {
      replayState.quantile = replayState.queuedConfig.quantile;
    }
    if (replayState.queuedConfig.pool !== undefined) {
      replayState.pool = replayState.queuedConfig.pool;
    }
    replayState.queuedConfig = {};

    replayState.nightDate = dateStr;

    try {
      currentNightDetail = await prefetchNight(
        dateStr,
        replayState.strategy,
        replayState.mode,
        replayState.quantile,
        replayState.pool
      );

      // Fetch forecast options for this night
      currentForecasts = await fetchFromEngine(
        `${ENGINE_URL}/forecast/${dateStr}`,
        ForecastResponseSchema
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to load decision for ${dateStr}:`, msg);
      io.emit("event", {
        ts: currentTs,
        type: "alert",
        amount: 0,
        fee: 0,
        message: `Failed to load night ${dateStr}: ${msg}`,
      });
      return;
    }

    const chosenModel = currentNightDetail.decision.model;
    const modelForecasts = currentForecasts.forecasts.filter(
      (f) => f.model === chosenModel
    );

    const qStar =
      replayState.mode === "cost_optimal"
        ? currentNightDetail.decision.q_star_opt
        : currentNightDetail.decision.q_star_zero;

    const decisionPayload: DecisionEvent = {
      night_date: dateStr,
      decision: currentNightDetail.decision,
      forecasts: modelForecasts,
      pool: replayState.pool,
      q_star: qStar,
    };

    io.emit("decision", decisionPayload);
    console.log(
      JSON.stringify({
        level: "info",
        type: "decision",
        ...decisionPayload,
      })
    );
  }

  // 2. Emit Tick
  const mRow = marketDataMap.get(currentTs);
  const repoApy = mRow ? mRow.tier1_repo_rate_apy : 4.05;

  const isNightHour = hour >= 17 || hour <= 7;

  if (isNightHour && currentNightDetail) {
    // Night hour: trace row mapping
    // hour 17 -> idx 0, 18 -> idx 1, ..., 23 -> idx 6, 0 -> idx 7, ..., 7 -> idx 14
    let traceIdx = 0;
    if (hour >= 17) {
      traceIdx = hour - 17;
    } else {
      traceIdx = hour + 7;
    }

    const traceRow = currentNightDetail.trace[traceIdx];
    if (traceRow) {
      const tickPayload: ReplayTick = {
        ts: currentTs,
        phase: "night",
        simulated: true,
        deposits: traceRow.deposits,
        withdrawals: traceRow.withdrawals,
        net_flow: traceRow.net_flow,
        balances: {
          cash: traceRow.cash,
          repo: traceRow.repo,
          overdraft: traceRow.overdraft,
        },
        repo_apy: repoApy,
      };
      io.emit("tick", tickPayload);

      if (traceRow.event) {
        const evPayload: ReplayEvent = {
          ts: currentTs,
          type: traceRow.event as "repo_break" | "overdraft",
          amount: traceRow.event_amount,
          fee: traceRow.event_fee,
          message: `${traceRow.event === "repo_break" ? "Repo early redemption break" : "Emergency overdraft incurred"}: $${traceRow.event_amount.toLocaleString()}`,
        };
        io.emit("event", evPayload);
      }
    }
  } else {
    // Daytime hour (08:00 to 16:00): not simulated, cash = pool, repo = 0, overdraft = 0
    const tickPayload: ReplayTick = {
      ts: currentTs,
      phase: "day",
      simulated: false,
      deposits: mRow ? mRow.deposits_usd : 0.0,
      withdrawals: mRow ? mRow.withdrawals_usd : 0.0,
      net_flow: mRow ? mRow.net_flow_usd : 0.0,
      balances: {
        cash: replayState.pool,
        repo: 0.0,
        overdraft: 0.0,
      },
      repo_apy: repoApy,
    };
    io.emit("tick", tickPayload);
  }

  // 3. If 08:00 -> Emit Settlement for the night that just ended
  if (hour === 8 && currentNightDetail) {
    try {
      const kpisRes = await fetchFromEngine(
        `${ENGINE_URL}/kpis?through=${replayState.nightDate}`,
        KpisResponseSchema
      );
      const cumulativeMap: Record<string, StrategyKpi> = {};
      for (const s of kpisRes.strategies) {
        cumulativeMap[s.strategy] = s;
      }

      const settlementPayload: SettlementEvent = {
        night_date: replayState.nightDate,
        interest: currentNightDetail.result.interest,
        break_fee: currentNightDetail.result.break_fee,
        overdraft_cost: currentNightDetail.result.overdraft_cost,
        net_pnl: currentNightDetail.result.net_pnl,
        actual_required_usd: currentNightDetail.actual_required_usd,
        forecast_buffer_usd: currentNightDetail.decision.buffer_usd,
        covered:
          currentNightDetail.actual_required_usd <=
          currentNightDetail.decision.buffer_usd,
        cumulative: cumulativeMap,
      };

      io.emit("settlement", settlementPayload);
      console.log(
        JSON.stringify({
          level: "info",
          type: "settlement",
          ...settlementPayload,
        })
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to produce settlement at 08:00 for ${replayState.nightDate}:`, msg);
    }
  }

  // 4. If 16:00 -> Prefetch next night's /night response
  if (hour === 16) {
    const nextDateStr = currentTs.slice(0, 10);
    // Find next night in forecastNightsList
    const nextNightIdx = forecastNightsList.indexOf(replayState.nightDate) + 1;
    if (nextNightIdx < forecastNightsList.length) {
      const nextNight = forecastNightsList[nextNightIdx];
      const targetStrat = replayState.queuedConfig.strategy || replayState.strategy;
      const targetMode = replayState.queuedConfig.mode || replayState.mode;
      const targetQ =
        replayState.queuedConfig.quantile !== undefined
          ? replayState.queuedConfig.quantile
          : replayState.quantile;
      const targetPool =
        replayState.queuedConfig.pool !== undefined
          ? replayState.queuedConfig.pool
          : replayState.pool;

      prefetchNight(nextNight, targetStrat, targetMode, targetQ, targetPool).catch(
        (err) => console.warn(`Prefetch failed for ${nextNight}:`, err.message)
      );
    }
  }

  // 5. Advance clock by 1 hour
  const nextSimTime = addHours(currentTs, 1);
  if (!marketDataMap.has(nextSimTime)) {
    // End of timeline reached
    replayState.state = "finished";
    if (replayTimeout) clearTimeout(replayTimeout);
    broadcastStatus();
    return;
  }

  replayState.simTime = nextSimTime;
  broadcastStatus();
}

let replayTimeout: NodeJS.Timeout | null = null;
let isTicking = false;

async function tickRunner() {
  if (replayState.state !== "playing" || isTicking) return;
  isTicking = true;
  try {
    await performTick();
  } catch (err: unknown) {
    console.error("Tick execution error:", err);
  } finally {
    isTicking = false;
    if (replayState.state === "playing") {
      replayTimeout = setTimeout(tickRunner, replayState.tickMs);
    }
  }
}

function startReplayTimer() {
  if (replayTimeout) clearTimeout(replayTimeout);
  replayTimeout = setTimeout(tickRunner, replayState.tickMs);
}

// Socket.IO Event Handlers
io.on("connection", (socket: Socket) => {
  // Send initial status on connect
  socket.emit("status", getStatusPayload());

  socket.on("replay:start", async (payload?: { fromNight?: string }) => {
    let targetNight = forecastNightsList[0] || "2026-02-26";
    if (payload?.fromNight && forecastNightsList.includes(payload.fromNight)) {
      targetNight = payload.fromNight;
    }
    replayState.simTime = `${targetNight}T17:00:00`;
    replayState.nightDate = targetNight;
    replayState.state = "playing";

    // Prefetch starting night so 17:00 decision is instantaneous
    try {
      await prefetchNight(
        targetNight,
        replayState.strategy,
        replayState.mode,
        replayState.quantile,
        replayState.pool
      );
    } catch (err) {
      console.warn("Initial prefetch warning:", err);
    }

    broadcastStatus();
    startReplayTimer();
  });

  socket.on("replay:pause", () => {
    replayState.state = "paused";
    if (replayTimeout) clearTimeout(replayTimeout);
    broadcastStatus();
  });

  socket.on("replay:resume", () => {
    if (replayState.state === "paused") {
      replayState.state = "playing";
      broadcastStatus();
      startReplayTimer();
    }
  });

  socket.on("replay:speed", (payload: { tickMs: number }) => {
    if (payload && payload.tickMs > 0) {
      replayState.tickMs = payload.tickMs;
      if (replayState.state === "playing") {
        startReplayTimer();
      }
      broadcastStatus();
    }
  });

  socket.on(
    "replay:seek",
    async (
      payload: { nightDate: string },
      ack?: (res: { ok: boolean; error?: string }) => void
    ) => {
      const date = payload?.nightDate;
      if (!date || !forecastNightsList.includes(date)) {
        socket.emit("event", {
          ts: replayState.simTime,
          type: "alert",
          amount: 0,
          fee: 0,
          message: `Cannot seek to invalid date ${date}. Date must have forecasts.`,
        });
        if (ack) ack({ ok: false, error: `Invalid seek date: ${date}` });
        return;
      }

      replayState.simTime = `${date}T17:00:00`;
      replayState.nightDate = date;

      // Reset active night cache
      currentNightDetail = null;
      broadcastStatus();
      if (ack) ack({ ok: true });
    }
  );

  socket.on("replay:reset", () => {
    if (replayTimeout) clearTimeout(replayTimeout);
    const firstNight = forecastNightsList[0] || "2026-02-26";
    replayState.state = "idle";
    replayState.simTime = `${firstNight}T17:00:00`;
    replayState.nightDate = firstNight;
    replayState.queuedConfig = {};
    currentNightDetail = null;
    broadcastStatus();
  });

  socket.on("config:set", (payload: unknown) => {
    try {
      const parsed = ConfigSetPayloadSchema.parse(payload);
      if (parsed.strategy) replayState.queuedConfig.strategy = parsed.strategy;
      if (parsed.mode) replayState.queuedConfig.mode = parsed.mode;
      if (parsed.quantile !== undefined)
        replayState.queuedConfig.quantile = parsed.quantile;
      if (parsed.pool !== undefined) replayState.queuedConfig.pool = parsed.pool;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      socket.emit("event", {
        ts: replayState.simTime,
        type: "alert",
        amount: 0,
        fee: 0,
        message: `Invalid config payload: ${msg}`,
      });
    }
  });
});

// REST Proxies (with Zod validation)
app.get("/api/health", async (req, res) => {
  try {
    const engineHealth = await fetchFromEngine(
      `${ENGINE_URL}/health`,
      HealthResponseSchema
    );
    let localDbOk = false;
    try {
      await pgPool.query("SELECT 1;");
      localDbOk = true;
    } catch {
      localDbOk = false;
    }
    res.json({
      ...engineHealth,
      server_ok: true,
      server_db_ok: localDbOk,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: msg });
  }
});

app.get("/api/nights", async (req, res) => {
  try {
    const nights = await fetchFromEngine(
      `${ENGINE_URL}/nights`,
      NightsResponseSchema
    );
    res.json(nights);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: msg });
  }
});

app.get("/api/kpis", async (req, res) => {
  try {
    const through = req.query.through ? `?through=${req.query.through}` : "";
    const kpis = await fetchFromEngine(
      `${ENGINE_URL}/kpis${through}`,
      KpisResponseSchema
    );
    res.json(kpis);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: msg });
  }
});

app.get("/api/decisions", async (req, res) => {
  try {
    const params = new URLSearchParams();
    if (req.query.limit) params.set("limit", String(req.query.limit));
    if (req.query.before) params.set("before", String(req.query.before));
    if (req.query.strategy) params.set("strategy", String(req.query.strategy));

    const decisions = await fetchFromEngine(
      `${ENGINE_URL}/decisions?${params.toString()}`,
      DecisionsResponseSchema
    );
    res.json(decisions);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: msg });
  }
});

app.get("/api/forecast/:date", async (req, res) => {
  try {
    const forecast = await fetchFromEngine(
      `${ENGINE_URL}/forecast/${req.params.date}`,
      ForecastResponseSchema
    );
    res.json(forecast);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: msg });
  }
});

// Startup Initialization
async function initialize() {
  console.log("Connecting to PostgreSQL and caching market data...");
  const res = await pgPool.query(`
    SELECT ts, deposits_usd, withdrawals_usd, net_flow_usd, tier1_repo_rate_apy
    FROM market_data
    ORDER BY ts ASC;
  `);

  marketDataMap.clear();
  marketTimeline = [];
  for (const r of res.rows) {
    // Format ts as YYYY-MM-DDTHH:00:00
    const tsStr = toHourIso(new Date(r.ts));
    marketDataMap.set(tsStr, {
      ts: tsStr,
      deposits_usd: parseFloat(r.deposits_usd),
      withdrawals_usd: parseFloat(r.withdrawals_usd),
      net_flow_usd: parseFloat(r.net_flow_usd),
      tier1_repo_rate_apy: parseFloat(r.tier1_repo_rate_apy),
    });
    marketTimeline.push(tsStr);
  }
  console.log(`Cached ${marketTimeline.length} hours of market data.`);

  // Query forecast nights from engine (with fallback to DB)
  try {
    const nightsRes = await fetchFromEngine(
      `${ENGINE_URL}/nights`,
      NightsResponseSchema
    );
    forecastNightsList = nightsRes.nights;
  } catch {
    const dbRes = await pgPool.query(
      "SELECT DISTINCT night_date FROM forecasts ORDER BY night_date ASC;"
    );
    forecastNightsList = dbRes.rows.map((r) => {
      const d = new Date(r.night_date);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    });
  }

  if (forecastNightsList.length > 0) {
    replayState.simTime = `${forecastNightsList[0]}T17:00:00`;
    replayState.nightDate = forecastNightsList[0];
  }
  console.log(
    `Replay initialized with ${forecastNightsList.length} forecast nights. Starting at ${replayState.simTime}.`
  );

  server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT} (ENGINE_URL=${ENGINE_URL})`);
  });
}

initialize().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
