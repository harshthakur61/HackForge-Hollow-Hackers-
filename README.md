# Reserve Juggler

Autonomous treasury and reserve management engine for digital banking liquidity optimization.

## Step 1: Project Setup and Data Layer

### Prerequisites
- Docker & Docker Compose
- Python 3.11+

### Quickstart Commands

1. **Environment Configuration**
   ```bash
   cp .env.example .env
   ```

2. **Start PostgreSQL Database**
   ```bash
   docker compose up -d
   ```
   Wait until the database is healthy:
   ```bash
   docker compose ps
   ```

3. **Set Up Python Virtual Environment**
   ```bash
   python3.11 -m venv .venv
   source .venv/bin/activate
   pip install --upgrade pip
   pip install -r engine/requirements.txt
   ```

4. **Validate and Load Market Data**
   Run the data validation and bulk-loading script:
   ```bash
   python engine/scripts/load_csv.py
   ```

5. **Verify Database Records**
   Run the verification query inside PostgreSQL:
   ```bash
   docker compose exec -T postgres psql -U juggler -d treasury -c "SELECT count(*), min(ts), max(ts) FROM market_data;"
   ```
