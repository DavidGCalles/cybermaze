import os
from typing import Any, Dict, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import asyncpg
from asyncpg.pool import Pool

# Build DSN from `DATABASE_URL` (preferred) or fall back to POSTGRES_* / PG* env vars
DB_DSN = os.getenv("DATABASE_URL")
if not DB_DSN:
    host = os.getenv("POSTGRES_HOST") or os.getenv("PGHOST", "localhost")
    port = os.getenv("POSTGRES_PORT") or os.getenv("PGPORT", "5432")
    name = os.getenv("POSTGRES_DB") or os.getenv("PGDATABASE", "postgres")
    user = os.getenv("POSTGRES_USER") or os.getenv("PGUSER", "postgres")
    password = os.getenv("POSTGRES_PASSWORD") or os.getenv("PGPASSWORD", "")
    DB_DSN = f"postgresql://{user}:{password}@{host}:{port}/{name}"

pool: Optional[Pool] = None


async def fetch_map_by_slug(slug: str) -> Optional[Dict[str, Any]]:
    global pool
    if pool is None:
        raise RuntimeError("DB pool is not initialized")
    row = await pool.fetchrow(
        "SELECT name, slug, layout, metadata FROM maps WHERE slug = $1", slug
    )
    if not row:
        return None
    return {
        "name": row["name"],
        "slug": row["slug"],
        "layout": row["layout"],
        "metadata": row["metadata"],
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create DB pool on startup and close on shutdown (fastapi lifespan)."""
    global pool
    pool = await asyncpg.create_pool(DB_DSN, min_size=1, max_size=5)
    # validate connection
    async with pool.acquire() as conn:
        await conn.execute("SELECT 1")
    try:
        yield
    finally:
        if pool is not None:
            await pool.close()
            pool = None


app = FastAPI(title="cybermaze-crud", lifespan=lifespan)

# Allow requests from local frontends / dev servers
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


async def fetch_simulation_parameters(name: str = "default") -> Optional[Dict[str, Any]]:
    global pool
    if pool is None:
        raise RuntimeError("DB pool is not initialized")
    row = await pool.fetchrow(
        "SELECT params FROM simulation_parameters WHERE name = $1 LIMIT 1",
        "default",
    )
    if not row:
        return None
    return row["params"]


@app.get("/maps/{slug}")
async def get_map(slug: str):
    try:
        m = await fetch_map_by_slug(slug)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    if m is None:
        raise HTTPException(status_code=404, detail="map not found")
    return m


@app.get("/params")
async def get_params():
    try:
        params = await fetch_simulation_parameters()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    if params is None:
        raise HTTPException(status_code=404, detail="simulation parameters not found")
    return params


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=3000, log_level="info")
