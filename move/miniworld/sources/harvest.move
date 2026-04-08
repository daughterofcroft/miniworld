module miniworld::harvest {
    use sui::event;
    use miniworld::world::{Self, World, Tile};
    use pulse::pulse::{Self, PulsePool, HarvestCap};

    // ── Error codes ──
    const EInvalidHarvestCap: u64 = 400;

    // ── Events ──
    public struct HarvestExecuted has copy, drop {
        world_id: ID,
        epoch: u64,
        total_yield: u64,
        tiles_credited: u64,
    }

    // ── Yield constants ──
    const YIELD_STABLE: u64 = 1;      // 2-3 neighbors, will survive
    const YIELD_AT_RISK: u64 = 3;     // <2 or >3 neighbors, will die
    const YIELD_NEAR_RAIDER: u64 = 4; // Adjacent to tile_type=2

    /// Harvest PULSE yield for all alive tiles in a world.
    /// Credits each tile owner's balance in the PulsePool.
    /// Called by the crank after each pulse.
    public fun harvest(
        world: &World,
        pool: &mut PulsePool,
        cap: &HarvestCap,
        _ctx: &mut TxContext,
    ) {
        // Validate HarvestCap matches this world
        assert!(pulse::harvest_cap_world_id(cap) == object::id(world), EInvalidHarvestCap);

        let grid = world::borrow_grid(world);
        let width = world::world_width(world) as u64;
        let height = world::world_height(world) as u64;
        let total = width * height;

        let mut total_yield: u64 = 0;
        let mut tiles_credited: u64 = 0;

        let mut idx: u64 = 0;
        while (idx < total) {
            if (world::is_cell_alive(world, idx)) {
                let x = idx % width;
                let y = idx / width;

                // Classify tile for yield
                let yield_amount = classify_tile_yield(grid, x, y, width, height);

                // Get tile owner
                let tile = option::borrow(vector::borrow(grid, idx));
                let owner = world::tile_owner(tile);

                // Don't yield to system tiles (type 1, owner @0x0)
                if (owner != @0x0) {
                    // Anti-self-farming: check if near-raider bonus is from a different owner
                    let effective_yield = if (yield_amount == YIELD_NEAR_RAIDER) {
                        // Check if the adjacent raider is from a different owner
                        if (has_different_owner_raider(grid, x, y, width, height, owner)) {
                            YIELD_NEAR_RAIDER
                        } else {
                            // Self-farming: downgrade to at-risk or stable
                            let neighbors = world::count_neighbors(grid, x, y, width, height);
                            if (neighbors < 2 || neighbors > 3) { YIELD_AT_RISK } else { YIELD_STABLE }
                        }
                    } else {
                        yield_amount
                    };

                    pulse::credit_pool(pool, owner, effective_yield);
                    total_yield = total_yield + effective_yield;
                    tiles_credited = tiles_credited + 1;
                };
            };
            idx = idx + 1;
        };

        event::emit(HarvestExecuted {
            world_id: object::id(world),
            epoch: world::world_epoch(world),
            total_yield,
            tiles_credited,
        });
    }

    // ── Internal helpers ──

    /// Classify a tile's yield based on instability.
    /// Categories are exclusive, highest wins:
    /// 1. Near raider (adjacent to tile_type=2): 4 PULSE
    /// 2. At risk (neighbors < 2 or > 3): 3 PULSE
    /// 3. Stable (neighbors 2-3): 1 PULSE
    fun classify_tile_yield(
        grid: &vector<Option<Tile>>,
        x: u64, y: u64, w: u64, h: u64,
    ): u64 {
        // Check for adjacent raider tiles (highest priority)
        if (has_adjacent_raider(grid, x, y, w, h)) {
            return YIELD_NEAR_RAIDER
        };

        // Check neighbor count for at-risk
        let neighbors = world::count_neighbors(grid, x, y, w, h);
        if (neighbors < 2 || neighbors > 3) {
            YIELD_AT_RISK
        } else {
            YIELD_STABLE
        }
    }

    /// Check if any adjacent cell contains a raider tile (tile_type=2).
    fun has_adjacent_raider(
        grid: &vector<Option<Tile>>,
        x: u64, y: u64, w: u64, h: u64,
    ): bool {
        let mut dy: u64 = 0;
        while (dy < 3) {
            let mut dx: u64 = 0;
            while (dx < 3) {
                if (dy == 1 && dx == 1) { dx = dx + 1; continue };
                let nx = (x + dx + w - 1) % w;
                let ny = (y + dy + h - 1) % h;
                let nidx = ny * w + nx;
                let cell = vector::borrow(grid, nidx);
                if (option::is_some(cell)) {
                    let tile = option::borrow(cell);
                    if (world::tile_type(tile) == 2) {
                        return true
                    };
                };
                dx = dx + 1;
            };
            dy = dy + 1;
        };
        false
    }

    /// Check if any adjacent raider tile has a DIFFERENT owner than the given owner.
    /// Used for anti-self-farming: you don't get 4x yield from your own raiders.
    fun has_different_owner_raider(
        grid: &vector<Option<Tile>>,
        x: u64, y: u64, w: u64, h: u64,
        tile_owner: address,
    ): bool {
        let mut dy: u64 = 0;
        while (dy < 3) {
            let mut dx: u64 = 0;
            while (dx < 3) {
                if (dy == 1 && dx == 1) { dx = dx + 1; continue };
                let nx = (x + dx + w - 1) % w;
                let ny = (y + dy + h - 1) % h;
                let nidx = ny * w + nx;
                let cell = vector::borrow(grid, nidx);
                if (option::is_some(cell)) {
                    let tile = option::borrow(cell);
                    if (world::tile_type(tile) == 2 && world::tile_owner(tile) != tile_owner) {
                        return true
                    };
                };
                dx = dx + 1;
            };
            dy = dy + 1;
        };
        false
    }
}
