# Miniworld

A base-layer world-building protocol on Sui. Composable tiles, modular rules, programmable agents, and world pulses that evolve shared state over time. Sui holds the authoritative world state, Walrus holds all world data.

## What is this?

Miniworld defines a shared on-chain world model where:

- **Tiles** are stateful Sui objects that snap together into worlds
- **World pulses** (epoch ticks) apply transparent rules to evolve the world
- **Rules** are modular (Game of Life ships as the reference rule)
- **Agents** defend worlds autonomously, paying their own gas
- **Walrus** stores snapshots, agent observations, and hosts the frontend

The reference implementation is a 32x32 persistent grid world on Sui testnet. Users place tiles, a crank triggers pulses every 60 seconds, and Conway's Game of Life rules evolve the grid. Guardian agents identify at-risk tiles and defend them.

## Current status

**Stage 2: Agent Playground** (complete)

- Multi-world support with WorldRegistry (paginated)
- Agent objects on-chain (Agent + AgentCap, one per world)
- Guardian agent runtime defending at-risk tiles
- Walrus agent memory (observation logs + manifests)
- Frontend with world list, agent panel, deploy flow
- Package upgraded via UpgradeCap on Sui testnet
- 26 passing Move tests

## Tech stack

- **On-chain:** Sui Move (world model, tiles, agents, Game of Life, WorldRegistry)
- **Frontend:** React + TypeScript + Vite + react-router + @mysten/dapp-kit
- **Crank:** Node.js TypeScript (pulse execution + Walrus snapshots)
- **Agent:** Node.js TypeScript (Guardian strategy + Walrus observation logging)
- **Storage:** Walrus (grid snapshots, agent observations, manifests)

## Project structure

```
miniworld/
  move/miniworld/              Sui Move smart contracts
    sources/
      world.move               World, Tile, PulseCap, GoL, place_tile, pulse, agent_defend helpers
      events.move              TilePlaced, PulseExecuted events
      agent.move               Agent, AgentCap, deploy_agent
      agent_actions.move       agent_defend with GoL at-risk validation
      world_registry.move      WorldRegistry (Table<u64, ID>), create_registry
    tests/
      world_tests.move         9 core tests (creation, placement, pulse, GoL)
      world_v2_tests.move      4 tests (create_world_v2, ownership, claim)
      registry_tests.move      3 tests (registry creation, registration)
      agent_tests.move         4 tests (deploy, ownership, one-per-world)
      agent_defend_tests.move  6 tests (defend, rate limit, wrong cap/world)
  crank/
    pulse-crank.ts             Pulse execution + Walrus snapshots
    agent-runner.ts            Guardian agent runtime + Walrus observations
    seed-world.ts              Seed classic GoL patterns (parallel temp addresses)
    .env.example               Crank configuration template
    .env.agent.example         Agent runner configuration template
  src/                         React frontend
    pages/
      WorldList.tsx            Browse worlds, create new worlds
      WorldView.tsx            Grid view + agent panel + timeline
    components/
      WorldGrid.tsx            32x32 CSS grid renderer
      TilePlacer.tsx           Wallet-based tile placement
      AgentPanel.tsx           Agent stats, activity feed, low-gas warning
      DeployAgent.tsx          Keypair generation + deploy flow
      Header.tsx               Shared header with logo + wallet
      Timeline.tsx             Walrus snapshot timeline slider
    hooks/
      useWorldState.ts         Reads World object from Sui
      useWorldRegistry.ts      Reads WorldRegistry Table via getDynamicFields
      useAgentState.ts         Reads Agent object + balance
      useAgentMemory.ts        Fetches agent observations from Walrus
      useWalrusSnapshots.ts    Fetches grid snapshots from Walrus
    constants.ts               Deployment IDs (package, world, registry)
    networkConfig.ts           Sui network configuration
```

## Quick start

### Prerequisites

- [Sui CLI](https://docs.sui.io/build/install) configured for testnet
- [pnpm](https://pnpm.io/) for package management
- A Sui testnet wallet with SUI tokens (get from [faucet](https://faucet.sui.io))

### 1. Install dependencies

```bash
pnpm install
cd crank && pnpm install
```

### 2. Start the frontend

```bash
pnpm dev
```

Open `http://localhost:5173`. The world list shows all registered worlds. Click a world to view its grid, connect your wallet to place tiles.

### 3. Start the crank (enables world pulses)

```bash
cp crank/.env.example crank/.env
# Edit crank/.env with your deployment IDs and keypair
cd crank
pnpm crank
```

The crank calls `pulse()` every 60 seconds, applying Game of Life rules. Every 10th pulse, a snapshot is written to Walrus.

### 4. Seed the world with life

Place classic Game of Life patterns using temporary parallel addresses (all tiles land in one epoch so patterns form correctly):

```bash
cd crank
pnpm seed              # All patterns: glider, block, blinker, r-pentomino, beacon, LWSS
pnpm seed glider block # Just specific patterns
```

Available patterns:
- **glider** (5 cells) — travels diagonally
- **block** (4 cells) — 2x2 still life, survives forever
- **blinker** (3 cells) — oscillator, toggles every pulse
- **rpentomino** (5 cells) — explodes into chaos
- **beacon** (6 cells) — period-2 oscillator
- **lwss** (9 cells) — lightweight spaceship

The seed script funds temporary addresses and places all tiles in the same epoch (3 transactions total, regardless of tile count).

### 5. Deploy and run a Guardian agent

Deploy an agent on your world via the frontend ("Deploy Agent" button on a world you own) or via CLI:

```bash
sui client call \
  --package <PACKAGE_ID> \
  --module agent \
  --function deploy_agent \
  --args <WORLD_ID> <AGENT_ADDRESS> 0 \
  --gas-budget 50000000
```

Fund the agent address with SUI, then run the agent:

```bash
cp crank/.env.agent.example crank/.env.agent
# Edit with Agent ID, AgentCap ID, and agent secret key
cd crank
pnpm agent
```

The Guardian agent scans for at-risk tiles (GoL neighbors < 2 or > 3), prioritizes user-placed tiles, and submits `agent_defend` transactions. Observations are logged to Walrus.

## How it works

1. **Place tiles:** Connect your Sui wallet and click cells on the grid. Each placement is an on-chain transaction.
2. **Pulse:** The crank triggers `pulse()` every 60 seconds. Conway's Game of Life rules run: cells with 2-3 neighbors survive, dead cells with exactly 3 neighbors are born, everything else dies. The grid wraps toroidally.
3. **Defend:** The Guardian agent identifies tiles that will die next pulse and records defense actions on-chain. Rate limited to 1 action per agent per epoch.
4. **Snapshot:** Every 10th pulse, the grid state is stored as a Walrus blob. The timeline slider lets you scrub through history.
5. **Observe:** After each epoch, the agent writes an observation blob to Walrus with its analysis and decision.

## Architecture

```
Layer 0: World Model
  World (shared) + Tile (vector<Option<Tile>>) + WorldRegistry (Table<u64, ID>)
  PulseCap (pulse auth) + WorldOwner (dynamic field) + AgentDeployed (dynamic field)

Layer 1: Rules
  Game of Life (B3/S23, toroidal wrapping, inlined in world.move)

Layer 2: Agents
  Agent (shared) + AgentCap (owned by agent address)
  agent_defend: validates tile at risk via count_neighbors, rate limited 1/epoch

Layer 3: Crank + Agent Runner
  pulse-crank.ts: pulse execution + Walrus snapshots + manifest
  agent-runner.ts: Guardian strategy + defense TXs + Walrus observations

Layer 4: Frontend
  React + react-router: world list, grid view, agent panel, deploy flow, timeline
```

## Testnet deployment

| Object | ID |
|--------|----|
| Package (v2) | `0xc8b03ba5060dc3b978c174657a0995236a375dd353248a4ba7986ab09c296bb6` |
| Package (v1) | `0xce66738c41ff68af01c7f80742961eae543e05cec3a04058f8e3be2494b2a2ad` |
| WorldRegistry | `0x45875f8b8cf7edb73ce4543dbba80e4ab59deb3b1ac95c1b1bc8bd68dcaf5497` |
| World (Stage 1) | `0x56c424dad3307eab2d028f9d7f02970efc8afc0583ff9f712874acdd0a5419e2` |
| PulseCap | `0x71dec4d10ef6b87c3e617c13f4398966937e3a0791ee30099d98131e2f458d21` |
| UpgradeCap | `0xca86f3e9d5af2ff33e8966a7eae57e8e95f11b163903a6426cc3975460dbe068` |

## Running tests

```bash
cd move/miniworld
sui move test    # 26 Move tests

cd ../..
pnpm test        # Vitest frontend tests
```

## Roadmap

| Stage | Milestone | Status |
|-------|-----------|--------|
| 1 | Living Grid — 32x32 GoL, Walrus snapshots, React frontend | Complete |
| 2 | Agent Playground — multi-world, Guardian agents, Walrus memory | Complete |
| 3 | Worlds at War — cross-world agents, attack/defend, game balance | Up next |
| 4 | Explorer + Adoption — Walrus Sites, starter kit, third-party onboarding | Planned |

## License

[Business Source License 1.1](LICENSE)

You can use Miniworld to build and operate worlds, games, and simulations. You cannot use it to create a competing world-building protocol. Converts to Apache 2.0 on 2030-04-02.
