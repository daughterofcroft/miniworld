#[test_only]
module miniworld::place_tile_v2_tests {
    use sui::test_scenario;
    use miniworld::world::{Self, World, PulseCap};

    const ADMIN: address = @0xAD;
    const USER1: address = @0x1;

    fun setup_world(scenario: &mut test_scenario::Scenario) {
        test_scenario::next_tx(scenario, ADMIN);
        { world::create_world(test_scenario::ctx(scenario)); };
    }

    fun do_pulse(scenario: &mut test_scenario::Scenario) {
        test_scenario::next_tx(scenario, ADMIN);
        {
            let mut world = test_scenario::take_shared<World>(scenario);
            let cap = test_scenario::take_from_sender<PulseCap>(scenario);
            world::pulse(&mut world, &cap, test_scenario::ctx(scenario));
            test_scenario::return_to_sender(scenario, cap);
            test_scenario::return_shared(world);
        };
    }

    #[test]
    fun test_place_tile_v2_single() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup_world(&mut scenario);
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut world = test_scenario::take_shared<World>(&scenario);
            world::place_tile_v2(&mut world, 5, 5, 0, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(world);
        };
        test_scenario::end(scenario);
    }

    #[test]
    fun test_place_tile_v2_five_per_epoch() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup_world(&mut scenario);
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut world = test_scenario::take_shared<World>(&scenario);
            world::place_tile_v2(&mut world, 0, 0, 0, test_scenario::ctx(&mut scenario));
            world::place_tile_v2(&mut world, 1, 0, 0, test_scenario::ctx(&mut scenario));
            world::place_tile_v2(&mut world, 2, 0, 0, test_scenario::ctx(&mut scenario));
            world::place_tile_v2(&mut world, 3, 0, 0, test_scenario::ctx(&mut scenario));
            world::place_tile_v2(&mut world, 4, 0, 0, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(world);
        };
        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 10, location = miniworld::world)]
    fun test_place_tile_v2_sixth_aborts() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup_world(&mut scenario);
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut world = test_scenario::take_shared<World>(&scenario);
            world::place_tile_v2(&mut world, 0, 0, 0, test_scenario::ctx(&mut scenario));
            world::place_tile_v2(&mut world, 1, 0, 0, test_scenario::ctx(&mut scenario));
            world::place_tile_v2(&mut world, 2, 0, 0, test_scenario::ctx(&mut scenario));
            world::place_tile_v2(&mut world, 3, 0, 0, test_scenario::ctx(&mut scenario));
            world::place_tile_v2(&mut world, 4, 0, 0, test_scenario::ctx(&mut scenario));
            world::place_tile_v2(&mut world, 5, 0, 0, test_scenario::ctx(&mut scenario)); // 6th, should abort
            test_scenario::return_shared(world);
        };
        test_scenario::end(scenario);
    }

    #[test]
    fun test_place_tile_v2_resets_on_new_epoch() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup_world(&mut scenario);
        // Place 5 tiles
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut world = test_scenario::take_shared<World>(&scenario);
            world::place_tile_v2(&mut world, 0, 0, 0, test_scenario::ctx(&mut scenario));
            world::place_tile_v2(&mut world, 1, 0, 0, test_scenario::ctx(&mut scenario));
            world::place_tile_v2(&mut world, 2, 0, 0, test_scenario::ctx(&mut scenario));
            world::place_tile_v2(&mut world, 3, 0, 0, test_scenario::ctx(&mut scenario));
            world::place_tile_v2(&mut world, 4, 0, 0, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(world);
        };
        // Pulse to advance epoch
        do_pulse(&mut scenario);
        // Place 5 more tiles in new epoch
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut world = test_scenario::take_shared<World>(&scenario);
            world::place_tile_v2(&mut world, 10, 0, 0, test_scenario::ctx(&mut scenario));
            world::place_tile_v2(&mut world, 11, 0, 0, test_scenario::ctx(&mut scenario));
            world::place_tile_v2(&mut world, 12, 0, 0, test_scenario::ctx(&mut scenario));
            world::place_tile_v2(&mut world, 13, 0, 0, test_scenario::ctx(&mut scenario));
            world::place_tile_v2(&mut world, 14, 0, 0, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(world);
        };
        test_scenario::end(scenario);
    }
}
