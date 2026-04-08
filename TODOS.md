# TODOS

## Move Contracts

### VecMap last_placement grows unbounded
- **What:** `World.last_placement: VecMap<address, u64>` never shrinks. Every unique address that places a tile adds a permanent entry.
- **Why:** VecMap operations are O(n). At hundreds of unique addresses, `place_tile` gas costs increase significantly. At thousands, may exceed gas limits.
- **Context:** Can't change World struct layout in a compatible upgrade. Options: (1) add a cleanup function that prunes old entries, (2) ignore last_placement in a new `place_tile_v2` that uses a different rate-limit mechanism (dynamic fields per epoch).
- **Blocked by:** Nothing. Can be done anytime.
- **Priority:** Medium. Not urgent at current scale (<100 addresses).

### World shared object contention at scale
- **What:** World is a shared object. `place_tile`, `agent_defend`, and `pulse` all mutate it. On Sui, shared objects require consensus ordering.
- **Why:** At high throughput (many users placing tiles + agent defending + crank pulsing), transactions queue up waiting for consensus on the World object.
- **Context:** Mitigation options: sharding into Region objects, owned-object-merge-on-pulse pattern, or batching. This is a Stage 3+ concern.
- **Blocked by:** Stage 2 completion.
- **Priority:** Low. Not an issue at <100 worlds with <100 users each.

### Agent key backup/recovery
- **What:** Agent keypairs stored in localStorage are fragile. Lost key = orphaned AgentCap = must deploy new agent.
- **Why:** No revocation mechanism exists. AgentCap is owned by the agent address. If that key is lost, the cap is inaccessible.
- **Context:** Options: (1) add `revoke_agent` function that WorldOwner can call to destroy Agent + mark world as agent-free, (2) encrypted key backup to Walrus, (3) social recovery via a guardian address.
- **Blocked by:** Stage 2 agent module (PR 3).
- **Priority:** Medium. Important for UX, not blocking for testnet.
