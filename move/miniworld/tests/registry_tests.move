#[test_only]
module miniworld::registry_tests {
    use sui::test_scenario;
    use miniworld::world_registry::{Self, WorldRegistry};
    const ADMIN: address = @0xAD;

    // ── Helpers ──

    fun setup_registry(scenario: &mut test_scenario::Scenario) {
        test_scenario::next_tx(scenario, ADMIN);
        {
            world_registry::test_create_registry(test_scenario::ctx(scenario));
        };
    }

    // ── Tests ──

    #[test]
    fun test_create_registry() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup_registry(&mut scenario);

        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let registry = test_scenario::take_shared<WorldRegistry>(&scenario);
            assert!(world_registry::world_count(&registry) == 0);
            test_scenario::return_shared(registry);
        };

        test_scenario::end(scenario);
    }

    #[test]
    fun test_register_world() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup_registry(&mut scenario);

        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut registry = test_scenario::take_shared<WorldRegistry>(&scenario);
            let world_id = object::id_from_address(@0x42);
            world_registry::register_world(&mut registry, world_id);
            assert!(world_registry::world_count(&registry) == 1);
            assert!(world_registry::world_at(&registry, 0) == world_id);
            test_scenario::return_shared(registry);
        };

        test_scenario::end(scenario);
    }

    #[test]
    fun test_register_multiple_worlds() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup_registry(&mut scenario);

        let world_id_0 = object::id_from_address(@0x42);
        let world_id_1 = object::id_from_address(@0x43);
        let world_id_2 = object::id_from_address(@0x44);

        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut registry = test_scenario::take_shared<WorldRegistry>(&scenario);
            world_registry::register_world(&mut registry, world_id_0);
            world_registry::register_world(&mut registry, world_id_1);
            world_registry::register_world(&mut registry, world_id_2);

            assert!(world_registry::world_count(&registry) == 3);
            assert!(world_registry::world_at(&registry, 0) == world_id_0);
            assert!(world_registry::world_at(&registry, 1) == world_id_1);
            assert!(world_registry::world_at(&registry, 2) == world_id_2);

            test_scenario::return_shared(registry);
        };

        test_scenario::end(scenario);
    }
}
