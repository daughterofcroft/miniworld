#[test_only]
module miniworld::world_v2_tests {
    use sui::test_scenario;
    use miniworld::world::{Self, World, PulseCap};
    use miniworld::world_registry::{Self, WorldRegistry};

    const ADMIN: address = @0xAD;
    const USER1: address = @0x1;
    const USER2: address = @0x2;

    // Helper: set up registry
    fun setup_registry(scenario: &mut test_scenario::Scenario) {
        test_scenario::next_tx(scenario, ADMIN);
        {
            world_registry::test_create_registry(test_scenario::ctx(scenario));
        };
    }

    #[test]
    fun test_create_world_v2() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup_registry(&mut scenario);

        // Create world via v2
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut registry = test_scenario::take_shared<WorldRegistry>(&scenario);
            world::create_world_v2(&mut registry, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(registry);
        };

        // Verify world exists, has owner, and is registered
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let world = test_scenario::take_shared<World>(&scenario);
            assert!(world::world_epoch(&world) == 0);
            assert!(world::has_owner(&world));
            assert!(world::world_owner(&world) == USER1);
            test_scenario::return_shared(world);

            // Verify PulseCap transferred to USER1
            let cap = test_scenario::take_from_sender<PulseCap>(&scenario);
            test_scenario::return_to_sender(&scenario, cap);

            // Verify registry has 1 world
            let registry = test_scenario::take_shared<WorldRegistry>(&scenario);
            assert!(world_registry::world_count(&registry) == 1);
            test_scenario::return_shared(registry);
        };

        test_scenario::end(scenario);
    }

    #[test]
    fun test_claim_world_owner() {
        let mut scenario = test_scenario::begin(ADMIN);

        // Create world via old create_world (no owner)
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            world::create_world(test_scenario::ctx(&mut scenario));
        };

        // USER1 claims ownership
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut world = test_scenario::take_shared<World>(&scenario);
            assert!(!world::has_owner(&world));
            world::claim_world_owner(&mut world, test_scenario::ctx(&mut scenario));
            assert!(world::has_owner(&world));
            assert!(world::world_owner(&world) == USER1);
            test_scenario::return_shared(world);
        };

        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 3, location = miniworld::world)] // EAlreadyOwned
    fun test_claim_world_owner_double_claim() {
        let mut scenario = test_scenario::begin(ADMIN);

        // Create world via old create_world
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            world::create_world(test_scenario::ctx(&mut scenario));
        };

        // USER1 claims
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut world = test_scenario::take_shared<World>(&scenario);
            world::claim_world_owner(&mut world, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(world);
        };

        // USER2 tries to claim — should fail
        test_scenario::next_tx(&mut scenario, USER2);
        {
            let mut world = test_scenario::take_shared<World>(&scenario);
            world::claim_world_owner(&mut world, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(world);
        };

        test_scenario::end(scenario);
    }

    #[test]
    fun test_create_world_v2_has_owner_set() {
        // Verify that create_world_v2 sets owner, so claim_world_owner would fail
        let mut scenario = test_scenario::begin(ADMIN);
        setup_registry(&mut scenario);

        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut registry = test_scenario::take_shared<WorldRegistry>(&scenario);
            world::create_world_v2(&mut registry, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(registry);
        };

        test_scenario::next_tx(&mut scenario, USER1);
        {
            let world = test_scenario::take_shared<World>(&scenario);
            assert!(world::has_owner(&world));
            assert!(world::world_owner(&world) == USER1);
            test_scenario::return_shared(world);
        };

        test_scenario::end(scenario);
    }
}
