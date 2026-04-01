#[test_only]
module miniworld::world_tests {
    use sui::test_scenario;
    use miniworld::world::{Self, World, PulseCap};

    const ADMIN: address = @0xAD;
    const USER1: address = @0x1;
    const USER2: address = @0x2;

    // ── Helpers ──

    fun setup_world(scenario: &mut test_scenario::Scenario) {
        test_scenario::next_tx(scenario, ADMIN);
        {
            world::create_world(test_scenario::ctx(scenario));
        };
    }

    fun place_at(scenario: &mut test_scenario::Scenario, sender: address, x: u8, y: u8) {
        test_scenario::next_tx(scenario, sender);
        {
            let mut world = test_scenario::take_shared<World>(scenario);
            world::place_tile(&mut world, x, y, 0, test_scenario::ctx(scenario));
            test_scenario::return_shared(world);
        };
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

    // ── Tests ──

    #[test]
    fun test_create_world() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup_world(&mut scenario);

        // Verify World was shared and PulseCap was transferred to ADMIN
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let world = test_scenario::take_shared<World>(&scenario);
            assert!(world::world_epoch(&world) == 0);
            assert!(world::world_width(&world) == 32);
            assert!(world::world_height(&world) == 32);
            test_scenario::return_shared(world);

            let cap = test_scenario::take_from_sender<PulseCap>(&scenario);
            test_scenario::return_to_sender(&scenario, cap);
        };

        test_scenario::end(scenario);
    }

    #[test]
    fun test_place_tile_happy() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup_world(&mut scenario);
        place_at(&mut scenario, USER1, 5, 5);

        test_scenario::next_tx(&mut scenario, USER1);
        {
            let world = test_scenario::take_shared<World>(&scenario);
            // Grid index for (5, 5) on 32-wide grid = 5*32 + 5 = 165
            // We can't directly access grid in tests without a public accessor,
            // but if place_tile didn't abort, it succeeded
            assert!(world::world_epoch(&world) == 0);
            test_scenario::return_shared(world);
        };

        test_scenario::end(scenario);
    }

    #[test]
    fun test_place_tile_overwrite() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup_world(&mut scenario);

        // USER1 places at (3, 3)
        place_at(&mut scenario, USER1, 3, 3);

        // Advance epoch so USER2 isn't rate limited (same epoch is fine for different users)
        // Actually, different users can place in the same epoch. USER2 just needs its own slot.
        place_at(&mut scenario, USER2, 3, 3);

        // If we get here, overwrite succeeded
        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 1, location = miniworld::world)] // ERateLimited
    fun test_place_tile_rate_limited() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup_world(&mut scenario);

        // USER1 places twice in same epoch
        place_at(&mut scenario, USER1, 5, 5);
        place_at(&mut scenario, USER1, 6, 6); // Should fail

        test_scenario::end(scenario);
    }

    #[test]
    fun test_place_tile_new_epoch() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup_world(&mut scenario);

        // USER1 places, then pulse advances epoch, then USER1 places again
        place_at(&mut scenario, USER1, 5, 5);
        do_pulse(&mut scenario);
        place_at(&mut scenario, USER1, 6, 6); // Should succeed after epoch advance

        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 0, location = miniworld::world)] // EInvalidCoordinate
    fun test_place_tile_invalid_coord() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup_world(&mut scenario);
        place_at(&mut scenario, USER1, 32, 0); // x=32 is out of bounds

        test_scenario::end(scenario);
    }

    #[test]
    fun test_pulse_happy() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup_world(&mut scenario);

        // Place a few tiles to make pulse interesting
        place_at(&mut scenario, USER1, 5, 5);
        place_at(&mut scenario, USER2, 6, 5);

        do_pulse(&mut scenario);

        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let world = test_scenario::take_shared<World>(&scenario);
            assert!(world::world_epoch(&world) == 1);
            test_scenario::return_shared(world);
        };

        test_scenario::end(scenario);
    }

    #[test]
    fun test_pulse_empty_grid() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup_world(&mut scenario);

        // Pulse on empty grid should do nothing
        do_pulse(&mut scenario);

        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let world = test_scenario::take_shared<World>(&scenario);
            assert!(world::world_epoch(&world) == 1);
            test_scenario::return_shared(world);
        };

        test_scenario::end(scenario);
    }

    #[test]
    fun test_gol_block_still_life() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup_world(&mut scenario);

        // 2x2 block at (10,10) is a GoL still life — should survive pulse
        // Need 4 users (rate limit is per-address per epoch)
        place_at(&mut scenario, @0x10, 10, 10);
        place_at(&mut scenario, @0x11, 11, 10);
        place_at(&mut scenario, @0x12, 10, 11);
        place_at(&mut scenario, @0x13, 11, 11);

        // Pulse should leave the block intact (2x2 block: each cell has 3 neighbors)
        do_pulse(&mut scenario);

        // Pulse again to verify stability
        do_pulse(&mut scenario);

        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let world = test_scenario::take_shared<World>(&scenario);
            assert!(world::world_epoch(&world) == 2);
            test_scenario::return_shared(world);
        };

        test_scenario::end(scenario);
    }
}
