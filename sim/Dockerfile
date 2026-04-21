FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /usr/src/sim

# Install minimal packages and pip
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY . .

CMD ["python", "main.py"]
