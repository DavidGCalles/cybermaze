import logging
import asyncio
import json
import time
import websockets

logger = logging.getLogger(__name__)


async def run_nexus_client(latest_inputs: dict, uri: str):
    """Connect to NexusController WebSocket and update latest_inputs in-memory buffer.

    latest_inputs is a dict modified in-place by this coroutine. Keys are controller ids
    and values are the last-received event (with a timestamp).
    """
    reconnect_delay = 1.0
    while True:
        try:
            async with websockets.connect(uri) as ws:
                logger.info(f"Connected to {uri}")
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
                    #logger.debug(f"[{cid}] {data}")

        except asyncio.CancelledError:
            logger.info("Cancelled, shutting down Nexus client")
            raise
        except Exception as e:
            logger.error(f"Connection error: {e}. Reconnecting in {reconnect_delay}s")
            await asyncio.sleep(reconnect_delay)
            # Exponential backoff capped at 10s
            reconnect_delay = min(reconnect_delay * 2, 10.0)
