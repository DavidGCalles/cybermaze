import math
from typing import Any


def _get_player_inputs(controller_event: dict[str, Any], deadzone: float):
    """Extracts player inputs from a controller event, applying a deadzone."""
    if not isinstance(controller_event, dict):
        axes = {}
    else:
        evt = controller_event.get("event") if isinstance(controller_event.get("event"), dict) else controller_event
        axes = evt.get("axes", {}) if isinstance(evt, dict) else {}

    lx = float(axes.get("lx", 0))
    ly = float(axes.get("ly", 0))
    rx = float(axes.get("rx", 0))
    ry = float(axes.get("ry", 0))

    raw_lx = lx if abs(lx) > deadzone else 0.0
    raw_ly = -ly if abs(ly) > deadzone else 0.0
    aim_x = rx if abs(rx) > deadzone else 0.0
    aim_y = -ry if abs(ry) > deadzone else 0.0

    return raw_lx, raw_ly, aim_x, aim_y


def _calculate_new_position(player: dict[str, Any], players_list: list, grid, speed: float,
                            radius_px: float, raw_lx: float, raw_ly: float):
    """Calculates the new position after wall and player collisions."""
    dx = raw_lx * speed
    dy = raw_ly * speed

    # Start with current position
    final_x, final_y = player["x"], player["y"]

    # --- Resolve X-axis ---
    next_x = final_x + dx
    if not grid.check_collision(next_x, final_y, radius_px):
        collides_with_player = False
        for other in players_list:
            if other["id"] == player["id"]:
                continue
            if (next_x - other["x"])**2 + (final_y - other["y"])**2 < (radius_px * 2)**2:
                collides_with_player = True
                break
        if not collides_with_player:
            final_x = next_x

    # --- Resolve Y-axis ---
    next_y = final_y + dy
    if not grid.check_collision(final_x, next_y, radius_px):  # Use updated X for Y check
        collides_with_player = False
        for other in players_list:
            if other["id"] == player["id"]:
                continue
            if (final_x - other["x"])**2 + (next_y - other["y"])**2 < (radius_px * 2)**2:
                collides_with_player = True
                break
        if not collides_with_player:
            final_y = next_y

    return final_x, final_y


def _calculate_new_angle(current_angle: float, aim_x: float, aim_y: float, raw_lx: float, raw_ly: float):
    """Calculates the new angle based on aim or movement vectors."""
    if abs(aim_x) > 0.0 or abs(aim_y) > 0.0:
        return math.atan2(aim_y, aim_x)
    elif raw_lx != 0.0 or raw_ly != 0.0:
        return math.atan2(raw_ly, raw_lx)
    return current_angle  # No change


def process_player_movements(world: dict[str, Any], controllers: dict[str, Any], instantiated_players: set,
                             grid, speed: float, radius_px: float, deadzone: float = 0.1):
    """
    Update player positions and angles based on controller inputs.
    - world: the world state dict containing entities.players list
    - controllers: latest controller events buffer (controller_id -> event dict wrapper)
    - instantiated_players: set of controller ids that have a player instantiated
    - grid: server-side Grid instance with check_collision(x,y,radius)
    - speed: pixels per tick base speed
    - radius_px: player collision radius in pixels
    - deadzone: joystick deadzone threshold
    """
    players_list = world.get("entities", {}).get("players", [])

    for cid in list(instantiated_players):
        pid = f"p_{cid}"
        player = next((p for p in players_list if p.get("id") == pid), None)
        if not player:
            continue

        controller_event = controllers.get(cid, {})
        raw_lx, raw_ly, aim_x, aim_y = _get_player_inputs(controller_event, deadzone)

        final_x, final_y = _calculate_new_position(
            player, players_list, grid, speed, radius_px, raw_lx, raw_ly
        )

        player["x"] = final_x
        player["y"] = final_y

        player["angle"] = _calculate_new_angle(
            player["angle"], aim_x, aim_y, raw_lx, raw_ly
        )

    return
