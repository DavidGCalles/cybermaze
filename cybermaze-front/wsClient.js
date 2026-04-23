// wsClient.js
// Small transport layer: connects to simulator and forwards payloads to the renderer API (CyberRenderer).

(function () {
  const wsHost = (location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? 'localhost' : 'cybermaze-sim';
  const WS_URL = `ws://${wsHost}:4000`;

  let socket = null;
  let reconnectDelay = 1000;

  function connect() {
    socket = new WebSocket(WS_URL);
    socket.addEventListener('open', () => {
      console.log('[WS] connected');
      reconnectDelay = 1000;
      if (window.CyberRenderer && typeof window.CyberRenderer.init === 'function') {
        try { window.CyberRenderer.init(); } catch (e) { console.warn('Renderer init failed', e); }
      }
    });

    socket.addEventListener('message', (ev) => {
      try {
        const payload = JSON.parse(ev.data);
        if (payload.type === 'INIT_MAP') {
          if (window.CyberRenderer && typeof window.CyberRenderer.setMap === 'function') {
            window.CyberRenderer.setMap(payload.map);
          }
        } else {
          if (window.CyberRenderer && typeof window.CyberRenderer.applyPayload === 'function') {
            window.CyberRenderer.applyPayload(payload);
          }
        }
      } catch (e) {
        console.error('Invalid payload', e);
      }
    });

    socket.addEventListener('close', () => {
      console.log('[WS] closed, reconnecting in', reconnectDelay);
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(10000, reconnectDelay * 1.5);
    });

    socket.addEventListener('error', (e) => {
      console.error('[WS] error', e);
      try { socket.close(); } catch (e) {}
    });
  }

  // Start
  connect();
})();
