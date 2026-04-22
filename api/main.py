import os
import random
import json
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


@app.get("/health")
async def health_check():
    """Simple health check endpoint to confirm the API is running."""
    # It can be expanded later to check DB connectivity etc.
    return {"status": "ok"}


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


async def upsert_controller_record(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Insert or update a controller record using controller identifier(s) present in payload."""
    global pool
    if pool is None:
        raise RuntimeError("DB pool is not initialized")

    # Try common keys used by Nexus payloads
    cid = None
    for key in ("id", "controllerId", "controller", "gamepadId", "device", "guid"):
        if key in payload:
            cid = str(payload[key])
            break
    if cid is None:
        raise HTTPException(status_code=400, detail="missing controller identifier")

    name = payload.get("name")
    guid = payload.get("guid") or payload.get("guid")

    await pool.execute(
        """
        INSERT INTO controllers (controller_id, name, guid, last_seen)
        VALUES ($1, $2, $3, now())
        ON CONFLICT (controller_id) DO UPDATE
        SET name = EXCLUDED.name, guid = EXCLUDED.guid, last_seen = now()
        """,
        cid,
        name,
        guid,
    )

    return {"controller_id": cid, "name": name, "guid": guid}


async def get_or_create_player_for_controller(controller_id: str) -> Dict[str, Any]:
    """Return player row for controller_id, creating a default profile if missing."""
    global pool
    if pool is None:
        raise RuntimeError("DB pool is not initialized")

    row = await pool.fetchrow(
        "SELECT id, controller_id, neon_color, stats, level, created_at FROM players WHERE controller_id = $1",
        controller_id,
    )
    if row:
        return {
            "id": row["id"],
            "controller_id": row["controller_id"],
            "neon_color": row["neon_color"],
            "stats": row["stats"],
            "level": row["level"],
            "created_at": row["created_at"],
        }

    # Create default player
    color = f"#{random.randint(0, 0xFFFFFF):06x}"
    stats = {}
    level = 1
    await pool.execute(
        "INSERT INTO players (controller_id, neon_color, stats, level) VALUES ($1, $2, $3::jsonb, $4)",
        controller_id,
        color,
        json.dumps(stats),
        level,
    )

    row = await pool.fetchrow(
        "SELECT id, controller_id, neon_color, stats, level, created_at FROM players WHERE controller_id = $1",
        controller_id,
    )
    return {
        "id": row["id"],
        "controller_id": row["controller_id"],
        "neon_color": row["neon_color"],
        "stats": row["stats"],
        "level": row["level"],
        "created_at": row["created_at"],
    }


@app.post("/controllers")
async def post_controller(payload: Dict[str, Any]):
    try:
        res = await upsert_controller_record(payload)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return res


@app.get("/players/by-controller/{controller_id}")
async def get_player_by_controller(controller_id: str):
    try:
        player = await get_or_create_player_for_controller(controller_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return player


@app.get("/map_triggers/by-slug/{slug}")
async def get_map_triggers(slug: str):
    """Fetch all trigger rules for a given map slug."""
    global pool
    if pool is None:
        raise HTTPException(status_code=500, detail="DB pool not initialized")
    
    rows = await pool.fetch(
        "SELECT * FROM map_triggers WHERE map_slug = $1", slug
    )
    
    return [dict(row) for row in rows]


from pydantic import BaseModel

# Pydantic models for player data updates
class PlayerUpdate(BaseModel):
    neon_color: Optional[str] = None
    stats: Optional[Dict[str, Any]] = None
    level: Optional[int] = None

class PlayerFull(BaseModel):
    neon_color: str
    stats: Dict[str, Any]
    level: int

@app.get("/players/{player_id}")
async def get_player(player_id: int):
    """Fetch a single player by their unique ID."""
    global pool
    if pool is None:
        raise HTTPException(status_code=500, detail="DB pool not initialized")
    
    row = await pool.fetchrow("SELECT id, controller_id, neon_color, stats, level FROM players WHERE id = $1", player_id)
    if not row:
        raise HTTPException(status_code=404, detail="Player not found")
    return dict(row)


@app.put("/players/{player_id}")
async def update_player(player_id: int, player: PlayerFull):
    """Replace a player's data entirely."""
    global pool
    if pool is None:
        raise HTTPException(status_code=500, detail="DB pool not initialized")

    try:
        updated_row = await pool.fetchrow(
            """
            UPDATE players
            SET neon_color = $1, stats = $2::jsonb, level = $3
            WHERE id = $4
            RETURNING id, controller_id, neon_color, stats, level
            """,
            player.neon_color, json.dumps(player.stats), player.level, player_id
        )
        if not updated_row:
            raise HTTPException(status_code=404, detail="Player not found")
        return dict(updated_row)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.patch("/players/{player_id}")
async def patch_player(player_id: int, player: PlayerUpdate):
    """Partially update a player's data, with atomic JSON merging for stats."""
    global pool
    if pool is None:
        raise HTTPException(status_code=500, detail="DB pool not initialized")

    # Get only the fields that were actually sent in the payload
    update_data = player.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="At least one field must be provided for update")

    # Dynamically build the SET clause
    set_clauses = []
    values = []
    i = 1
    for key, value in update_data.items():
        if key == 'stats' and isinstance(value, dict):
            # For stats, merge the new JSON with the existing one
            set_clauses.append(f"stats = stats || ${i}::jsonb")
            values.append(json.dumps(value))
        else:
            set_clauses.append(f"{key} = ${i}")
            values.append(value)
        i += 1

    # Add player_id to the end of the values list for the WHERE clause
    values.append(player_id)
    
    query = f"UPDATE players SET {', '.join(set_clauses)} WHERE id = ${i} RETURNING id, controller_id, neon_color, stats, level"
    
    try:
        updated_row = await pool.fetchrow(query, *values)
        if not updated_row:
            raise HTTPException(status_code=404, detail="Player not found")
        return dict(updated_row)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=3000, log_level="info")
