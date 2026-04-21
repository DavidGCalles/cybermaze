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
