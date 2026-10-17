CREATE TABLE IF NOT EXISTS decisions (
    night_date DATE NOT NULL,
    strategy TEXT NOT NULL,
    model TEXT NOT NULL,
    quantile_used NUMERIC NOT NULL,
    buffer_usd NUMERIC NOT NULL,
    sweep_usd NUMERIC NOT NULL,
    repo_apy NUMERIC NOT NULL,
    reason TEXT NOT NULL,
    interest NUMERIC NOT NULL,
    break_fee NUMERIC NOT NULL,
    overdraft_cost NUMERIC NOT NULL,
    net_pnl NUMERIC NOT NULL,
    PRIMARY KEY (night_date, strategy)
);
