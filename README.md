# Miniworld

A base-layer world-building protocol on Sui. Composable tiles, modular rules, programmable agents, and world pulses that evolve shared state over time. Sui holds the authoritative world state, Walrus holds all world data.

## What is this?

Miniworld defines a shared on-chain world model where:

- **Tiles** are stateful Sui objects that snap together into worlds
- **World pulses** (epoch ticks) apply transparent rules to evolve the world
- **Rules** are modular (Game of Life ships as the reference rule)
- **Agents** can act autonomously on epoch ticks (Stage 3)
- **Walrus** stores tile asset packs, snapshots, replays, and hosts the frontend

The reference implementation is a 32x32 persistent grid world on Sui testnet. Users place tiles, a crank triggers pulses every 60 seconds, and Conway's Game of Life rules evolve the grid. Walrus stores snapshots for timeline replay.

## Current status

**Stage 1: Living Grid** (complete)

- Move contracts deployed on Sui testnet
- 32x32 grid with Game of Life pulse evolution
- React frontend with wallet connection and tile placement
- Crank script with Walrus snapshot integration
- 9 passing Move tests

## Tech stack

- **On-chain:** Sui Move (world model, tiles, rules, PulseCap authorization)
- **Frontend:** React + TypeScript + Vite + @mysten/dapp-kit + Radix UI
- **Crank:** Node.js TypeScript script (pulse execution + Walrus snapshots)
- **Storage:** Walrus (snapshots, manifests, asset packs)

## Project structure

```
miniworld/
  move/miniworld/          Sui Move smart contracts
    sources/
      world.move           World, Tile, PulseCap, Game of Life, place_tile, pulse
      events.move          TilePlaced, PulseExecuted events
    tests/
      world_tests.move     9 tests covering creation, placement, pulse, GoL patterns
  crank/                   Pulse crank script
    pulse-crank.ts         Calls pulse() on interval, writes Walrus snapshots
    .env.example           Configuration template
  src/                     React frontend
    components/
      WorldGrid.tsx        32x32 CSS grid renderer
      TilePlacer.tsx       Wallet-based tile placement
      Timeline.tsx         Walrus snapshot timeline slider
    hooks/
      useWorldState.ts     Reads World object from Sui
      useWalrusSnapshots.ts  Fetches snapshots from Walrus
    App.tsx                Main app composing all components
    constants.ts           Deployment IDs
    networkConfig.ts       Sui network configuration
```

## Quick start

### Prerequisites

- [Sui CLI](https://docs.sui.io/build/install) configured for testnet
- [pnpm](https://pnpm.io/) for package management
- A Sui testnet wallet with SUI tokens (get from [faucet](https://faucet.sui.io))

### 1. Install dependencies

```bash
pnpm install
```

### 2. Deploy the Move package (or use existing testnet deployment)

The contracts are already deployed on testnet. If you want to deploy your own:

```bash
cd move/miniworld
sui move build
sui client publish --gas-budget 100000000
```

Then call `create_world` to spawn a new world:

```bash
sui client call \
  --package <PACKAGE_ID> \
  --module world \
  --function create_world \
  --gas-budget 100000000
```

Update `src/constants.ts` with the Package ID and World ID from the output.

### 3. Start the frontend

```bash
pnpm dev
```

Open `http://localhost:5173`, connect your Sui wallet, and place tiles on the grid.

### 4. Start the crank (optional, enables world pulses)

```bash
cp crank/.env.example crank/.env
# Edit crank/.env with your deployment IDs and keypair
cd crank
pnpm install
pnpm crank
```

The crank calls `pulse()` every 60 seconds, applying Game of Life rules to evolve the grid. Every 10th pulse, a snapshot is written to Walrus.

## How it works

1. **Place tiles:** Connect your Sui wallet and click cells on the grid. Each placement is an on-chain transaction.
2. **Pulse:** The crank triggers `pulse()` every 60 seconds. Conway's Game of Life rules run: cells with 2-3 neighbors survive, dead cells with exactly 3 neighbors are born, everything else dies. The grid wraps toroidally (edges connect).
3. **Snapshot:** Every 10th pulse, the crank serializes the grid state and stores it as a Walrus blob. The timeline slider lets you scrub through history.
4. **Rate limit:** 1 tile placement per address per pulse epoch (UX guard to prevent accidental spam).

## Architecture

```
Layer 0: World Model
  World (shared object) + Tile (vector<Option<Tile>>) + PulseCap (capability)

Layer 1: Rules
  Game of Life (B3/S23, toroidal wrapping, inlined in world.move)

Layer 2: Crank
  Node.js script: pulse execution + Walrus snapshot + manifest management

Layer 3: Frontend
  React + @mysten/dapp-kit: grid renderer, tile placement, timeline replay
```

## Testnet deployment

| Object | ID |
|--------|----|
| Package | `0xce66738c41ff68af01c7f80742961eae543e05cec3a04058f8e3be2494b2a2ad` |
| World | `0x56c424dad3307eab2d028f9d7f02970efc8afc0583ff9f712874acdd0a5419e2` |
| PulseCap | `0x71dec4d10ef6b87c3e617c13f4398966937e3a0791ee30099d98131e2f458d21` |

## Running tests

```bash
cd move/miniworld
sui move test
```

## Roadmap

- **Stage 1** (complete): Living Grid, 32x32 GoL, Walrus snapshots
- **Stage 2**: Discovery layer, fog of war, tile packs on Walrus
- **Stage 3**: Snapshots/replays pipeline, agent interface, world types
- **Stage 4**: Walrus Sites explorer, starter kit packaging, third-party onboarding

## License

MIT
