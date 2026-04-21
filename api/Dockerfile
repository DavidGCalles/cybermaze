FROM python:3.12-slim

WORKDIR /app

# Keep image minimal: install curl for healthchecks, then pip deps
COPY requirements.txt ./

RUN apt-get update && apt-get install -y curl && \
    python -m pip install --upgrade pip setuptools wheel && \
	python -m pip install --no-cache-dir -r requirements.txt && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy application
COPY . /app

EXPOSE 3000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3000"]
