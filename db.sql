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
            "#..........#..TT..#..........#",
            "#..........#......#..........#",
            "#...........##..##...........#",
            "#............#..#............#",
            "#............#..#............#",
            "#............#..#............#",
            "#............................#",
            "#..####................####..#",
            "#..#T....................T#..#",
            "#..####.......1........####..#",
            "#............#..#............#",
            "#............#TT#............#",
            "#............####............#",
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

-- Controllers table: records physical controller identifiers and last seen
CREATE TABLE IF NOT EXISTS controllers (
    controller_id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255),
    guid VARCHAR(255),
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Players table: persistent player profiles tied to a controller
CREATE TABLE IF NOT EXISTS players (
    id SERIAL PRIMARY KEY,
    controller_id VARCHAR(255) NOT NULL REFERENCES controllers(controller_id) ON DELETE CASCADE,
    neon_color VARCHAR(32) NOT NULL,
    stats JSONB NOT NULL DEFAULT ('{}')::jsonb,
    level INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Table to define interactive trigger zones on the maps
CREATE TABLE map_triggers (
    id SERIAL PRIMARY KEY,
    map_slug VARCHAR NOT NULL,
    cell_c INTEGER NOT NULL,
    cell_r INTEGER NOT NULL,

    -- Activation Block (The "How")
    activation_mode VARCHAR NOT NULL CHECK (activation_mode IN ('TIME_HOLD', 'BUTTON_EDGE')),
    activation_threshold INTEGER NOT NULL,

    -- Behavior Block (The "What")
    behavior_type VARCHAR NOT NULL,
    payload JSONB,

    UNIQUE(map_slug, cell_c, cell_r)
);

-- Example Data for the Hangar MVP
INSERT INTO map_triggers (map_slug, cell_c, cell_r, activation_mode, activation_threshold, behavior_type, payload) VALUES
-- Terminals (Button Press)
('hangar', 14, 1, 'BUTTON_EDGE', 0, 'CHANGE_PHASE', '{"target_phase": "IN_GAME"}'),
('hangar', 15, 1, 'BUTTON_EDGE', 0, 'CHANGE_PHASE', '{"target_phase": "IN_GAME"}'),
('hangar', 4, 9, 'BUTTON_EDGE', 0, 'CHANGE_PHASE', '{"target_phase": "IN_GAME"}'),
('hangar', 25, 9, 'BUTTON_EDGE', 0, 'CHANGE_PHASE', '{"target_phase": "IN_GAME"}'),
-- Pits (Time Hold)
('hangar', 14, 12, 'TIME_HOLD', 180, 'EQUIP_LOADOUT', '{"neon_color": "#00ffff"}'),
('hangar', 15, 12, 'TIME_HOLD', 180, 'EQUIP_LOADOUT', '{"neon_color": "#ff00ff"}');