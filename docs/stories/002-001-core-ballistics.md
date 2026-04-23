### Story 002-001: Core Ballistics (Spawn, Travel, Despawn)
* **Objective:** Implement the `Bullet` entity lifecycle without mutating the map.
* **Details:** Update the engine to read shooting inputs (RT) and spawn projectiles based on the player's angle. Implement linear trajectory calculation in `physics.py`. Bullets must detect collisions against solid boundaries (`1` and `2`) and despawn gracefully.
* **Validation:** Players can shoot; bullets travel and disappear upon hitting any wall.