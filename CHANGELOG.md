# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0.0] - 2026-04-08

Stage 3: PvP Arena + PULSE Economy. Raids, yield tokens, prediction overlay, and multi-world infrastructure.

### Added
- **PULSE token.** New Sui Coin type (separate package). Alive tiles mint PULSE each pulse. Instability-based yield: stable tiles earn 1, at-risk tiles earn 3, tiles near raiders earn 4. Anti-self-farming: no bonus from your own raiders.
- **Raids.** Place hostile tiles (type=2) on other worlds. Burns 100 PULSE. Rate limited 1/epoch. Requires an agent deployed on your world. Raider tiles follow normal GoL rules.
- **5 tiles per epoch.** `place_tile_v2` with dynamic field rate limiting replaces the 1-tile limit.
- **PulsePool batched yield.** PULSE accumulates in a shared pool (no coin fragmentation). Users claim when ready.
- **Agent revocation.** World owners can revoke agents (marks as zombie, clears deployment slot for new agent).
- **Access control.** `RegistryCap` guards world registration. `HarvestCap` gates PULSE minting.
- **GoL prediction overlay.** Client-side neighbor counting color-codes every tile: green (safe), yellow (at-risk), red (doomed), blue (birth). Always on.
- **Multi-tile batch placement.** Select up to 5 cells, place all in one PTB.
- **PULSE balance display.** Header shows accumulated + claimed PULSE. "Claim" button withdraws from pool.
- **Raid UI.** Target selection mode, 100 PULSE cost, raid log showing recent attacks.
- **Leaderboard.** World list sorted by alive count with rank badges.
- **"While you were away" banner.** Shows epoch delta and tile changes since last visit.
- **Agent personality.** Strategy display names (Guardian, Sentinel, etc.) and hex-based nicknames.
- **Multi-world crank.** Single process pulses + harvests N worlds via `worlds.json`. Round-robin scheduling. Crash recovery with disk-persisted manifests.
- **Multi-agent runner.** Single process defends N agents via `agents.json`. Raid detection boosts defense priority near hostile tiles.
- **Shared crank library.** Walrus helpers, world state reader, and GoL neighbor counting extracted to `crank/lib/`.
- **`create_world_v3`.** Creates world + registers + sets owner + credits 100 PULSE bootstrap + creates HarvestCap.

### Changed
- Default pulse interval reduced to 15 seconds (was 60s).
- PULSE package deployed as separate Sui package (required for `coin::create_currency` OTW pattern, since `ban_entry_init` blocks `init` during upgrades).

## [0.2.0.0] - 2026-04-08

Stage 2: Agent Playground. Multi-world support, agent objects, and Walrus agent memory.

### Added
- **Multi-world support.** WorldRegistry tracks all worlds via paginated Table. `create_world_v2` creates worlds with ownership and registry integration. Any user can create their own world.
- **Agent objects.** Deploy a Guardian agent on your world. Agent (shared object) + AgentCap (owned by agent-runner keypair). One agent per world, enforced on-chain.
- **Agent defense.** `agent_defend` validates tiles are at risk using GoL neighbor counting, rate-limited to 1 action per epoch. On-chain validation prevents wasted actions.
- **Guardian agent runtime.** Off-chain TypeScript runner (`crank/agent-runner.ts`) reads world state, identifies at-risk tiles, prioritizes user tiles over system tiles, submits defense transactions.
- **Walrus agent memory.** Agent observations logged to Walrus after each epoch. Manifest pattern (same as grid snapshots) for indexed retrieval.
- **Frontend: world list page.** Browse all worlds, see epoch and alive count, create new worlds. Paginated registry reads via `getDynamicFields`.
- **Frontend: agent panel.** Deploy agent with mandatory key download, view agent stats (tiles defended, last action), low-gas warning when balance < 0.1 SUI, activity feed from Walrus observations.
- **Frontend routing.** react-router HashRouter with `/#/worlds` and `/#/world/:id` routes.
- **World ownership.** Dynamic field `WorldOwner` on World objects. `claim_world_owner` for Stage 1 world (batched in upgrade PTB to prevent front-running).
- **Package upgrade.** Upgraded existing package via UpgradeCap (policy 0). New modules added without breaking Stage 1 compatibility.
- **Vitest test infrastructure.** Frontend test framework with jsdom and testing-library.
- **TODOS.md** tracking known tech debt (VecMap growth, shared object contention, key recovery).

### Changed
- `gol_count_neighbors` and `coord_to_index` remain private. New public wrapper functions (`count_neighbors`, `to_index`) expose them for cross-module access.
- Sui CLI upgraded 1.58.2 → 1.69.1.

## [0.1.0.0] - 2026-03-30

Stage 1: Core protocol. 32x32 Game of Life grid on Sui with Walrus snapshots.
