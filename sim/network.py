import asyncio
import json
import os
import websockets
import nexus_client

class Network:
    def __init__(self, ws_port: int):
        self.ws_port = ws_port
        self.clients = set()
        self.controllers = {}

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
