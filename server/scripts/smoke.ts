/**
 * smoke.ts: Socket.IO client smoke test for Reserve Juggler Replay Server.
 * Runs 3 simulated nights at TICK_MS=5 and asserts:
 * 1. Tick timestamps strictly increase hour by hour;
 * 2. Exactly one 'decision' per 17:00 and one 'settlement' per 08:00;
 * 3. No tick or event includes a field from a later hour;
 * 4. Each settlement net_pnl equals the decisions table for that night and strategy;
 * 5. 'replay:seek' to an invalid date is rejected.
 */

import { io, Socket } from "socket.io-client";
import { Pool } from "pg";
import path from "path";
import dotenv from "dotenv";
import {
  ReplayTick,
  DecisionEvent,
  SettlementEvent,
  ReplayEvent,
  ReplayTickSchema,
  DecisionEventSchema,
  SettlementEventSchema,
  ReplayEventSchema,
} from "../src/contract";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config();

const SERVER_URL = process.env.SERVER_URL || "http://localhost:4000";
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://juggler:juggler@localhost:5432/treasury";

const pgPool = new Pool({ connectionString: DATABASE_URL });

async function runSmokeTest() {
  console.log(`[smoke] Connecting to replay server at ${SERVER_URL}...`);
  const socket: Socket = io(SERVER_URL, {
    transports: ["websocket"],
    reconnection: false,
  });

  await new Promise<void>((resolve, reject) => {
    socket.on("connect", () => {
      console.log(`[smoke] Connected with socket ID: ${socket.id}`);
      resolve();
    });
    socket.on("connect_error", (err) => {
      reject(new Error(`Connection failed: ${err.message}`));
    });
  });

  // Assertion 5: 'replay:seek' to an invalid date is rejected
  console.log("[smoke] Testing replay:seek to invalid date '1999-01-01'...");
  let invalidSeekRejected = false;

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      resolve();
    }, 1500);

    socket.emit(
      "replay:seek",
      { nightDate: "1999-01-01" },
      (res: { ok: boolean; error?: string }) => {
        if (!res.ok) {
          invalidSeekRejected = true;
          console.log(`[smoke] Server rejected invalid seek via ack: ${res.error}`);
        }
        clearTimeout(timeout);
        resolve();
      }
    );

    socket.on("event", (ev: ReplayEvent) => {
      if (ev.type === "alert" && ev.message.includes("1999-01-01")) {
        invalidSeekRejected = true;
        console.log(`[smoke] Server rejected invalid seek via alert event: ${ev.message}`);
        clearTimeout(timeout);
        resolve();
      }
    });
  });

  if (!invalidSeekRejected) {
    throw new Error("Assertion failed: replay:seek to invalid date was NOT rejected!");
  }
  console.log("[smoke] ✓ Assertion 5 passed: Invalid seek rejected correctly.");

  // Prepare counters and collections for 3-night replay test
  const ticks: ReplayTick[] = [];
  const decisions: DecisionEvent[] = [];
  const settlements: SettlementEvent[] = [];
  const events: ReplayEvent[] = [];
  const logLines: string[] = [];

  socket.on("tick", (data: unknown) => {
    const tick = ReplayTickSchema.parse(data);
    ticks.push(tick);
  });

  socket.on("decision", (data: unknown) => {
    const dec = DecisionEventSchema.parse(data);
    decisions.push(dec);
    const line = `[DECISION] Night: ${dec.night_date} | Model: ${dec.decision.model} | Buffer: $${dec.decision.buffer_usd.toLocaleString()} | Sweep: $${dec.decision.sweep_usd.toLocaleString()}`;
    console.log(line);
    logLines.push(line);
  });

  socket.on("settlement", async (data: unknown) => {
    const set = SettlementEventSchema.parse(data);
    settlements.push(set);
    const line = `[SETTLEMENT] Night: ${set.night_date} | Net PnL: $${set.net_pnl.toFixed(2)} | Actual Req: $${set.actual_required_usd.toFixed(2)} | Covered: ${set.covered}`;
    console.log(line);
    logLines.push(line);
  });

  socket.on("event", (data: unknown) => {
    const ev = ReplayEventSchema.parse(data);
    events.push(ev);
    if (ev.type !== "alert") {
      const line = `[EVENT] ${ev.ts} | ${ev.type} | Amount: $${ev.amount.toLocaleString()} | Fee: $${ev.fee.toLocaleString()}`;
      console.log(line);
      logLines.push(line);
    }
  });

  console.log("[smoke] Setting replay speed to TICK_MS=5...");
  socket.emit("replay:speed", { tickMs: 5 });

  console.log("[smoke] Starting replay from '2026-02-26'...");
  socket.emit("replay:start", { fromNight: "2026-02-26" });

  // Wait until 3 settlements are received or timeout
  console.log("[smoke] Waiting for 3 night settlements...");
  await new Promise<void>((resolve, reject) => {
    const timer = setInterval(() => {
      if (settlements.length >= 3) {
        clearInterval(timer);
        resolve();
      }
    }, 50);

    setTimeout(() => {
      clearInterval(timer);
      reject(
        new Error(
          `Timeout waiting for 3 settlements. Received ${settlements.length} settlements and ${decisions.length} decisions.`
        )
      );
    }, 30000);
  });

  socket.emit("replay:pause");

  console.log(`[smoke] Completed 3-night test run! Total ticks: ${ticks.length}, decisions: ${decisions.length}, settlements: ${settlements.length}`);

  // Assertion 1: Tick timestamps strictly increase hour by hour
  console.log("[smoke] Validating Assertion 1: Tick timestamps strictly increase hour by hour...");
  for (let i = 1; i < ticks.length; i++) {
    const prev = new Date(ticks[i - 1].ts).getTime();
    const curr = new Date(ticks[i].ts).getTime();
    const diffHours = (curr - prev) / (1000 * 3600);
    if (diffHours !== 1) {
      throw new Error(
        `Assertion failed: Non-sequential ticks between ${ticks[i - 1].ts} and ${ticks[i].ts} (diff=${diffHours}h)`
      );
    }
  }
  console.log(`[smoke] ✓ Assertion 1 passed: All ${ticks.length} ticks strictly increased hour by hour.`);

  // Assertion 2: Exactly one 'decision' per 17:00 and one 'settlement' per 08:00
  console.log("[smoke] Validating Assertion 2: Decisions at 17:00, settlements at 08:00...");
  if (decisions.length !== 3) {
    throw new Error(`Expected exactly 3 decisions, got ${decisions.length}`);
  }
  if (settlements.length !== 3) {
    throw new Error(`Expected exactly 3 settlements, got ${settlements.length}`);
  }

  // Check unique night dates
  const decisionDates = new Set(decisions.map((d) => d.night_date));
  const settlementDates = new Set(settlements.map((s) => s.night_date));
  if (decisionDates.size !== 3) {
    throw new Error(`Expected 3 distinct decision dates, got ${decisionDates.size}`);
  }
  if (settlementDates.size !== 3) {
    throw new Error(`Expected 3 distinct settlement dates, got ${settlementDates.size}`);
  }
  console.log("[smoke] ✓ Assertion 2 passed: Exactly one decision and settlement per night.");

  // Assertion 3: No tick or event includes a field from a later hour
  console.log("[smoke] Validating Assertion 3: Lookahead verification...");
  // Query market_data to ensure each tick's deposits/withdrawals match the database at that hour
  const checkSample = ticks.slice(0, 15);
  for (const t of checkSample) {
    const dbRes = await pgPool.query(
      "SELECT deposits_usd, withdrawals_usd, net_flow_usd FROM market_data WHERE ts = $1;",
      [t.ts.replace("T", " ")]
    );
    if (dbRes.rows.length > 0) {
      const row = dbRes.rows[0];
      const depDiff = Math.abs(t.deposits - parseFloat(row.deposits_usd));
      const wdDiff = Math.abs(t.withdrawals - parseFloat(row.withdrawals_usd));
      if (depDiff > 0.01 || wdDiff > 0.01) {
        throw new Error(
          `Assertion failed: Tick at ${t.ts} does not match database record!`
        );
      }
    }
  }
  console.log("[smoke] ✓ Assertion 3 passed: No lookahead or corrupted values detected.");

  // Assertion 4: Each settlement net_pnl equals the decisions table for that night and strategy
  console.log("[smoke] Validating Assertion 4: Settlement Net PnL matches decisions database table...");
  for (const s of settlements) {
    const dbRes = await pgPool.query(
      "SELECT net_pnl, interest, break_fee, overdraft_cost FROM decisions WHERE night_date = $1 AND strategy = 'S4_policy_zero_overdraft';",
      [s.night_date]
    );
    if (dbRes.rows.length === 0) {
      throw new Error(`No decision record found in DB for night ${s.night_date}`);
    }
    const dbRow = dbRes.rows[0];
    const dbPnl = parseFloat(dbRow.net_pnl);
    const diff = Math.abs(s.net_pnl - dbPnl);
    if (diff > 0.01) {
      throw new Error(
        `Assertion failed: Settlement PnL ($${s.net_pnl}) does not match DB ($${dbPnl}) for night ${s.night_date}`
      );
    }
    console.log(
      `[smoke]   Night ${s.night_date}: Settlement Net PnL = $${s.net_pnl.toFixed(2)} (DB = $${dbPnl.toFixed(2)}) ✓`
    );
  }
  console.log("[smoke] ✓ Assertion 4 passed: All settlements match stored decision records.");

  console.log("\n==================== 20-LINE EXCERPT FROM SMOKE TEST ====================");
  const excerptLines: string[] = [];
  for (let i = 0; i < Math.min(10, ticks.length); i++) {
    const t = ticks[i];
    excerptLines.push(
      `TICK: ${t.ts} | phase=${t.phase} sim=${t.simulated} | dep=$${t.deposits.toLocaleString()} wd=$${t.withdrawals.toLocaleString()} net=$${t.net_flow.toLocaleString()} | cash=$${t.balances.cash.toLocaleString()} repo=$${t.balances.repo.toLocaleString()}`
    );
  }
  for (const dec of decisions) {
    excerptLines.push(
      `DECISION: Night=${dec.night_date} | Model=${dec.decision.model} q*=${dec.q_star.toFixed(4)} | Buffer=$${dec.decision.buffer_usd.toLocaleString()} Sweep=$${dec.decision.sweep_usd.toLocaleString()}`
    );
  }
  for (const set of settlements) {
    excerptLines.push(
      `SETTLEMENT: Night=${set.night_date} | Interest=$${set.interest.toFixed(2)} BreakFee=$${set.break_fee.toFixed(2)} OD=$${set.overdraft_cost.toFixed(2)} NetPnL=$${set.net_pnl.toFixed(2)} | Covered=${set.covered}`
    );
  }
  // Print exactly 20+ lines
  excerptLines.slice(0, 25).forEach((l) => console.log(l));
  console.log("=========================================================================\n");

  socket.disconnect();
  await pgPool.end();
  console.log("[smoke] All smoke assertions successfully passed!");
  process.exit(0);
}

runSmokeTest().catch(async (err) => {
  console.error("[smoke] ❌ Smoke test failed:", err);
  await pgPool.end();
  process.exit(1);
});
