# Changelog

All notable changes to this project will be documented in this file.

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
