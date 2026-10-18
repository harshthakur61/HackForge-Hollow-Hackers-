/**
 * MethodologyPage.tsx: Institutional assumptions, mathematical conventions, and definitions.
 * Strictly adheres to prompt constraints:
 * - Assumptions and definitions only
 * - ZERO performance numbers typed in by hand
 * - Plain treasury language
 * - Reads forecasting model from API and translates known codes (e.g. B1)
 */

import React from "react";
import { Shield, Cpu, Scale, AlertTriangle, Layers } from "lucide-react";
import { useConfigQuery } from "../hooks/useQueries";
import { translateModelCode } from "../utils/formatters";
import { STRATEGY_LABELS, MODEL_CODE_LABELS } from "../utils/labels";

export const MethodologyPage: React.FC = () => {
  const { data: config } = useConfigQuery();

  const modelCode = config?.model_for_policy || "B1";
  const modelTranslated = translateModelCode(modelCode);

  return (
    <div className="max-w-4xl space-y-8">
      {/* Page Header */}
      <div className="pb-4 border-b border-border-subtle">
        <h2 className="text-xl font-bold tracking-tight text-text-primary">
          Treasury Policy Engine Methodology
        </h2>
        <p className="text-xs text-text-muted mt-1 leading-relaxed">
          Operating principles, operational constraints, and mathematical definitions governing automated cash buffer sizing and overnight repurchase agreement allocation.
        </p>
      </div>

      {/* 1. Dataset Replay Scope */}
      <section className="bg-surface border border-border-subtle rounded-md p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-accent-primary" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
            1. Simulation Scope & Dataset Replay
          </h3>
        </div>
        <p className="text-xs text-text-secondary leading-relaxed">
          The console evaluates treasury performance over a 1-year historical dataset using a strict walk-forward simulation. Each simulation cycle models the 15-hour overnight window starting at 17:00 on calendar date <em>D</em> through 08:00 maturity on date <em>D+1</em>. Daytime trading hours (08:00 to 16:59) are not simulated; client liquidity and operating flows during the day are assumed settled externally before the 17:00 sweep decision.
        </p>
      </section>

      {/* 2. Capital Pool & External Replenishment */}
      <section className="bg-surface border border-border-subtle rounded-md p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-accent-primary" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
            2. Capital Pool & Replenishment Convention
          </h3>
        </div>
        <p className="text-xs text-text-secondary leading-relaxed">
          The treasury workstation begins each night with a normalized initial liquidity pool (default $100,000,000 USD Tier 0 cash). Operating drift across daytime windows is ignored by convention; client deposit inflows and external settlement operations are assumed to replenish the starting cash pool to the configured baseline at 17:00 daily.
        </p>
      </section>

      {/* 3. Repo Interest Accrual Convention */}
      <section className="bg-surface border border-border-subtle rounded-md p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-accent-primary" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
            3. Overnight Repo Accrual & Settlement
          </h3>
        </div>
        <p className="text-xs text-text-secondary leading-relaxed">
          Any cash remaining above the allocated reserve buffer at 17:00 is swept into a Tier 1 overnight repo facility. Gross interest is calculated based on the swept principal that remains unredeemed at 08:00 maturity:
        </p>
        <div className="p-3 bg-subtle rounded-sm font-mono text-xs text-text-primary border border-border-subtle">
          Repo Interest = Remaining Swept Principal × (Tier 1 Repo Rate APY / 100) / 365
        </div>
        <p className="text-xs text-text-secondary leading-relaxed">
          Interest is credited to the treasury account upon 08:00 settlement. If overnight withdrawal spikes exceed the cash buffer, swept repo funds are liquidated early to honor client withdrawals, incurring an early redemption penalty haircut (default 0.5% applied to the liquidated amount).
        </p>
      </section>

      {/* 4. Policy Modes */}
      {/* 4. Strategy Taxonomy & Policy Modes */}
      <section className="bg-surface border border-border-subtle rounded-md p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-accent-primary" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
            4. Strategy Taxonomy & Policy Modes
          </h3>
        </div>
        <p className="text-xs text-text-secondary leading-relaxed">
          The treasury workstation evaluates seven standardized liquidity strategies defined in the API contract:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
          <div className="p-2.5 rounded-sm border border-border-subtle bg-subtle/40">
            <span className="font-semibold text-text-primary block">{STRATEGY_LABELS.S0_all_cash}</span>
            <span className="text-2xs text-text-muted">Zero repo sweep; 100% held in cash. Zero yield, zero penalties.</span>
          </div>
          <div className="p-2.5 rounded-sm border border-border-subtle bg-subtle/40">
            <span className="font-semibold text-text-primary block">{STRATEGY_LABELS.S1_fixed_10}</span>
            <span className="text-2xs text-text-muted">Fixed 10% cash reserve; sweeps 90% into repo. Frequent emergency overdrafts.</span>
          </div>
          <div className="p-2.5 rounded-sm border border-border-subtle bg-subtle/40">
            <span className="font-semibold text-text-primary block">{STRATEGY_LABELS.S2_fixed_20}</span>
            <span className="text-2xs text-text-muted">Fixed 20% cash reserve; sweeps 80% into repo.</span>
          </div>
          <div className="p-2.5 rounded-sm border border-border-subtle bg-subtle/40">
            <span className="font-semibold text-text-primary block">{STRATEGY_LABELS.S3_static}</span>
            <span className="text-2xs text-text-muted">Static historical quantile buffer without weekday or shock adjustments.</span>
          </div>
          <div className="p-2.5 rounded-sm border border-border-subtle bg-subtle/40">
            <span className="font-semibold text-text-primary block">{STRATEGY_LABELS.S4_policy_zero_overdraft}</span>
            <span className="text-2xs text-text-muted">Dynamically calibrated buffer to minimize overdraft penalty exposure.</span>
          </div>
          <div className="p-2.5 rounded-sm border border-border-subtle bg-subtle/40">
            <span className="font-semibold text-text-primary block">{STRATEGY_LABELS.S5_policy_cost_optimal}</span>
            <span className="text-2xs text-text-muted">Balances repo early-break haircut against emergency overdraft penalty APR.</span>
          </div>
        </div>

        <div className="p-3 rounded-sm border border-accent-primary/20 bg-accent-subtle/20 text-xs text-text-secondary space-y-1">
          <span className="font-semibold text-text-primary block">Price of Safety Definition</span>
          <p>
            <strong>Price of safety = S5 net P&L minus S4 net P&L.</strong> It represents the economic yield sacrificed to eliminate emergency overdraft penalties entirely.
          </p>
        </div>
      </section>

      {/* 5. Oracle Benchmark */}
      <section className="bg-surface border border-border-subtle rounded-md p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-purple-600" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
            5. Oracle Benchmark: {STRATEGY_LABELS.S6_oracle}
          </h3>
        </div>
        <p className="text-xs text-text-secondary leading-relaxed">
          Strategy S6 operates with perfect post-hoc foresight of the exact cumulative liquidity trough for each night. At 17:00, it sets the buffer to precisely the maximum cumulative outflow observed between 17:00 and 07:00, sweeping 100% of true surplus without ever breaking repo or drawing overdraft.
        </p>
        <div className="p-2.5 rounded-sm bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 text-xs text-purple-900 dark:text-purple-200">
          <strong>Institutional Governance Note:</strong> S6 Oracle represents a theoretical upper bound for benchmark comparison and is not deployable in live treasury execution.
        </div>
      </section>

      {/* 6. Active Forecasting Model */}
      <section className="bg-surface border border-border-subtle rounded-md p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-accent-primary" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
            6. Active Forecasting Architecture
          </h3>
        </div>
        <p className="text-xs text-text-secondary leading-relaxed">
          The production policy engine dynamically connects to the statistical model designated by the backend:
        </p>
        <div className="p-3 bg-subtle rounded-sm border border-border-subtle space-y-1.5 font-mono text-xs">
          <div className="flex justify-between">
            <span className="text-text-muted">Active Model Identifier:</span>
            <span className="font-bold text-accent-primary">{modelCode}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Architecture Description:</span>
            <span className="text-text-primary font-sans">{modelTranslated}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Feature Cutoff Rule:</span>
            <span className="text-text-primary font-sans">Strictly &le; 16:00 on Date D (no lookahead)</span>
          </div>
        </div>
        <p className="text-xs text-text-secondary leading-relaxed">
          Standardized forecasting model translations:
        </p>
        <ul className="list-disc list-inside text-xs text-text-secondary space-y-1 pl-1">
          {Object.entries(MODEL_CODE_LABELS).map(([code, label]) => (
            <li key={code}>
              <strong>{code}:</strong> {label}
            </li>
          ))}
        </ul>
      </section>

      {/* 7. Known Limitations */}
      <section className="bg-surface border border-border-subtle rounded-md p-5 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-warn" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
            7. Known Operational Limitations
          </h3>
        </div>
        <ul className="list-disc list-inside text-xs text-text-secondary space-y-1.5 pl-1 leading-relaxed">
          <li>
            <strong>Intraday Daytime Spikes:</strong> Liquidity fluctuations between 08:00 and 16:59 are treated as external and are not captured by the overnight buffer model.
          </li>
          <li>
            <strong>Out-of-Sample Regime Changes:</strong> Severe structural deposit runs exceeding 4 standard deviations beyond historical distribution may necessitate secondary liquidity intervention.
          </li>
          <li>
            <strong>Counterparty Default Immunity:</strong> The simulation assumes zero credit or default risk on repo collateral and immediate liquidity upon early termination.
          </li>
        </ul>
      </section>

      {/* 8. Strategic Sleeve & Mandatory Honesty Disclosures */}
      <section className="bg-surface border border-border-subtle rounded-md p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-accent-primary" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
            8. Strategic Sleeve (Tier 2 & 3) & Fiduciary Honesty Disclosures
          </h3>
        </div>
        <p className="text-xs text-text-secondary leading-relaxed">
          The strategic sleeve allocates capital across Tier 1 (Overnight Repo), Tier 2 (2Y Government Bonds), and Tier 3 (Equity Index) under buy-and-hold conventions. Unlike the nightly replenished operating pool, the strategic sleeve is held outside the nightly pool and valued continuously across daytime and night.
        </p>

        <div className="p-3.5 bg-subtle/60 rounded-sm border border-border-subtle space-y-2">
          <span className="text-xs font-bold text-text-primary uppercase tracking-wide block">
            Mandatory Methodological & Fiduciary Disclosures
          </span>
          <ul className="list-disc list-inside text-xs text-text-secondary space-y-1.5 pl-1">
            <li>
              <strong>Realised Performance:</strong> Realised over this dataset's year; not a forecast.
            </li>
            <li>
              <strong>Expected Return Statement:</strong> Equity expected return of about 10% is stated in the problem brief, not in the dataset, and is not used in realised figures.
            </li>
            <li>
              <strong>In-Sample Presets:</strong> Presets are in-sample illustrations, not tuned.
            </li>
            <li>
              <strong>Capital Pool Separation:</strong> The sleeve is separate capital held outside the nightly pool; no dividends or transaction costs.
            </li>
            <li>
              <strong>Symmetric P&L Presentation:</strong> If a tier lost money, show the loss in the same way as a gain (explicit sign and label).
            </li>
            <li>
              <strong>Liquidation Haircuts:</strong> Emergency liquidation incurs statutory haircuts: 0.5% for Tier 1 repo, 2.0% for Tier 2 bonds, and 15.0% for Tier 3 equities.
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
};

export default MethodologyPage;
