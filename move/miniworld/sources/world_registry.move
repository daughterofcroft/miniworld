module miniworld::world_registry {
    use sui::table::{Self, Table};
    use sui::package::UpgradeCap;
    use sui::event;

    // ── Structs ──

    /// The shared registry object that tracks all worlds.
    public struct WorldRegistry has key {
        id: UID,
        worlds: Table<u64, ID>,
        count: u64,
    }

    /// Capability for guarded world registration.
    public struct RegistryCap has key, store {
        id: UID,
    }

    // ── Events ──

    public struct WorldRegistryCreated has copy, drop {
        registry_id: ID,
    }

    // ── Entry functions ──

    /// Create the WorldRegistry. Requires UpgradeCap for authorization.
    /// Should only be called once. If called again, creates a second registry
    /// (caller's responsibility to use the right one).
    public fun create_registry(
        _cap: &UpgradeCap,
        ctx: &mut TxContext,
    ) {
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

    /// Create a RegistryCap. UpgradeCap-gated (one-time setup).
    public fun create_registry_cap(
        _cap: &UpgradeCap,
        ctx: &mut TxContext,
    ): RegistryCap {
        RegistryCap { id: object::new(ctx) }
    }

    /// Register a world with RegistryCap authorization.
    public fun register_world_v2(
        registry: &mut WorldRegistry,
        _cap: &RegistryCap,
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
    public fun test_create_registry(ctx: &mut TxContext) {
        let registry = WorldRegistry {
            id: object::new(ctx),
            worlds: table::new(ctx),
            count: 0,
        };
        transfer::share_object(registry);
    }

    #[test_only]
    public fun test_create_registry_cap(ctx: &mut TxContext): RegistryCap {
        RegistryCap { id: object::new(ctx) }
    }
}
