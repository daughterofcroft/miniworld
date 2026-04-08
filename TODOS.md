# TODOS

## Stage 3 (PvP Arena + PULSE Economy)

### Multi-world crank
- **What:** Refactor `pulse-crank.ts` and `agent-runner.ts` to pulse/defend N worlds in a round-robin loop from a single process.
- **Why:** One process per world doesn't scale. At 10 worlds that's 10 Node processes.
- **Context:** Read world configs from a JSON file or query WorldRegistry on startup. Same for agent-runner.
- **Priority:** P1. Required before mainnet launch with multiple worlds.

### Access control on register_world / set_agent_deployed
- **What:** Add guarded v2 versions (`register_world_v2` requiring RegistryCap, `set_agent_deployed_v2` requiring WorldOwner proof). Old `public` versions can't be removed but are deprecated.
- **Why:** Current `public` functions can be called by any external package, allowing spoofed agent deployment or fake world registration.
- **Context:** Compatible upgrade constraint means old functions persist. Frontend/crank only uses new guarded versions.
- **Priority:** P1. Security gap. Fix before mainnet.

### place_tile / place_tile_v2 coexistence
- **What:** Document that old `place_tile` (1/epoch) is deprecated. Frontend only exposes `place_tile_v2` (5/epoch). Accept the edge case that someone calling both in the same epoch gets 6 placements.
- **Why:** Can't remove old `place_tile` in compatible upgrade. Rate limits use separate state (VecMap vs dynamic field).
- **Context:** Not worth a complex guard for a 1-tile edge case. Document and move on.
- **Priority:** P2. Document during Stage 3 implementation.

### Walrus manifest crash recovery
- **What:** Publish manifest every 10 observations (not every 100 pulses). Persist manifest blob ID to disk (`~/.miniworld/manifest-{worldId}.txt`) on every publish.
- **Why:** Current in-memory manifest is lost on crash. Can lose up to 25 minutes of history at 15-second epochs.
- **Context:** Affects both pulse-crank (grid snapshots) and agent-runner (observations).
- **Priority:** P2. Fix during Stage 3 crank refactor.

## Stage 3.5 (World Garden — conditional on engagement)

### Canvas-based grid renderer
- **What:** Replace CSS Grid with HTML Canvas for smooth animations between pulses (tiles fade in/out, glow, pulse).
- **Why:** CSS Grid updates are instant and static. Canvas enables the "hypnotic" visual feel that makes cellular automata mesmerizing.
- **Blocked by:** Stage 3 engagement signals (users coming back, raids happening).
- **Priority:** P2. Only build if PvP proves fun.

### AI-generated tile art on zoom
- **What:** Click/zoom into a tile to see an AI-generated landscape. Each tile becomes a tiny window into a generated world.
- **Why:** The fractal world insight. Emotionally differentiating. Nobody else has this.
- **Context:** Latency concern: if generation takes >2 seconds, it breaks the flow. May need pre-generation or caching. Consider Sui-native AI inference or off-chain generation with Walrus storage.
- **Blocked by:** Canvas renderer (need zoom interaction first).
- **Priority:** P3. The "whoa" feature, but only after core gameplay is proven.

### Sound design
- **What:** Ambient audio, pulse tick sound, raid alert, agent defense notification.
- **Why:** Audio feedback makes the world feel alive between pulses.
- **Blocked by:** Canvas renderer (audio should sync with visual transitions).
- **Priority:** P3.

## Stage 4 (Platform + Digital Property)

### Items-on-tiles (NFT containers)
- **What:** Tiles hold NFT objects as dynamic fields. Zoom in to see items. Items can be decorations (visual-only), boosters (2x PULSE yield), or shields (tile survives one extra death).
- **Why:** Transforms tiles from pixels into property. Defense and raiding become economically meaningful.
- **Context:** tile_type system (0=user, 1=system, 2=raider) extends to type=3 for asset-bearing tiles. WorldOwner dynamic field pattern is the foundation for per-tile ownership.
- **Blocked by:** PULSE economy proven (items cost PULSE to place).
- **Priority:** P2.

### Agent-initiated raids
- **What:** Agents can attack other worlds, not just defend their own.
- **Why:** Full "Worlds at War" vision. Agents serve humans offensively AND defensively.
- **Context:** Requires cross-world state reading (agent reads target world via Sui RPC or Walrus). Game balance: attack budget per agent per epoch, cost in PULSE.
- **Blocked by:** PvP raid mechanic proven fun (Stage 3).
- **Priority:** P2.

### On-chain kill tracking
- **What:** Replace off-chain death counter with on-chain kill attribution during pulse.
- **Why:** On-chain verifiable kills enable trustless leaderboards and PULSE rewards for kills.
- **Context:** Requires `pulse_v2` that wraps existing `pulse` + kill counting. Increases gas cost per pulse. Only worth it if PvP engagement justifies the cost.
- **Blocked by:** Off-chain death counter proven useful (Stage 3).
- **Priority:** P3.

### Starter kit (Apache 2.0)
- **What:** Template repo for deploying custom worlds with GoL/custom physics, PULSE yield, agent defense, Walrus memory.
- **Why:** Miniworld becomes "the world deployment kit for Sui." Third-party worlds grow the ecosystem. Network effects via global PULSE.
- **Context:** Different rule sets (not just GoL), different grid sizes, custom tile types, pluggable agent strategies. Miniworld provides infrastructure (WorldRegistry, PULSE, agent marketplace), developers provide the game.
- **Blocked by:** PULSE economy + agent marketplace proven on mainnet.
- **Priority:** P2. This is the platform play.

### Walrus Sites frontend hosting
- **What:** Deploy the React frontend to Walrus Sites instead of localhost.
- **Why:** Decentralized hosting. Users access Miniworld via a Walrus URL, no local dev server needed.
- **Context:** Walrus Sites hosting is available on testnet. Needs CORS handling for Sui RPC calls.
- **Blocked by:** Frontend stable enough for public access.
- **Priority:** P2.

### Cross-world agent marketplace
- **What:** Agents from any world (including third-party starter kit worlds) trade on the same marketplace.
- **Why:** Network effect. More worlds → more agents → more PULSE demand → more worlds.
- **Context:** AgentCap already has `key + store` (transferable). The marketplace needs to be world-agnostic (any AgentCap, any world).
- **Blocked by:** Starter kit shipping (Stage 4).
- **Priority:** P3.

### Crank gas funded by PULSE harvest
- **What:** Crank receives a small PULSE allocation per harvest as operational fee.
- **Why:** At 240 TXs/hour/world on mainnet, crank gas is ~0.24-1.2 SUI/hour/world. Needs sustainable funding.
- **Context:** Could be a % of minted PULSE (e.g., 5% of each harvest goes to crank address) or a flat PULSE-per-pulse fee.
- **Blocked by:** PULSE economy live on mainnet.
- **Priority:** P2.

### UpgradeCap governance
- **What:** Time-lock or governance-gate the UpgradeCap via a custom wrapper module.
- **Why:** Currently only the deployer wallet can upgrade. If the key is compromised, the package is compromised. Time-lock adds a delay. Governance-gate requires multi-sig or DAO approval.
- **Context:** For now, simple deployer ownership is sufficient. Governance matters when third-party worlds depend on the protocol.
- **Blocked by:** Third-party ecosystem (starter kit).
- **Priority:** P4.

## Ongoing Tech Debt

### VecMap last_placement grows unbounded
- **What:** `World.last_placement: VecMap<address, u64>` never shrinks. O(n) per `place_tile` call.
- **Why:** At hundreds of unique addresses, gas costs increase. At thousands, may exceed limits.
- **Context:** Can't change World struct. Options: cleanup function, or `place_tile_v2` uses dynamic fields for rate limiting (already planned). Once `place_tile_v2` ships, the old VecMap is only used by the deprecated `place_tile`.
- **Priority:** P3. Self-resolving when `place_tile_v2` ships.

### World shared object contention at scale
- **What:** place_tile, agent_defend, pulse, harvest all mutate the World shared object.
- **Why:** Sui shared objects require consensus ordering. High throughput = TX queuing.
- **Context:** Mitigation: sharding into Region objects, owned-object-merge-on-pulse, batching. Not an issue at <100 users per world.
- **Priority:** P4. Stage 4+ concern.

### Agent key backup/recovery
- **What:** Add `revoke_agent` function allowing WorldOwner to destroy Agent + clear AgentDeployed flag.
- **Why:** Lost agent keypair = orphaned AgentCap = must deploy new agent (but can't, one-agent-per-world). Revocation lets the owner recover.
- **Context:** Also needed for the hosted agent option (Stage 3 PMF fix) where the user's wallet signs agent actions directly.
- **Priority:** P1. Ship with Stage 3.

### No struct layout changes invariant
- **What:** All future data requirements use dynamic fields on existing objects. Never modify World, Tile, Agent, or WorldRegistry struct layouts.
- **Why:** Compatible Sui Move upgrades cannot change struct layouts. Dynamic fields are the universal extension mechanism.
- **Context:** Already used for WorldOwner, AgentDeployed. This is a permanent architectural constraint. Document in CLAUDE.md.
- **Priority:** Invariant. Not a task. A rule.

### PulseCap non-transferability
- **What:** PulseCap has `key` only (no `store`). Can't be transferred. If crank key is lost, the world can never be pulsed again.
- **Why:** No key rotation or recovery path for the crank operator.
- **Context:** Options: add `store` to PulseCap in a new version (PulseCap_v2), or make pulse permissionless (anyone can call it, remove cap requirement). Permissionless pulse is the cleanest Stage 4 solution (enables the starter kit).
- **Blocked by:** Nothing. Can be fixed anytime.
- **Priority:** P2. Fix before mainnet if possible.

## Completed

(none yet)
