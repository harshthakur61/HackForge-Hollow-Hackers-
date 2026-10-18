import { describe, it, expect, beforeEach } from "vitest";
import { useReplayStore, selectSleeveChartData, SleevePoint } from "../store/useReplayStore";
import { ReplayTick, SettlementEvent } from "../contract";

const tick1: ReplayTick = {
  ts: "2026-02-26T17:00:00",
  phase: "night",
  simulated: true,
  deposits: 1000,
  withdrawals: 500,
  net_flow: 500,
  balances: { cash: 10_000_000, repo: 90_000_000, overdraft: 0 },
  repo_apy: 4.05,
  sleeve: {
    repo: 10_000_000,
    bonds: 24_000_000,
    equities: 16_000_000,
    carry: 1200,
    total: 50_001_200,
    benchmark: 50_000_500,
    cum_excess: 700,
  },
};

const tick2: ReplayTick = {
  ts: "2026-02-26T18:00:00",
  phase: "night",
  simulated: true,
  deposits: 1500,
  withdrawals: 600,
  net_flow: 900,
  balances: { cash: 10_000_900, repo: 90_000_000, overdraft: 0 },
  repo_apy: 4.05,
  sleeve: {
    repo: 10_000_100,
    bonds: 24_002_000,
    equities: 16_005_000,
    carry: 2400,
    total: 50_007_100,
    benchmark: 50_001_000,
    cum_excess: 6100,
  },
};

const tickWithoutSleeve: ReplayTick = {
  ts: "2026-02-26T19:00:00",
  phase: "night",
  simulated: true,
  deposits: 500,
  withdrawals: 200,
  net_flow: 300,
  balances: { cash: 10_001_200, repo: 90_000_000, overdraft: 0 },
  repo_apy: 4.05,
};

describe("Strategic Sleeve Store and Chart Selector Tests", () => {
  beforeEach(() => {
    useReplayStore.getState().resetAll();
  });

  it("initializes with empty sleeve points and default risk_budget preset", () => {
    const state = useReplayStore.getState();
    expect(state.sleevePoints).toEqual([]);
    expect(state.latestSleevePoint).toBeNull();
    expect(state.sleeveConfig.preset).toBe("risk_budget");
  });

  it("updates sleeve configuration via setSleeveConfig", () => {
    useReplayStore.getState().setSleeveConfig({
      preset: "balanced",
      weights: { repo: 0.4, bonds: 0.4, equity: 0.2 },
    });
    const state = useReplayStore.getState();
    expect(state.sleeveConfig.preset).toBe("balanced");
    expect(state.sleeveConfig.weights?.repo).toBe(0.4);
  });

  it("appends sleeve points sequentially on handleTick and ignores ticks without sleeve", () => {
    useReplayStore.getState().handleTick(tick1);
    let state = useReplayStore.getState();
    expect(state.sleevePoints.length).toBe(1);
    expect(state.latestSleevePoint?.ts).toBe("2026-02-26T17:00:00");
    expect(state.latestSleevePoint?.total).toBe(50_001_200);

    useReplayStore.getState().handleTick(tick2);
    state = useReplayStore.getState();
    expect(state.sleevePoints.length).toBe(2);
    expect(state.latestSleevePoint?.ts).toBe("2026-02-26T18:00:00");

    // Tick without sleeve data should NOT append a new sleeve point
    useReplayStore.getState().handleTick(tickWithoutSleeve);
    state = useReplayStore.getState();
    expect(state.sleevePoints.length).toBe(2);
    expect(state.latestSleevePoint?.ts).toBe("2026-02-26T18:00:00");
  });

  it("ignores out-of-order or duplicate sleeve ticks", () => {
    useReplayStore.getState().handleTick(tick2);
    useReplayStore.getState().handleTick(tick1); // Older timestamp
    const state = useReplayStore.getState();
    expect(state.sleevePoints.length).toBe(1);
    expect(state.sleevePoints[0].ts).toBe("2026-02-26T18:00:00");
  });

  it("selectSleeveChartData strictly returns received points up to latest tick (no lookahead)", () => {
    // 0 points when empty
    expect(selectSleeveChartData([])).toEqual([]);

    // 1 point after 1st tick
    const points1: SleevePoint[] = [
      {
        ts: tick1.ts,
        repo: tick1.sleeve!.repo,
        bonds: tick1.sleeve!.bonds,
        equities: tick1.sleeve!.equities,
        carry: tick1.sleeve!.carry,
        total: tick1.sleeve!.total,
        benchmark: tick1.sleeve!.benchmark,
        cum_excess: tick1.sleeve!.cum_excess,
      },
    ];
    const data1 = selectSleeveChartData(points1);
    expect(data1.length).toBe(1);
    expect(data1[0].ts).toBe("2026-02-26T17:00:00");
    expect(data1[0].repo_m).toBe(10);
    expect(data1[0].bonds_m).toBe(24);
    expect(data1[0].equities_m).toBe(16);
    expect(data1[0].total_m).toBeCloseTo(50.0012, 4);

    // 2 points after 2nd tick
    const points2: SleevePoint[] = [
      ...points1,
      {
        ts: tick2.ts,
        repo: tick2.sleeve!.repo,
        bonds: tick2.sleeve!.bonds,
        equities: tick2.sleeve!.equities,
        carry: tick2.sleeve!.carry,
        total: tick2.sleeve!.total,
        benchmark: tick2.sleeve!.benchmark,
        cum_excess: tick2.sleeve!.cum_excess,
      },
    ];
    const data2 = selectSleeveChartData(points2);
    expect(data2.length).toBe(2);
    expect(data2[1].ts).toBe("2026-02-26T18:00:00");
  });

  it("resets sleeve points on resetSleevePoints and resetAll", () => {
    useReplayStore.getState().handleTick(tick1);
    expect(useReplayStore.getState().sleevePoints.length).toBe(1);

    useReplayStore.getState().resetSleevePoints();
    expect(useReplayStore.getState().sleevePoints).toEqual([]);
    expect(useReplayStore.getState().latestSleevePoint).toBeNull();

    useReplayStore.getState().handleTick(tick1);
    expect(useReplayStore.getState().sleevePoints.length).toBe(1);

    useReplayStore.getState().resetAll();
    expect(useReplayStore.getState().sleevePoints).toEqual([]);
    expect(useReplayStore.getState().latestSleevePoint).toBeNull();
  });

  it("stores sleeve settlement payload upon settlement event", () => {
    const mockSettlement: SettlementEvent = {
      night_date: "2026-02-26",
      interest: 10000,
      break_fee: 0,
      overdraft_cost: 0,
      net_pnl: 10000,
      actual_required_usd: 5000000,
      forecast_buffer_usd: 12000000,
      covered: true,
      cumulative: {},
      sleeve: {
        total_mv: 50_020_000,
        repo_mv: 10_005_000,
        bond_clean_mv: 24_010_000,
        equity_mv: 16_005_000,
        cum_excess: 12000,
        pnl: 20000,
      },
    };

    useReplayStore.getState().handleSettlement(mockSettlement);
    const state = useReplayStore.getState();
    expect(state.latestSleeveSettlement?.pnl).toBe(20000);
    expect(state.latestSleeveSettlement?.cum_excess).toBe(12000);
  });
});
