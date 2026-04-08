#[test_only]
module miniworld::raid_tests {
    use sui::test_scenario;
    use sui::coin::{Self, Coin};
    use miniworld::world::{Self, World};
    use miniworld::world_registry::{Self, WorldRegistry};
    use miniworld::agent;
    use miniworld::raid;
    use pulse::pulse::{Self, PULSE, PulseVault};

    const ADMIN: address = @0xAD;
    const USER1: address = @0x1;
    const USER2: address = @0x2;
    const AGENT_RUNNER: address = @0xA1;

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

    /// Full setup: registry, pulse, two worlds (USER1 with agent, USER2 plain),
    /// and 200 PULSE minted to USER1. Returns (world1_id, world2_id).
    fun setup_two_worlds_with_agent(scenario: &mut test_scenario::Scenario): (ID, ID) {
        setup_registry(scenario);
        setup_pulse(scenario);

        // USER1 creates world1
        test_scenario::next_tx(scenario, USER1);
        {
            let mut registry = test_scenario::take_shared<WorldRegistry>(scenario);
            world::create_world_v2(&mut registry, test_scenario::ctx(scenario));
            test_scenario::return_shared(registry);
        };
        test_scenario::next_tx(scenario, USER1);
        let world1_id = option::destroy_some(test_scenario::most_recent_id_shared<World>());

        // USER2 creates world2
        test_scenario::next_tx(scenario, USER2);
        {
            let mut registry = test_scenario::take_shared<WorldRegistry>(scenario);
            world::create_world_v2(&mut registry, test_scenario::ctx(scenario));
            test_scenario::return_shared(registry);
        };
        test_scenario::next_tx(scenario, USER2);
        let world2_id = option::destroy_some(test_scenario::most_recent_id_shared<World>());

        // USER1 deploys agent on world1
        test_scenario::next_tx(scenario, USER1);
        {
            let mut world1 = test_scenario::take_shared_by_id<World>(scenario, world1_id);
            agent::deploy_agent(&mut world1, AGENT_RUNNER, 0, test_scenario::ctx(scenario));
            test_scenario::return_shared(world1);
        };

        // Mint 200 PULSE for USER1
        test_scenario::next_tx(scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<PulseVault>(scenario);
            pulse::mint_pulse(&mut vault, 200, USER1, test_scenario::ctx(scenario));
            test_scenario::return_shared(vault);
        };

        (world1_id, world2_id)
    }

    // ── Tests ──

    #[test]
    fun test_raid_happy_path() {
        let mut scenario = test_scenario::begin(ADMIN);
        let (world1_id, world2_id) = setup_two_worlds_with_agent(&mut scenario);

        // USER1 raids world2 at (5, 5) with 200 PULSE (costs 100, 100 returned)
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let source_world = test_scenario::take_shared_by_id<World>(&scenario, world1_id);
            let mut target_world = test_scenario::take_shared_by_id<World>(&scenario, world2_id);
            let mut vault = test_scenario::take_shared<PulseVault>(&scenario);
            let payment = test_scenario::take_from_sender<Coin<PULSE>>(&scenario);

            raid::raid(
                &source_world,
                &mut target_world,
                &mut vault,
                payment,
                5, 5,
                test_scenario::ctx(&mut scenario),
            );

            // Verify tile was placed at (5, 5)
            let idx = world::to_index(5, 5, world::world_width(&target_world));
            assert!(world::is_cell_alive(&target_world, idx));

            test_scenario::return_shared(source_world);
            test_scenario::return_shared(target_world);
            test_scenario::return_shared(vault);
        };

        // Verify USER1 got change back (200 - 100 = 100 PULSE)
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let change = test_scenario::take_from_sender<Coin<PULSE>>(&scenario);
            assert!(coin::value(&change) == 100);
            test_scenario::return_to_sender(&scenario, change);
        };

        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 300, location = miniworld::raid)] // ERaidNoAgent
    fun test_raid_no_agent() {
        let mut scenario = test_scenario::begin(ADMIN);

        setup_registry(&mut scenario);
        setup_pulse(&mut scenario);

        // USER1 creates world1 (NO agent deployed)
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut registry = test_scenario::take_shared<WorldRegistry>(&scenario);
            world::create_world_v2(&mut registry, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(registry);
        };
        test_scenario::next_tx(&mut scenario, USER1);
        let world1_id = option::destroy_some(test_scenario::most_recent_id_shared<World>());

        // USER2 creates world2
        test_scenario::next_tx(&mut scenario, USER2);
        {
            let mut registry = test_scenario::take_shared<WorldRegistry>(&scenario);
            world::create_world_v2(&mut registry, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(registry);
        };
        test_scenario::next_tx(&mut scenario, USER2);
        let world2_id = option::destroy_some(test_scenario::most_recent_id_shared<World>());

        // Mint PULSE for USER1
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<PulseVault>(&scenario);
            pulse::mint_pulse(&mut vault, 200, USER1, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(vault);
        };

        // USER1 tries to raid without agent on source — should abort ERaidNoAgent
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let source_world = test_scenario::take_shared_by_id<World>(&scenario, world1_id);
            let mut target_world = test_scenario::take_shared_by_id<World>(&scenario, world2_id);
            let mut vault = test_scenario::take_shared<PulseVault>(&scenario);
            let payment = test_scenario::take_from_sender<Coin<PULSE>>(&scenario);

            raid::raid(
                &source_world,
                &mut target_world,
                &mut vault,
                payment,
                5, 5,
                test_scenario::ctx(&mut scenario),
            );

            test_scenario::return_shared(source_world);
            test_scenario::return_shared(target_world);
            test_scenario::return_shared(vault);
        };

        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 301, location = miniworld::raid)] // ERaidRateLimited
    fun test_raid_rate_limited() {
        let mut scenario = test_scenario::begin(ADMIN);
        let (world1_id, world2_id) = setup_two_worlds_with_agent(&mut scenario);

        // First raid succeeds
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let source_world = test_scenario::take_shared_by_id<World>(&scenario, world1_id);
            let mut target_world = test_scenario::take_shared_by_id<World>(&scenario, world2_id);
            let mut vault = test_scenario::take_shared<PulseVault>(&scenario);
            let payment = test_scenario::take_from_sender<Coin<PULSE>>(&scenario);

            raid::raid(
                &source_world,
                &mut target_world,
                &mut vault,
                payment,
                5, 5,
                test_scenario::ctx(&mut scenario),
            );

            test_scenario::return_shared(source_world);
            test_scenario::return_shared(target_world);
            test_scenario::return_shared(vault);
        };

        // Mint more PULSE for USER1 for second attempt
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<PulseVault>(&scenario);
            pulse::mint_pulse(&mut vault, 200, USER1, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(vault);
        };

        // Second raid same epoch — should abort ERaidRateLimited
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let source_world = test_scenario::take_shared_by_id<World>(&scenario, world1_id);
            let mut target_world = test_scenario::take_shared_by_id<World>(&scenario, world2_id);
            let mut vault = test_scenario::take_shared<PulseVault>(&scenario);
            let payment = test_scenario::take_from_sender<Coin<PULSE>>(&scenario);

            raid::raid(
                &source_world,
                &mut target_world,
                &mut vault,
                payment,
                6, 6,
                test_scenario::ctx(&mut scenario),
            );

            test_scenario::return_shared(source_world);
            test_scenario::return_shared(target_world);
            test_scenario::return_shared(vault);
        };

        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 302, location = miniworld::raid)] // ERaidInsufficientPulse
    fun test_raid_insufficient_pulse() {
        let mut scenario = test_scenario::begin(ADMIN);

        setup_registry(&mut scenario);
        setup_pulse(&mut scenario);

        // USER1 creates world1
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut registry = test_scenario::take_shared<WorldRegistry>(&scenario);
            world::create_world_v2(&mut registry, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(registry);
        };
        test_scenario::next_tx(&mut scenario, USER1);
        let world1_id = option::destroy_some(test_scenario::most_recent_id_shared<World>());

        // USER2 creates world2
        test_scenario::next_tx(&mut scenario, USER2);
        {
            let mut registry = test_scenario::take_shared<WorldRegistry>(&scenario);
            world::create_world_v2(&mut registry, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(registry);
        };
        test_scenario::next_tx(&mut scenario, USER2);
        let world2_id = option::destroy_some(test_scenario::most_recent_id_shared<World>());

        // USER1 deploys agent
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut world1 = test_scenario::take_shared_by_id<World>(&scenario, world1_id);
            agent::deploy_agent(&mut world1, AGENT_RUNNER, 0, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(world1);
        };

        // Mint only 50 PULSE (insufficient)
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<PulseVault>(&scenario);
            pulse::mint_pulse(&mut vault, 50, USER1, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(vault);
        };

        // USER1 tries to raid with 50 PULSE — should abort ERaidInsufficientPulse
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let source_world = test_scenario::take_shared_by_id<World>(&scenario, world1_id);
            let mut target_world = test_scenario::take_shared_by_id<World>(&scenario, world2_id);
            let mut vault = test_scenario::take_shared<PulseVault>(&scenario);
            let payment = test_scenario::take_from_sender<Coin<PULSE>>(&scenario);

            raid::raid(
                &source_world,
                &mut target_world,
                &mut vault,
                payment,
                5, 5,
                test_scenario::ctx(&mut scenario),
            );

            test_scenario::return_shared(source_world);
            test_scenario::return_shared(target_world);
            test_scenario::return_shared(vault);
        };

        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 303, location = miniworld::raid)] // ERaidCellOccupied
    fun test_raid_cell_occupied() {
        let mut scenario = test_scenario::begin(ADMIN);
        let (world1_id, world2_id) = setup_two_worlds_with_agent(&mut scenario);

        // USER2 places a tile on world2 at (5, 5) so the cell is occupied
        test_scenario::next_tx(&mut scenario, USER2);
        {
            let mut target_world = test_scenario::take_shared_by_id<World>(&scenario, world2_id);
            world::place_tile_v2(&mut target_world, 5, 5, 1, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(target_world);
        };

        // USER1 tries to raid occupied cell — should abort ERaidCellOccupied
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let source_world = test_scenario::take_shared_by_id<World>(&scenario, world1_id);
            let mut target_world = test_scenario::take_shared_by_id<World>(&scenario, world2_id);
            let mut vault = test_scenario::take_shared<PulseVault>(&scenario);
            let payment = test_scenario::take_from_sender<Coin<PULSE>>(&scenario);

            raid::raid(
                &source_world,
                &mut target_world,
                &mut vault,
                payment,
                5, 5,
                test_scenario::ctx(&mut scenario),
            );

            test_scenario::return_shared(source_world);
            test_scenario::return_shared(target_world);
            test_scenario::return_shared(vault);
        };

        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 305, location = miniworld::raid)] // ERaidSameWorld
    fun test_raid_same_world() {
        let mut scenario = test_scenario::begin(ADMIN);
        let (world1_id, _world2_id) = setup_two_worlds_with_agent(&mut scenario);

        // USER1 tries to raid their own world1.
        // The Move borrow checker prevents &World + &mut World on the same object,
        // so we test this via a dedicated test helper that bypasses the borrow issue.
        // For now, we use world1 as both source and target by taking it once as &mut
        // and calling a test wrapper.
        //
        // Actually, in production this is impossible: a PTB can't pass the same shared
        // object as both immutable and mutable ref. The ERaidSameWorld check is defense-
        // in-depth. We test it via a package-level test helper.
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut world1 = test_scenario::take_shared_by_id<World>(&scenario, world1_id);
            let mut vault = test_scenario::take_shared<PulseVault>(&scenario);
            let payment = test_scenario::take_from_sender<Coin<PULSE>>(&scenario);

            raid::test_raid_self(
                &mut world1,
                &mut vault,
                payment,
                5, 5,
                test_scenario::ctx(&mut scenario),
            );

            test_scenario::return_shared(world1);
            test_scenario::return_shared(vault);
        };

        test_scenario::end(scenario);
    }
}
