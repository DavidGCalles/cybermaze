# cybermaze-crud (FastAPI)

Lightweight CRUD service that exposes map data from the `cybermaze-db` Postgres instance.

How it picks DB connection:
- Prefers `DATABASE_URL` environment variable (DSN).
- Falls back to `POSTGRES_HOST`/`POSTGRES_PORT`/`POSTGRES_DB`/`POSTGRES_USER`/`POSTGRES_PASSWORD` or `PG*` vars.

Docker (recommended)
- The repo provides a `docker-compose.yml` that builds this service and injects `.env`.
- From the project root run:

```powershell
docker compose up -d --build
```

Local development
- Create a venv and install deps:

```bash
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt    # Windows: .venv\Scripts\pip
```
- Set `DATABASE_URL` (or the POSTGRES_* vars) and run uvicorn:

```bash
# Example (PowerShell):
$env:DATABASE_URL = 'postgresql://cyber:cyberpass@cybermaze-db:5432/cybermaze'
python -m uvicorn main:app --host 0.0.0.0 --port 3000
```

Behavior
- On startup the service validates the DB connection and will fail early if it cannot reach Postgres.
- Endpoint: `GET /maps/{slug}` — returns the map object (JSON) or 404 when not found.

Quick test

```bash
curl http://localhost:3000/maps/hangar
```

Debugging
- View service logs:

```powershell
docker compose logs cybermaze_crud --follow
```

