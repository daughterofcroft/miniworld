module miniworld::world_registry {
    use sui::table::{Self, Table};
    use sui::package::UpgradeCap;
    use sui::event;

    // ── Structs ──

    /// One-time ticket created during module init. Consumed by create_registry
    /// to guarantee the registry can only be created once.
    public struct RegistryTicket has key, store {
        id: UID,
    }

    /// The shared registry object that tracks all worlds.
    public struct WorldRegistry has key {
        id: UID,
        worlds: Table<u64, ID>,
        count: u64,
    }

    // ── Events ──

    public struct WorldRegistryCreated has copy, drop {
        registry_id: ID,
    }

    // ── Init ──

    /// Module initializer: creates a single RegistryTicket and transfers it
    /// to the publisher. This ticket is consumed by create_registry, ensuring
    /// the registry can only be created once.
    fun init(ctx: &mut TxContext) {
        transfer::transfer(
            RegistryTicket { id: object::new(ctx) },
            ctx.sender(),
        );
    }

    // ── Entry functions ──

    /// Create the WorldRegistry. Requires the one-time RegistryTicket (from
    /// module init) and a reference to the package UpgradeCap for authorization.
    /// The ticket is consumed, preventing double-creation.
    public fun create_registry(
        ticket: RegistryTicket,
        _cap: &UpgradeCap,
        ctx: &mut TxContext,
    ) {
        let RegistryTicket { id } = ticket;
        object::delete(id);

        let registry = WorldRegistry {
            id: object::new(ctx),
            worlds: table::new(ctx),
            count: 0,
        };

        event::emit(WorldRegistryCreated { registry_id: object::id(&registry) });
        transfer::share_object(registry);
    }

    /// Register a world in the registry.
    public fun register_world(
        registry: &mut WorldRegistry,
        world_id: ID,
    ) {
        let idx = registry.count;
        table::add(&mut registry.worlds, idx, world_id);
        registry.count = idx + 1;
    }

    // ── Public accessors ──

    public fun world_count(registry: &WorldRegistry): u64 { registry.count }

    public fun world_at(registry: &WorldRegistry, index: u64): ID {
        *table::borrow(&registry.worlds, index)
    }

    // ── Test helpers ──

    #[test_only]
    public fun test_init(ctx: &mut TxContext) {
        init(ctx);
    }
}
