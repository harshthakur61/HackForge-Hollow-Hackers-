CREATE TABLE IF NOT EXISTS forecasts (
    night_date DATE NOT NULL,
    model TEXT NOT NULL,
    quantile NUMERIC NOT NULL,
    buffer_usd NUMERIC NOT NULL,
    actual_required_usd NUMERIC NOT NULL,
    PRIMARY KEY (night_date, model, quantile)
);
