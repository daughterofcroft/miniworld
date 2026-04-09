#[test_only]
module miniworld::harvest_tests {
    use sui::test_scenario;
    use miniworld::world::{Self, World};
    use miniworld::world_registry::{Self, WorldRegistry};
    use miniworld::harvest;
    use pulse::pulse::{Self, PulsePool, HarvestCap};

    const ADMIN: address = @0xAD;
    const USER1: address = @0x1;
    const USER2: address = @0x2;

    // ── Helpers ──

    fun setup_registry(scenario: &mut test_scenario::Scenario) {
        test_scenario::next_tx(scenario, ADMIN);
        {
            world_registry::test_create_registry(test_scenario::ctx(scenario));
        };
    }

    fun setup_pulse(scenario: &mut test_scenario::Scenario) {
        test_scenario::next_tx(scenario, ADMIN);
        {
            pulse::test_init(test_scenario::ctx(scenario));
        };
    }

    /// Create a world via create_world_v2 and return its ID.
    fun create_world(scenario: &mut test_scenario::Scenario, creator: address): ID {
        test_scenario::next_tx(scenario, creator);
        {
            let mut registry = test_scenario::take_shared<WorldRegistry>(scenario);
            world::create_world_v2(&mut registry, test_scenario::ctx(scenario));
            test_scenario::return_shared(registry);
        };
        test_scenario::next_tx(scenario, creator);
        option::destroy_some(test_scenario::most_recent_id_shared<World>())
    }

    /// Create a HarvestCap for a world and transfer it to ADMIN.
    fun create_harvest_cap(scenario: &mut test_scenario::Scenario, world_id: ID) {
        test_scenario::next_tx(scenario, ADMIN);
        {
            let cap = pulse::create_harvest_cap(world_id, test_scenario::ctx(scenario));
            pulse::transfer_harvest_cap(cap, ADMIN);
        };
    }

    // ── Tests ──

    #[test]
    /// 2x2 block at (0,0)-(1,1). Each cell has 3 neighbors = stable. Each yields 1 PULSE.
    fun test_harvest_stable_tiles() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup_registry(&mut scenario);
        setup_pulse(&mut scenario);

        let world_id = create_world(&mut scenario, USER1);
        create_harvest_cap(&mut scenario, world_id);

        // Place a 2x2 block owned by USER1 (tile_type=0, normal tiles)
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut world = test_scenario::take_shared_by_id<World>(&scenario, world_id);
            world::test_place_tile(&mut world, 0, 0, 0, USER1);
            world::test_place_tile(&mut world, 1, 0, 0, USER1);
            world::test_place_tile(&mut world, 0, 1, 0, USER1);
            world::test_place_tile(&mut world, 1, 1, 0, USER1);
            test_scenario::return_shared(world);
        };

        // Run harvest
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let world = test_scenario::take_shared_by_id<World>(&scenario, world_id);
            let mut pool = test_scenario::take_shared<PulsePool>(&scenario);
            let cap = test_scenario::take_from_sender<HarvestCap>(&scenario);

            harvest::harvest(&world, &mut pool, &cap, test_scenario::ctx(&mut scenario));

            // 4 stable tiles * 1 PULSE each = 4 PULSE
            assert!(pulse::pool_balance(&pool, USER1) == 4);

            test_scenario::return_shared(world);
            test_scenario::return_shared(pool);
            test_scenario::return_to_sender(&scenario, cap);
        };

        test_scenario::end(scenario);
    }

    #[test]
    /// Isolated tile (0 neighbors) = at-risk. Yields 3 PULSE.
    fun test_harvest_at_risk_tiles() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup_registry(&mut scenario);
        setup_pulse(&mut scenario);

        let world_id = create_world(&mut scenario, USER1);
        create_harvest_cap(&mut scenario, world_id);

        // Place a single isolated tile
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut world = test_scenario::take_shared_by_id<World>(&scenario, world_id);
            world::test_place_tile(&mut world, 15, 15, 0, USER1);
            test_scenario::return_shared(world);
        };

        // Run harvest
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let world = test_scenario::take_shared_by_id<World>(&scenario, world_id);
            let mut pool = test_scenario::take_shared<PulsePool>(&scenario);
            let cap = test_scenario::take_from_sender<HarvestCap>(&scenario);

            harvest::harvest(&world, &mut pool, &cap, test_scenario::ctx(&mut scenario));

            // 1 at-risk tile * 3 PULSE = 3 PULSE
            assert!(pulse::pool_balance(&pool, USER1) == 3);

            test_scenario::return_shared(world);
            test_scenario::return_shared(pool);
            test_scenario::return_to_sender(&scenario, cap);
        };

        test_scenario::end(scenario);
    }

    #[test]
    /// Tile adjacent to a type=2 raider from a different owner. Yields 4 PULSE.
    fun test_harvest_near_raider() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup_registry(&mut scenario);
        setup_pulse(&mut scenario);

        let world_id = create_world(&mut scenario, USER1);
        create_harvest_cap(&mut scenario, world_id);

        // Place USER1's tile at (10, 10) and USER2's raider tile at (11, 10)
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut world = test_scenario::take_shared_by_id<World>(&scenario, world_id);
            world::test_place_tile(&mut world, 10, 10, 0, USER1); // normal tile
            world::test_place_tile(&mut world, 11, 10, 2, USER2); // raider tile, different owner
            test_scenario::return_shared(world);
        };

        // Run harvest
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let world = test_scenario::take_shared_by_id<World>(&scenario, world_id);
            let mut pool = test_scenario::take_shared<PulsePool>(&scenario);
            let cap = test_scenario::take_from_sender<HarvestCap>(&scenario);

            harvest::harvest(&world, &mut pool, &cap, test_scenario::ctx(&mut scenario));

            // USER1's tile is near a raider (different owner) = 4 PULSE
            assert!(pulse::pool_balance(&pool, USER1) == 4);

            test_scenario::return_shared(world);
            test_scenario::return_shared(pool);
            test_scenario::return_to_sender(&scenario, cap);
        };

        test_scenario::end(scenario);
    }

    #[test]
    /// Empty world. Total yield = 0. Should not abort.
    fun test_harvest_empty_world() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup_registry(&mut scenario);
        setup_pulse(&mut scenario);

        let world_id = create_world(&mut scenario, USER1);
        create_harvest_cap(&mut scenario, world_id);

        // Run harvest on empty world
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let world = test_scenario::take_shared_by_id<World>(&scenario, world_id);
            let mut pool = test_scenario::take_shared<PulsePool>(&scenario);
            let cap = test_scenario::take_from_sender<HarvestCap>(&scenario);

            harvest::harvest(&world, &mut pool, &cap, test_scenario::ctx(&mut scenario));

            // No tiles = no yield
            assert!(pulse::pool_balance(&pool, USER1) == 0);

            test_scenario::return_shared(world);
            test_scenario::return_shared(pool);
            test_scenario::return_to_sender(&scenario, cap);
        };

        test_scenario::end(scenario);
    }

    #[test]
    /// Tile adjacent to OWN raider tile. Should NOT get 4x yield.
    /// Gets at-risk (3) since isolated (1 neighbor = raider only).
    fun test_harvest_anti_self_farm() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup_registry(&mut scenario);
        setup_pulse(&mut scenario);

        let world_id = create_world(&mut scenario, USER1);
        create_harvest_cap(&mut scenario, world_id);

        // Place USER1's normal tile at (10, 10) and USER1's OWN raider tile at (11, 10)
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut world = test_scenario::take_shared_by_id<World>(&scenario, world_id);
            world::test_place_tile(&mut world, 10, 10, 0, USER1); // normal tile
            world::test_place_tile(&mut world, 11, 10, 2, USER1); // raider tile, SAME owner
            test_scenario::return_shared(world);
        };

        // Run harvest
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let world = test_scenario::take_shared_by_id<World>(&scenario, world_id);
            let mut pool = test_scenario::take_shared<PulsePool>(&scenario);
            let cap = test_scenario::take_from_sender<HarvestCap>(&scenario);

            harvest::harvest(&world, &mut pool, &cap, test_scenario::ctx(&mut scenario));

            // USER1's tile is near own raider = anti-self-farm kicks in.
            // Tile has 1 neighbor (the raider), so neighbors < 2 = at-risk = 3 PULSE.
            // The raider tile itself (USER1, type=2) also gets yield:
            //   it has 1 neighbor, at-risk = 3 PULSE.
            // Total: 3 + 3 = 6 for USER1.
            // But the key assertion: it's NOT 4 (would be 4 if self-farm allowed for
            // the normal tile). The normal tile gets 3 (at-risk), not 4 (near-raider).
            assert!(pulse::pool_balance(&pool, USER1) == 6);

            test_scenario::return_shared(world);
            test_scenario::return_shared(pool);
            test_scenario::return_to_sender(&scenario, cap);
        };

        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 400, location = miniworld::harvest)] // EInvalidHarvestCap
    /// Wrong HarvestCap for a different world. Should abort.
    fun test_harvest_cap_validation() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup_registry(&mut scenario);
        setup_pulse(&mut scenario);

        let world1_id = create_world(&mut scenario, USER1);
        let _world2_id = create_world(&mut scenario, USER2);

        // Create HarvestCap for world2, but try to use it on world1
        create_harvest_cap(&mut scenario, _world2_id);

        // Try to harvest world1 with world2's cap — should abort
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let world1 = test_scenario::take_shared_by_id<World>(&scenario, world1_id);
            let mut pool = test_scenario::take_shared<PulsePool>(&scenario);
            let cap = test_scenario::take_from_sender<HarvestCap>(&scenario);

            harvest::harvest(&world1, &mut pool, &cap, test_scenario::ctx(&mut scenario));

            test_scenario::return_shared(world1);
            test_scenario::return_shared(pool);
            test_scenario::return_to_sender(&scenario, cap);
        };

        test_scenario::end(scenario);
    }
}
