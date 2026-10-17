# Reserve Juggler: Python Policy Engine & API

FastAPI service (port 8000) providing policy decisions, night simulation traces, cumulative KPIs, and audit logs.

## Local Development

1. Activate virtual environment:
   ```bash
   source ../.venv/bin/activate
   ```
2. Start API service with hot reload:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```
   Or from repo root:
   ```bash
   uvicorn engine.app.main:app --reload --port 8000
   ```

## Running Tests

From repo root:
```bash
pytest engine/tests/
```
