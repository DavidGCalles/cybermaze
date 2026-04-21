import os
import sys
import time
import asyncio
import json

import requests
import websockets

from map_parser import MapParser


def build_crud_url():
    url = os.getenv("SIM_URL")
    if not url:
        host = os.getenv("SIM_HOST", "cybermaze-crud")
        port = int(os.getenv("SIM_PORT", "3000"))
        url = f"http://{host}:{port}"
    return url


async def ws_handler(websocket, path):
    try:
        async for message in websocket:
            await websocket.send("ACK")
    except websockets.ConnectionClosed:
        return


def print_ascii_layout(layout_lines):
    print("[LOADED] Hangar layout:")
    for line in layout_lines:
        print(line)


def fail(msg, code=1):
    print(f"[ERROR] {msg}")
    sys.exit(code)


def main():
    crud_url = build_crud_url()
    slug = os.getenv("HANGAR_SLUG", "hangar")
    target = f"{crud_url}/maps/{slug}"

    print("[WAITING] Requesting Hangar layout...")
    try:
        resp = requests.get(target, timeout=10)
    except Exception as e:
        fail(f"Failed to contact CRUD at {target}: {e}")

    if resp.status_code != 200:
        fail(f"CRUD returned status {resp.status_code} when requesting {target}")

    try:
        body = resp.json()
    except Exception as e:
        fail(f"Invalid JSON response from CRUD: {e}")

    def extract_layout_from_body(body):
        layout = body.get("layout")

        # If the layout is a JSON-encoded string, decode it
        if isinstance(layout, str):
            try:
                decoded = json.loads(layout)
                layout = decoded
            except Exception:
                # fallback: splitlines (handles multi-line strings)
                lines = [l for l in layout.splitlines() if l.strip()]
                cleaned = [l.strip().strip('"') for l in lines]
                if cleaned:
                    layout = cleaned

        return layout

    layout = extract_layout_from_body(body)
    if not layout or not isinstance(layout, list):
        print(f"[DEBUG] Full CRUD response: {json.dumps(body)}")
        fail("No valid 'layout' array present in CRUD response")

    # Parse layout
    parser = MapParser()
    map_data = parser.parse(layout)

    # Print ASCII representation (original layout is already ASCII)
    print_ascii_layout(layout)

    # Start websocket server ONLY after successful parse
    ws_port = int(os.getenv("SIM_WS_PORT", "4000"))
    print(f"[READY] Parsed map successfully. Starting WebSocket server on port {ws_port}")

    async def run_server():
        async with websockets.serve(ws_handler, "0.0.0.0", ws_port):
            await asyncio.Future()  # run forever

    try:
        asyncio.run(run_server())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
