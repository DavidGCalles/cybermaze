-- db.sql: initialize maps table and insert HANGAR_MVP layout
-- This file is mounted at /docker-entrypoint-initdb.d/db.sql and
-- executed automatically on first-time PostgreSQL init.

CREATE TABLE IF NOT EXISTS maps (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    slug VARCHAR(255) NOT NULL UNIQUE,
    layout JSONB NOT NULL,
    metadata JSONB NOT NULL DEFAULT ('{}')::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Insert a minimal "Hangar" map using the legacy array-of-strings layout.
-- This layout is a closed hangar (walls '#' and floor '.') with a single
-- player spawn '1' and contains NO enemies or emitters.
INSERT INTO maps (name, slug, layout, metadata)
VALUES (
    'HANGAR_MVP',
    'hangar',
    (
        '[
            "##############################",
            "#............................#",
            "#............................#",
            "#............................#",
            "#............................#",
            "#............................#",
            "#............................#",
            "#..........1.................#",
            "#............................#",
            "#............................#",
            "#............................#",
            "#............................#",
            "#............................#",
            "#............................#",
            "##############################"
        ]'::jsonb
    ),
    (
        '{
            "cols": 30,
            "rows": 15
        }'::jsonb
    )
)
ON CONFLICT (name) DO NOTHING;

-- End of db.sql

-- Simulation / runtime parameters (single-row table with JSON blob)
CREATE TABLE IF NOT EXISTS simulation_parameters (
    id SERIAL PRIMARY KEY,
    name VARCHAR(128) NOT NULL UNIQUE,
    params JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Insert default runtime parameters used by the frontend and simulator
INSERT INTO simulation_parameters (name, params)
VALUES (
    'default',
    '{
        "cell_size": 16,
        "cols": 50,
        "rows": 50,
        "entity_ratios": {
            "PLAYER_SPEED": 0.09,
            "PLAYER_RADIUS": 0.35,
            "BULLET_SPEED": 0.5,
            "BULLET_RADIUS": 0.12,
            "ENEMY_SPEED": 0.03,
            "ENEMY_VISION": 14.0,
            "UI_BAR_WIDTH": 0.8,
            "UI_BAR_HEIGHT": 0.1,
            "UI_OFFSET": 0.5
        }
    }'::jsonb
)
ON CONFLICT (name) DO NOTHING;
