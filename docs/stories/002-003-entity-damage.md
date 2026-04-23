### Story 002-003: Entity Damage & Static Target Dummy
* **Objective:** Validate bullet-to-entity hit registration and state propagation.
* **Details:** Instantiate a new static, brainless `Player` entity (the Dummy) in the center of the Hangar. Implement radial collision detection between active bullets and the Dummy. Upon impact, reduce the Dummy's HP and despawn the bullet.
* **Validation:** Players can shoot the Dummy; the client accurately renders the HP bar decreasing until the entity is marked as dead.