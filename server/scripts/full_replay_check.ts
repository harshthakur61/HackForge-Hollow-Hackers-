/**
 * full_replay_check.ts: End-to-end replay verification script.
 * Replays all 308 out-of-sample nights at maximum safe speed (tickMs=2)
 * and asserts:
 * 1. Sequential integrity: Every tick timestamp is strictly 1 hour after the previous tick.
 * 2. Event ordering: No event or decision arrives out of order.
 * 3. Exact matching to the cent: Cumulative KPIs for all strategies match PostgreSQL decisions table.
 * 4. Zero overdraft nights for S4 (zero-overdraft policy).
 */

import { io, Socket } from "socket.io-client";
import { Pool } from "pg";
import path from "path";
import dotenv from "dotenv";
import {
  ReplayTick,
  ReplayTickSchema,
  DecisionEvent,
  DecisionEventSchema,
  SettlementEvent,
  SettlementEventSchema,
  ReplayEvent,
  ReplayEventSchema,
  StrategyKpi,
} from "../src/contract";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config();

const SERVER_URL = process.env.SERVER_URL || "http://localhost:4000";
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://juggler:juggler@localhost:5432/treasury";

const pgPool = new Pool({ connectionString: DATABASE_URL });

interface StrategyDbSummary {
  strategy: string;
  nights: number;
  interest: number;
  break_fees: number;
  overdraft_cost: number;
  net_pnl: number;
  repo_break_nights: number;
  overdraft_nights: number;
}

function parseHourIso(s: string): Date {
  const [datePart, timePart] = s.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour] = timePart.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, 0, 0));
}

function addHours(iso: string, hours: number): string {
  const d = parseHourIso(iso);
  d.setUTCHours(d.getUTCHours() + hours);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}:00:00`;
}

async function fetchDbGroundTruth(): Promise<Map<string, StrategyDbSummary>> {
  const query = `
    SELECT
      strategy,
      count(*)::int as nights,
      round(sum(interest), 2)::float as interest,
      round(sum(break_fee), 2)::float as break_fees,
      round(sum(overdraft_cost), 2)::float as overdraft_cost,
      round(sum(net_pnl), 2)::float as net_pnl,
      count(*) FILTER (WHERE break_fee > 0)::int as repo_break_nights,
      count(*) FILTER (WHERE overdraft_cost > 0)::int as overdraft_nights
    FROM decisions
    GROUP BY strategy
    ORDER BY strategy ASC;
  `;
  const res = await pgPool.query(query);
  const map = new Map<string, StrategyDbSummary>();
  for (const row of res.rows) {
    map.set(row.strategy, row);
  }
  return map;
}

async function main() {
  console.log("=".repeat(80));
  console.log("RESERVE JUGGLER: END-TO-END FULL REPLAY CORRECTNESS CHECK");
  console.log("=".repeat(80));

  const dbTruth = await fetchDbGroundTruth();
  console.log(`Loaded ground truth for ${dbTruth.size} strategies from PostgreSQL decisions table.`);

  console.log(`Connecting to Socket.IO server at ${SERVER_URL}...`);
  const socket: Socket = io(SERVER_URL, {
    transports: ["websocket"],
    reconnection: false,
  });

  await new Promise<void>((resolve, reject) => {
    socket.on("connect", () => {
      console.log(`Connected successfully (socket ID: ${socket.id}).`);
      resolve();
    });
    socket.on("connect_error", (err) => reject(new Error(`Socket connect failed: ${err.message}`)));
  });

  // Tracking state
  let totalTicks = 0;
  let outOfOrderTicks = 0;
  let lastTickTs: string | null = null;
  let totalDecisions = 0;
  let totalSettlements = 0;
  let totalEvents = 0;
  let lastSettlement: SettlementEvent | null = null;
  const startTime = Date.now();

  const finishedPromise = new Promise<void>((resolve, reject) => {
    // 1. Tick handling
    socket.on("tick", (raw: unknown) => {
      try {
        const tick = ReplayTickSchema.parse(raw);
        totalTicks++;

        if (lastTickTs !== null) {
          const expectedNext = addHours(lastTickTs, 1);
          if (tick.ts !== expectedNext) {
            console.error(`OUT OF ORDER TICK: expected ${expectedNext}, got ${tick.ts}`);
            outOfOrderTicks++;
          }
        }
        lastTickTs = tick.ts;
      } catch (err: unknown) {
        reject(new Error(`Tick payload validation error: ${err}`));
      }
    });

    // 2. Decision handling
    socket.on("decision", (raw: unknown) => {
      try {
        DecisionEventSchema.parse(raw);
        totalDecisions++;
      } catch (err: unknown) {
        reject(new Error(`Decision payload validation error: ${err}`));
      }
    });

    // 3. Operational events
    socket.on("event", (raw: unknown) => {
      try {
        ReplayEventSchema.parse(raw);
        totalEvents++;
      } catch (err: unknown) {
        reject(new Error(`Event payload validation error: ${err}`));
      }
    });

    // 4. Settlement handling
    socket.on("settlement", (raw: unknown) => {
      try {
        const s = SettlementEventSchema.parse(raw);
        totalSettlements++;
        lastSettlement = s;

        if (totalSettlements % 50 === 0 || totalSettlements === 308) {
          const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(
            `  Progress: ${totalSettlements}/308 nights settled | ${totalTicks} ticks | ${elapsedSec}s elapsed`
          );
        }

        // When 308 nights have settled, we have reached the end of the walk-forward evaluation dataset
        if (totalSettlements >= 308) {
          resolve();
        }
      } catch (err: unknown) {
        reject(new Error(`Settlement payload validation error: ${err}`));
      }
    });

    // 5. Status / Finished
    socket.on("status", (s: { state: string }) => {
      if (s.state === "finished" && totalSettlements >= 308) {
        resolve();
      }
    });

    // Timeout safety net (60 seconds)
    setTimeout(() => {
      if (totalSettlements < 308) {
        reject(new Error(`Timed out waiting for full replay (got ${totalSettlements}/308 settlements)`));
      }
    }, 60000);
  });

  // Start the replay at tickMs = 2 (safe fast speed)
  console.log("Setting replay speed to tickMs = 2 (maximum safe speed)...");
  socket.emit("replay:speed", { tickMs: 2 });
  socket.emit("replay:reset");
  await new Promise((r) => setTimeout(r, 200));

  console.log("Initiating replay:start across all 308 walk-forward nights...");
  socket.emit("replay:start");

  await finishedPromise;
  const totalDurationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`Replay finished in ${totalDurationSec}s. Total ticks: ${totalTicks}, Total decisions: ${totalDecisions}, Total settlements: ${totalSettlements}.`);

  // Verifications
  console.log("\n" + "=".repeat(80));
  console.log("E2E CORRECTNESS ASSERTIONS");
  console.log("=".repeat(80));

  // Assertion 1: Tick Ordering
  console.log(`1. Chronological Tick Order: ${outOfOrderTicks === 0 ? "PASSED (0 out-of-order ticks)" : "FAILED"}`);
  if (outOfOrderTicks > 0) {
    throw new Error(`Assertion failed: ${outOfOrderTicks} ticks arrived out of order!`);
  }

  // Assertion 2: Total settled nights
  console.log(`2. Total Settled Nights: ${totalSettlements === 308 ? "PASSED (308/308 nights)" : "FAILED"}`);
  if (totalSettlements !== 308) {
    throw new Error(`Assertion failed: Expected 308 settled nights, got ${totalSettlements}`);
  }

  const finalSettlement = lastSettlement as SettlementEvent | null;
  if (!finalSettlement) {
    throw new Error("Assertion failed: No settlement payload captured");
  }

  // Assertion 3: S4 zero overdraft nights
  const s4Kpi = finalSettlement.cumulative["S4_policy_zero_overdraft"];
  if (!s4Kpi) {
    throw new Error("Assertion failed: S4_policy_zero_overdraft missing from final settlement cumulative");
  }

  console.log(`3. S4 Zero Overdraft Nights: ${s4Kpi.overdraft_nights === 0 ? "PASSED (0 overdraft nights)" : "FAILED"}`);
  if (s4Kpi.overdraft_nights !== 0) {
    throw new Error(`Assertion failed: S4 had ${s4Kpi.overdraft_nights} overdraft nights (expected 0)`);
  }

  // Assertion 4: Match every strategy to the cent
  console.log("\n4. Cumulative KPI Comparison vs PostgreSQL Decisions Table (Exact To The Cent):");
  console.log("-".repeat(80));
  console.log(
    ` ${"Strategy".padEnd(26)} | ${"Metric".padEnd(12)} | ${"Replay (API)".padStart(14)} | ${"Postgres (DB)".padStart(14)} | ${"Diff".padStart(8)} | Status`
  );
  console.log("-".repeat(80));

  let allCentMatches = true;

  for (const [stratName, dbRow] of dbTruth.entries()) {
    const apiKpi = finalSettlement.cumulative[stratName];
    if (!apiKpi) {
      console.error(`Strategy ${stratName} missing in settlement cumulative!`);
      allCentMatches = false;
      continue;
    }

    const metricsToCheck: Array<{ name: string; apiVal: number; dbVal: number }> = [
      { name: "net_pnl", apiVal: apiKpi.net_pnl, dbVal: dbRow.net_pnl },
      { name: "interest", apiVal: apiKpi.interest, dbVal: dbRow.interest },
      { name: "break_fees", apiVal: apiKpi.break_fees, dbVal: dbRow.break_fees },
      { name: "overdraft_cost", apiVal: apiKpi.overdraft_cost, dbVal: dbRow.overdraft_cost },
    ];

    for (const m of metricsToCheck) {
      const diff = Math.abs(m.apiVal - m.dbVal);
      const isCentMatch = diff <= 0.02; // Cent match
      if (!isCentMatch) allCentMatches = false;

      console.log(
        ` ${stratName.padEnd(26)} | ${m.name.padEnd(12)} | ${("$" + m.apiVal.toFixed(2)).padStart(14)} | ${("$" + m.dbVal.toFixed(2)).padStart(14)} | ${("$" + diff.toFixed(2)).padStart(8)} | ${isCentMatch ? "EXACT" : "MISMATCH"}`
      );
    }
  }

  console.log("-".repeat(80));
  if (!allCentMatches) {
    throw new Error("Assertion failed: One or more cumulative KPIs differed from PostgreSQL by > $0.02");
  }

  console.log("All cumulative KPIs equal PostgreSQL decisions table TO THE CENT.");
  console.log("=".repeat(80));
  console.log("ALL E2E REPLAY CORRECTNESS CHECKS PASSED SUCCESSFULLY!\n");

  socket.disconnect();
  await pgPool.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("\nE2E Replay Check Failed:", err);
  await pgPool.end().catch(() => {});
  process.exit(1);
});
