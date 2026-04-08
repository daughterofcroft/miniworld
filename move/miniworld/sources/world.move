module miniworld::world {
    use sui::vec_map::{Self, VecMap};
    use sui::dynamic_field as df;
    use miniworld::events;
    use miniworld::world_registry::{Self, WorldRegistry};

    // ── Error codes ──
    const EInvalidCoordinate: u64 = 0;
    const ERateLimited: u64 = 1;
    const ENotPulseOperator: u64 = 2;
    const EAlreadyOwned: u64 = 3;

    // ── Constants ──
    const GRID_SIZE: u8 = 32;

    // ── Structs ──

    /// Dynamic field key for world ownership. Stored on World objects.
    public struct WorldOwner has copy, drop, store {}

    /// Dynamic field key marking a world as having an agent. Value is the Agent's ID.
    public struct AgentDeployed has copy, drop, store {}

    /// A tile on the grid. Alive cells have Some(Tile), dead cells have None.
    public struct Tile has store, drop, copy {
        tile_type: u8,
        owner: address,
    }

    /// Capability required to call pulse(). Non-transferable (key only, no store).
    public struct PulseCap has key {
        id: UID,
        world_id: ID,
    }

    /// The shared world object.
    public struct World has key {
        id: UID,
        epoch: u64,
        width: u8,
        height: u8,
        grid: vector<Option<Tile>>,
        last_placement: VecMap<address, u64>,
    }

    // ── Entry functions ──

    /// Create a new world and its PulseCap. The World is shared, the PulseCap
    /// is transferred to the caller (the crank operator).
    public fun create_world(ctx: &mut TxContext) {
        let mut grid = vector[];
        let total = (GRID_SIZE as u64) * (GRID_SIZE as u64);
        let mut i: u64 = 0;
        while (i < total) {
            vector::push_back(&mut grid, option::none<Tile>());
            i = i + 1;
        };

        let world = World {
            id: object::new(ctx),
            epoch: 0,
            width: GRID_SIZE,
            height: GRID_SIZE,
            grid,
            last_placement: vec_map::empty(),
        };
        let world_id = object::id(&world);
        let cap = PulseCap {
            id: object::new(ctx),
            world_id,
        };
        transfer::share_object(world);
        transfer::transfer(cap, ctx.sender());
    }

    /// Place a tile at (x, y). Rate limited: 1 per address per world epoch (UX guard).
    /// Overwrites existing tiles.
    public fun place_tile(
        world: &mut World,
        x: u8,
        y: u8,
        tile_type: u8,
        ctx: &mut TxContext,
    ) {
        assert!(x < world.width && y < world.height, EInvalidCoordinate);

        let sender = ctx.sender();

        // Rate limit check (UX guard, not security)
        if (vec_map::contains(&world.last_placement, &sender)) {
            let last = vec_map::get(&world.last_placement, &sender);
            assert!(*last < world.epoch, ERateLimited);
            vec_map::remove(&mut world.last_placement, &sender);
        };
        vec_map::insert(&mut world.last_placement, sender, world.epoch);

        let idx = coord_to_index(x, y, world.width);
        let cell = vector::borrow_mut(&mut world.grid, idx);
        let previous_owner = if (option::is_some(cell)) {
            let old_tile = option::borrow(cell);
            option::some(old_tile.owner)
        } else {
            option::none()
        };

        *cell = option::some(Tile { tile_type, owner: sender });

        events::emit_tile_placed(x, y, tile_type, sender, world.epoch, previous_owner);
    }

    /// Execute a world pulse. Requires PulseCap.
    /// Runs the Game of Life rule, then increments the epoch.
    public fun pulse(
        world: &mut World,
        cap: &PulseCap,
        _ctx: &mut TxContext,
    ) {
        assert!(object::id(world) == cap.world_id, ENotPulseOperator);

        let (births, deaths) = gol_tick(&mut world.grid, world.width as u64, world.height as u64);

        world.epoch = world.epoch + 1;

        let mut alive_count: u16 = 0;
        let len = vector::length(&world.grid);
        let mut i: u64 = 0;
        while (i < len) {
            if (option::is_some(vector::borrow(&world.grid, i))) {
                alive_count = alive_count + 1;
            };
            i = i + 1;
        };

        events::emit_pulse_executed(world.epoch, births, deaths, alive_count);
    }

    /// Create a new world, register it in the WorldRegistry, and set the caller as owner.
    /// This is the Stage 2 replacement for create_world.
    public fun create_world_v2(
        registry: &mut WorldRegistry,
        ctx: &mut TxContext,
    ) {
        let mut grid = vector[];
        let total = (GRID_SIZE as u64) * (GRID_SIZE as u64);
        let mut i: u64 = 0;
        while (i < total) {
            vector::push_back(&mut grid, option::none<Tile>());
            i = i + 1;
        };

        let mut world = World {
            id: object::new(ctx),
            epoch: 0,
            width: GRID_SIZE,
            height: GRID_SIZE,
            grid,
            last_placement: vec_map::empty(),
        };

        // Set ownership via dynamic field
        df::add(&mut world.id, WorldOwner {}, ctx.sender());

        let world_id = object::id(&world);

        // Register in WorldRegistry
        world_registry::register_world(registry, world_id);

        let cap = PulseCap {
            id: object::new(ctx),
            world_id,
        };

        transfer::share_object(world);
        transfer::transfer(cap, ctx.sender());
    }

    /// Claim ownership of a world that has no owner set (for Stage 1 worlds).
    /// First-come-first-served. Only succeeds if no WorldOwner dynamic field exists.
    public fun claim_world_owner(
        world: &mut World,
        ctx: &mut TxContext,
    ) {
        assert!(!df::exists_(&world.id, WorldOwner {}), EAlreadyOwned);
        df::add(&mut world.id, WorldOwner {}, ctx.sender());
    }

    /// Read the owner of a world. Returns the owner address.
    /// Aborts if no owner is set.
    public fun world_owner(world: &World): address {
        *df::borrow(&world.id, WorldOwner {})
    }

    /// Check if a world has an owner.
    public fun has_owner(world: &World): bool {
        df::exists_(&world.id, WorldOwner {})
    }

    // ── Agent helpers ──

    /// Check if this world has an agent deployed (via AgentDeployed dynamic field).
    public fun has_agent(world: &World): bool {
        df::exists_<AgentDeployed>(&world.id, AgentDeployed {})
    }

    /// Mark this world as having an agent deployed. Stores the agent's ID.
    public fun set_agent_deployed(world: &mut World, agent_id: ID) {
        df::add(&mut world.id, AgentDeployed {}, agent_id);
    }

    /// Get the deployed agent's ID for this world.
    public fun agent_id(world: &World): ID {
        *df::borrow<AgentDeployed, ID>(&world.id, AgentDeployed {})
    }

    /// Clear the AgentDeployed dynamic field on a world. Package-private.
    public(package) fun clear_agent_deployed(world: &mut World) {
        if (df::exists_<AgentDeployed>(&world.id, AgentDeployed {})) {
            df::remove<AgentDeployed, ID>(&mut world.id, AgentDeployed {});
        };
    }

    // ── Public accessors ──

    public fun tile_owner(tile: &Tile): address { tile.owner }
    public fun tile_type(tile: &Tile): u8 { tile.tile_type }
    public fun world_epoch(world: &World): u64 { world.epoch }
    public fun world_width(world: &World): u8 { world.width }
    public fun world_height(world: &World): u8 { world.height }

    // ── Accessors for agent_actions module ──

    /// Check if the cell at grid index `idx` is alive.
    public fun is_cell_alive(world: &World, idx: u64): bool {
        option::is_some(vector::borrow(&world.grid, idx))
    }

    /// Borrow the grid for neighbor counting.
    public fun borrow_grid(world: &World): &vector<Option<Tile>> {
        &world.grid
    }

    /// Public wrapper for neighbor counting. New function (not modifying existing private fn).
    public fun count_neighbors(
        grid: &vector<Option<Tile>>,
        x: u64, y: u64, w: u64, h: u64,
    ): u8 {
        gol_count_neighbors(grid, x, y, w, h)
    }

    /// Public wrapper for coordinate conversion.
    public fun to_index(x: u8, y: u8, width: u8): u64 {
        coord_to_index(x, y, width)
    }

    // ── Game of Life logic (inline to avoid circular dependency) ──

    /// Conway B3/S23 with toroidal wrapping.
    /// Two-phase: scan to collect births/deaths, then apply.
    fun gol_tick(
        grid: &mut vector<Option<Tile>>,
        w: u64,
        h: u64,
    ): (u16, u16) {
        let mut births: vector<u64> = vector[];
        let mut deaths: vector<u64> = vector[];

        let total = w * h;
        let mut idx: u64 = 0;
        while (idx < total) {
            let x = idx % w;
            let y = idx / w;
            let neighbors = gol_count_neighbors(grid, x, y, w, h);
            let alive = option::is_some(vector::borrow(grid, idx));

            if (alive) {
                if (neighbors < 2 || neighbors > 3) {
                    vector::push_back(&mut deaths, idx);
                };
            } else {
                if (neighbors == 3) {
                    vector::push_back(&mut births, idx);
                };
            };

            idx = idx + 1;
        };

        let birth_count = vector::length(&births) as u16;
        let death_count = vector::length(&deaths) as u16;

        // Apply deaths
        let mut i: u64 = 0;
        while (i < (death_count as u64)) {
            let key = *vector::borrow(&deaths, i);
            *vector::borrow_mut(grid, key) = option::none();
            i = i + 1;
        };

        // Apply births — system-owned tiles (0x0), type 1
        i = 0;
        while (i < (birth_count as u64)) {
            let key = *vector::borrow(&births, i);
            *vector::borrow_mut(grid, key) = option::some(Tile { tile_type: 1, owner: @0x0 });
            i = i + 1;
        };

        (birth_count, death_count)
    }

    /// Count alive neighbors with toroidal wrapping.
    fun gol_count_neighbors(
        grid: &vector<Option<Tile>>,
        x: u64,
        y: u64,
        w: u64,
        h: u64,
    ): u8 {
        let mut count: u8 = 0;
        let mut dy: u64 = 0;
        while (dy < 3) {
            let mut dx: u64 = 0;
            while (dx < 3) {
                if (dy == 1 && dx == 1) {
                    dx = dx + 1;
                    continue
                };
                let nx = (x + dx + w - 1) % w;
                let ny = (y + dy + h - 1) % h;
                let nidx = ny * w + nx;
                if (option::is_some(vector::borrow(grid, nidx))) {
                    count = count + 1;
                };
                dx = dx + 1;
            };
            dy = dy + 1;
        };

        count
    }

    // ── Helpers ──

    fun coord_to_index(x: u8, y: u8, width: u8): u64 {
        (y as u64) * (width as u64) + (x as u64)
    }
}
