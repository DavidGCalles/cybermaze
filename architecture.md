# Documento de Arquitectura: Cybermaze V2 (Local Stack)

## 1. Alcance y objetivo principal

Este documento define la arquitectura técnica y la estrategia de ejecución para la migración de Cybermaze. El objetivo es transicionar el prototipo funcional actual (monolito de navegador con renderizado Canvas) hacia una arquitectura de microservicios contenerizada mediante Docker.

El sistema adoptará una topología cliente‑servidor autoritativa, desacoplando la lógica de estado y físicas de la capa de presentación. Esto garantiza un entorno sin desincronizaciones, persistencia de datos y renderizado de alto rendimiento.

## 2. Topología del sistema

El entorno local se orquestará con `docker compose`, dividiendo la carga en cuatro servicios dedicados:

- **`cybermaze-db` (PostgreSQL)**: Capa de persistencia. Fuente de la verdad estática para esquemas de mapas, arquetipos de entidades y variables de entorno del juego.
- **`cybermaze-crud` (API)**: Servicio de gestión de datos. Expone la información de la base de datos mediante endpoints y aísla al motor de simulación de consultas pesadas.
- **`cybermaze-sim` (Motor de simulación)**: Servidor headless (sin renderizado). Procesa el bucle de tiempo real (tick rate), resuelve físicas (colisiones, pathfinding), gestiona el estado de los jugadores y emite el estado del mundo.
- **`cybermaze-front` (Frontend Pixi.js)**: Cliente de renderizado "tonto". Consume el estado emitido por la simulación vía WebSocket y lo dibuja en WebGL aplicando post‑procesado vectorial (filtros Bloom/Glow).

## 3. Estrategia de implementación — Fase 1 (Walking Skeleton)

Para mitigar riesgos de integración, la migración comenzará con un MVP llamado **Hangar Diegético**. Esta fase establecerá un canal de comunicación completo desde la base de datos hasta el renderizado visual, probando la infraestructura con la mínima lógica de juego necesaria.

### 3.1 Flujo de arranque y ejecución del MVP

La arquitectura exige que la persistencia participe desde el primer milisegundo, evitando hardcodeos en el motor de simulación. El flujo será:

1. (Ongoing) **Seed inicial (DB)**: Al levantar la infraestructura, PostgreSQL se inicializa con un registro que contiene el esquema matricial del mapa del Hangar.
2. **Bloqueo de simulación (Sim & CRUD)**: `cybermaze-sim` arranca con acceso de jugadores cerrado. Realiza una petición HTTP a `cybermaze-crud` para obtener el esquema del Hangar. Una vez parseado en memoria, el motor abre el WebSocket.
3. **Ingesta de input (backend)**: Los jugadores se conectan; los comandos del gamepad viajan al servidor, donde el motor calcula el movimiento y resuelve colisiones contra el mapa en memoria.
4. **Emisión de estado (network)**: En cada ciclo (p. ej. 30 Hz), el servidor empaqueta las coordenadas exactas de las entidades y las emite a los clientes.
5. **Renderizado (frontend)**: Pixi.js recibe el payload, actualiza las posiciones de los avatares vectoriales y renderiza la escena.
6. **Transición de estado**: Al posicionarse un jugador en un trigger físico del Hangar y pulsar el botón de confirmación, el servidor aplica el cambio de estado global de la partida.

### 3.2 Contrato de red base (World State Payload)

Para permitir desarrollo paralelo del motor y el frontend, el estado emitido por el WebSocket tendrá inicialmente la siguiente estructura JSON:

```json
{
  "tick": 10245,
  "state": "HANGAR_READY",
  "entities": {
    "players": [
      {
        "id": "p_01",
        "x": 450.5,
        "y": 320.0,
        "angle": 1.57,
        "color": "#00ffff"
      }
    ]
  }
}
```

## 4. Fases de expansión futuras

Superada la Fase 1, la tubería se ampliará secuencialmente para portar la lógica del prototipo original:

- **Fase 2 — Migración táctica**: Traslado de la IA (FSM), sistemas de pathfinding (A*) y gestión de proyectiles al servidor autoritativo. El payload de red se ampliará para incluir enemigos y balas.
- **Fase 3 — Renderizado dinámico**: Implementación de interpolación lineal (LERP) en el frontend Pixi.js para suavizar el movimiento entre ticks del servidor.
- **Fase 4 — Gestión de niveles**: Ampliación del esquema de la base de datos para almacenar múltiples mapas (Operaciones, Supervivencia) configurables vía CRUD en tiempo de ejecución.

## 5. Deprecación del legacy

El código base actual (`cybermazeJS`) entra en congelación. Las lógicas matemáticas puras se extraerán y adaptarán al servidor; las dependencias del DOM (Canvas API, `requestAnimationFrame`) se descartarán.