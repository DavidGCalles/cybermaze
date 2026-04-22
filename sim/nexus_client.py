import asyncio
import json
import time
import websockets


async def run_nexus_client(latest_inputs: dict, uri: str):
    """Connect to NexusController WebSocket and update latest_inputs in-memory buffer.

    latest_inputs is a dict modified in-place by this coroutine. Keys are controller ids
    and values are the last-received event (with a timestamp).
    """
    reconnect_delay = 1.0
    while True:
        try:
            async with websockets.connect(uri) as ws:
                print(f"[NEXUS] Connected to {uri}")
                reconnect_delay = 1.0
                async for msg in ws:
                    ts = time.time()
                    try:
                        data = json.loads(msg)
                    except Exception:
                        # Not JSON, keep raw
                        data = msg

                    # Try to determine controller id
                    cid = None
                    if isinstance(data, dict):
                        for key in ("id", "controllerId", "controller", "gamepadId", "device"):
                            if key in data:
                                cid = str(data[key])
                                break

                    if cid is None:
                        cid = "unknown"

                    # Store the event with a timestamp
                    latest_inputs[cid] = {"ts": ts, "event": data}

                    # Print the event flow to console (DoD requirement)
                    #print(f"[NEXUS][{cid}] {data}")

        except asyncio.CancelledError:
            print("[NEXUS] Cancelled, shutting down Nexus client")
            raise
        except Exception as e:
            print(f"[NEXUS] Connection error: {e}. Reconnecting in {reconnect_delay}s")
            await asyncio.sleep(reconnect_delay)
            # Exponential backoff capped at 10s
            reconnect_delay = min(reconnect_delay * 2, 10.0)
