import logging
import asyncio
import json
import os
import websockets
import aiohttp
import nexus_client

logger = logging.getLogger(__name__)

class Network:
    def __init__(self, crud_url: str, ws_port: int, map_data: dict):
        self.crud_url = crud_url
        self.ws_port = ws_port
        self.clients = set()
        self.controllers = {}
        self.session = aiohttp.ClientSession()
        self.map_data = map_data

    async def close(self):
        await self.session.close()

    async def fetch_map_layout(self, slug: str):
        target = f"{self.crud_url}/maps/{slug}"
        try:
            async with self.session.get(target, timeout=10) as resp:
                if resp.status != 200:
                    return None, f"CRUD returned status {resp.status} when requesting {target}"
                return await resp.json(), None
        except aiohttp.ClientError as e:
            return None, f"Failed to contact CRUD at {target}: {e}"

    async def fetch_params(self):
        try:
            async with self.session.get(f"{self.crud_url}/params", timeout=3) as p_resp:
                if p_resp.status == 200:
                    data = await p_resp.json()
                    if isinstance(data, str):
                        try:
                            return json.loads(data)
                        except json.JSONDecodeError:
                            logger.warning("Failed to decode params string: %s", data)
                            return {}
                    return data
        except aiohttp.ClientError:
            return {}
        return {}

    async def fetch_map_triggers(self, map_slug: str):
        triggers_by_coord = {}
        try:
            url = f"{self.crud_url}/map_triggers/by-slug/{map_slug}"
            async with self.session.get(url, timeout=3) as resp:
                if resp.status == 200:
                    trigger_list = await resp.json()
                    for t in trigger_list:
                        triggers_by_coord[(t['cell_c'], t['cell_r'])] = t
                    logger.info("Loaded %s trigger(s) for '%s'", len(triggers_by_coord), map_slug)
                else:
                    logger.warning("Failed to get triggers for '%s', status: %s", map_slug, resp.status)
        except aiohttp.ClientError as e:
            logger.warning("Could not load triggers for map '%s': %s", map_slug, e)
        return triggers_by_coord

    async def upsert_controller(self, evt):
        try:
            async with self.session.post(f"{self.crud_url}/controllers", json=evt, timeout=3) as response:
                return response.status
        except aiohttp.ClientError as e:
            logger.error("upsert error: %s", e)
            return None

    async def update_player(self, player_id: int, payload: dict):
        try:
            async with self.session.patch(f"{self.crud_url}/players/{player_id}", json=payload, timeout=3) as response:
                return response.status, await response.json()
        except aiohttp.ClientError as e:
            logger.error("patch player error: %s", e)
            return None, None

    async def get_player_by_controller(self, controller_id: str):
        try:
            async with self.session.get(f"{self.crud_url}/players/by-controller/{controller_id}", timeout=5) as response:
                if response.status == 200:
                    return await response.json()
        except aiohttp.ClientError as e:
            logger.error("fetch/create player error: %s", e)
        return None

    async def _send_safe(self, ws, payload):
        try:
            await ws.send(payload)
        except websockets.ConnectionClosed:
            self.clients.discard(ws)
        except Exception:
            self.clients.discard(ws)

    async def broadcast(self, world_state: dict):
        payload = json.dumps(world_state)
        if self.clients:
            await asyncio.gather(*[self._send_safe(ws, payload) for ws in list(self.clients)])

    async def ws_handler(self, websocket):
        self.clients.add(websocket)
        try:
            initial_payload = {
                "type": "INIT_MAP",
                "map": self.map_data["map"]
            }
            await self._send_safe(websocket, json.dumps(initial_payload))
            await websocket.wait_closed()
        finally:
            self.clients.discard(websocket)

    async def run(self, game_loop):
        nexus_uri = os.getenv("NEXUS_WS_URI", "ws://host.docker.internal:8765")
        nexus_task = asyncio.create_task(nexus_client.run_nexus_client(self.controllers, nexus_uri))
        game_loop_task = asyncio.create_task(game_loop())

        async with websockets.serve(self.ws_handler, "0.0.0.0", self.ws_port):
            try:
                await asyncio.gather(nexus_task, game_loop_task)
            except asyncio.CancelledError:
                pass
            finally:
                nexus_task.cancel()
                game_loop_task.cancel()
