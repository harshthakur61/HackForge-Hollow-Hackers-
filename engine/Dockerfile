FROM python:3.11-slim

# Install system dependencies including OpenMP library for XGBoost
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install
COPY engine/requirements.txt ./engine/requirements.txt
RUN pip install --no-cache-dir -r engine/requirements.txt

# Copy application source code
COPY . /app

ENV PYTHONPATH=/app
EXPOSE 8000

CMD ["uvicorn", "engine.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
