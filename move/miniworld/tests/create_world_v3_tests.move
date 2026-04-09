#[test_only]
module miniworld::create_world_v3_tests {
    use sui::test_scenario;
    use miniworld::world::{Self, World, PulseCap};
    use miniworld::world_registry::{Self, WorldRegistry};
    use pulse::pulse::{Self, PulsePool, HarvestCap};

    const CREATOR: address = @0xC0FFEE;

    #[test]
    fun test_create_world_v3() {
        let mut scenario = test_scenario::begin(CREATOR);

        // Setup: create PulseVault + PulsePool, WorldRegistry, RegistryCap
        {
            let ctx = test_scenario::ctx(&mut scenario);
            pulse::test_init(ctx);
            world_registry::test_create_registry(ctx);
        };

        // Create world v3
        test_scenario::next_tx(&mut scenario, CREATOR);
        {
            let mut registry = test_scenario::take_shared<WorldRegistry>(&scenario);
            let mut pool = test_scenario::take_shared<PulsePool>(&scenario);
            let registry_cap = world_registry::test_create_registry_cap(
                test_scenario::ctx(&mut scenario),
            );
            let ctx = test_scenario::ctx(&mut scenario);

            world::create_world_v3(&mut registry, &registry_cap, &mut pool, ctx);

            // Verify registry count
            assert!(world_registry::world_count(&registry) == 1);

            // Verify 100 PULSE credited to creator
            assert!(pulse::pool_balance(&pool, CREATOR) == 100);

            test_scenario::return_shared(registry);
            test_scenario::return_shared(pool);
            sui::transfer::public_transfer(registry_cap, CREATOR);
        };

        // Verify shared World exists and PulseCap + HarvestCap transferred to creator
        test_scenario::next_tx(&mut scenario, CREATOR);
        {
            let world = test_scenario::take_shared<World>(&scenario);

            // Verify owner is set
            assert!(world::has_owner(&world));
            assert!(world::world_owner(&world) == CREATOR);

            // Verify world is registered (registry has 1 entry matching this world)
            let registry = test_scenario::take_shared<WorldRegistry>(&scenario);
            assert!(world_registry::world_at(&registry, 0) == object::id(&world));
            test_scenario::return_shared(registry);

            test_scenario::return_shared(world);

            // Verify PulseCap transferred to creator
            let pulse_cap = test_scenario::take_from_sender<PulseCap>(&scenario);
            test_scenario::return_to_sender(&scenario, pulse_cap);

            // Verify HarvestCap transferred to creator
            let harvest_cap = test_scenario::take_from_sender<HarvestCap>(&scenario);
            test_scenario::return_to_sender(&scenario, harvest_cap);
        };

        test_scenario::end(scenario);
    }

    #[test]
    fun test_create_world_v3_bootstrap_pulse() {
        let mut scenario = test_scenario::begin(CREATOR);

        // Setup
        {
            let ctx = test_scenario::ctx(&mut scenario);
            pulse::test_init(ctx);
            world_registry::test_create_registry(ctx);
        };

        // Create world v3
        test_scenario::next_tx(&mut scenario, CREATOR);
        {
            let mut registry = test_scenario::take_shared<WorldRegistry>(&scenario);
            let mut pool = test_scenario::take_shared<PulsePool>(&scenario);
            let registry_cap = world_registry::test_create_registry_cap(
                test_scenario::ctx(&mut scenario),
            );
            let ctx = test_scenario::ctx(&mut scenario);

            world::create_world_v3(&mut registry, &registry_cap, &mut pool, ctx);

            // Verify pool_balance for creator is exactly 100
            assert!(pulse::pool_balance(&pool, CREATOR) == 100);

            // Verify other addresses have 0
            assert!(pulse::pool_balance(&pool, @0xDEAD) == 0);

            test_scenario::return_shared(registry);
            test_scenario::return_shared(pool);
            sui::transfer::public_transfer(registry_cap, CREATOR);
        };

        test_scenario::end(scenario);
    }
}
