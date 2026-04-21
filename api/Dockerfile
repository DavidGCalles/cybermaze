FROM python:3.12-slim

WORKDIR /app

# Keep image minimal: install only pip deps (psycopg[binary] provides prebuilt wheels)
COPY requirements.txt ./

RUN python -m pip install --upgrade pip setuptools wheel \
	&& python -m pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . /app

EXPOSE 3000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3000"]
