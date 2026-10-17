CREATE TABLE IF NOT EXISTS market_data (
    ts TIMESTAMP PRIMARY KEY NOT NULL,
    deposits_usd NUMERIC(16,2) NOT NULL,
    withdrawals_usd NUMERIC(16,2) NOT NULL,
    net_flow_usd NUMERIC(16,2) NOT NULL,
    repo_sweep_window_open BOOLEAN NOT NULL,
    repo_sweep_mature BOOLEAN NOT NULL,
    tier1_repo_rate_apy NUMERIC(8,4) NOT NULL,
    tier2_bond_yield_pct NUMERIC(8,4) NOT NULL,
    tier2_bond_price_index NUMERIC(12,4) NOT NULL,
    tier2_bond_mod_duration NUMERIC(8,4) NOT NULL,
    tier3_stock_index_price NUMERIC(12,4) NOT NULL,
    tier3_stock_volatility_pct NUMERIC(8,4) NOT NULL,
    tier1_early_redemption_haircut_pct NUMERIC(8,4) NOT NULL,
    tier2_bond_liquidation_haircut_pct NUMERIC(8,4) NOT NULL,
    tier3_stock_liquidation_haircut_pct NUMERIC(8,4) NOT NULL,
    emergency_overdraft_penalty_apr_pct NUMERIC(8,4) NOT NULL
);
