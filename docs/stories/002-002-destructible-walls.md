### Story 002-002: Destructible Walls & State Deltas
* **Objective:** Decouple the map from the tick payload and implement environmental mutation.
* **Details:** 1. Remove `world["map"]` from the broadcast state. 
  2. Implement an initial handshake where the client fetches/receives the full map array once.
  3. Modify physics: when a bullet hits a destructible wall (`2`), change the grid value to floor (`0`), and inject a `{"event": "WALL_DESTROYED", "r": Y, "c": X}` delta into the next tick.
  4. Update `pixiRenderer.js` to listen for this delta and surgically remove the targeted wall graphic.
* **Validation:** Shooting a yellow wall destroys it permanently; the client updates locally without a framerate drop.