#[test_only]
module miniworld::agent_defend_tests {
    use sui::test_scenario;
    use sui::package;
    use miniworld::world::{Self, World, PulseCap};
    use miniworld::world_registry::{Self, WorldRegistry, RegistryTicket};
    use miniworld::agent::{Self, Agent, AgentCap};
    use miniworld::agent_actions;

    const ADMIN: address = @0xAD;
    const USER1: address = @0x1;
    const AGENT_RUNNER: address = @0xA1;

    // ── Helpers ──

    fun setup_registry(scenario: &mut test_scenario::Scenario) {
        test_scenario::next_tx(scenario, ADMIN);
        {
            world_registry::test_init(test_scenario::ctx(scenario));
        };
        test_scenario::next_tx(scenario, ADMIN);
        {
            let ticket = test_scenario::take_from_sender<RegistryTicket>(scenario);
            let cap = package::test_publish(object::id_from_address(@0x0), test_scenario::ctx(scenario));
            world_registry::create_registry(ticket, &cap, test_scenario::ctx(scenario));
            transfer::public_transfer(cap, ADMIN);
        };
    }

    fun setup_world_with_agent(scenario: &mut test_scenario::Scenario) {
        setup_registry(scenario);

        // USER1 creates world v2
        test_scenario::next_tx(scenario, USER1);
        {
            let mut registry = test_scenario::take_shared<WorldRegistry>(scenario);
            world::create_world_v2(&mut registry, test_scenario::ctx(scenario));
            test_scenario::return_shared(registry);
        };

        // USER1 deploys agent
        test_scenario::next_tx(scenario, USER1);
        {
            let mut world = test_scenario::take_shared<World>(scenario);
            agent::deploy_agent(&mut world, AGENT_RUNNER, 0, test_scenario::ctx(scenario));
            test_scenario::return_shared(world);
        };
    }

    /// Place a tile at (x, y) as the given sender.
    fun place_at(scenario: &mut test_scenario::Scenario, sender: address, x: u8, y: u8) {
        test_scenario::next_tx(scenario, sender);
        {
            let mut world = test_scenario::take_shared<World>(scenario);
            world::place_tile(&mut world, x, y, 0, test_scenario::ctx(scenario));
            test_scenario::return_shared(world);
        };
    }

    /// Execute a pulse to advance the epoch.
    fun do_pulse(scenario: &mut test_scenario::Scenario) {
        test_scenario::next_tx(scenario, USER1);
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
    fun test_agent_defend_happy_path() {
        // An isolated tile at (5, 5) has 0 neighbors -> at risk (< 2).
        let mut scenario = test_scenario::begin(ADMIN);
        setup_world_with_agent(&mut scenario);

        // Place an isolated tile at (5, 5)
        place_at(&mut scenario, @0x10, 5, 5);

        // Pulse to advance epoch (tile dies, but we need epoch > 0 for rate limit).
        // Actually, the isolated tile will die on pulse. We need to place AFTER pulse
        // so it's alive when agent_defend runs.
        do_pulse(&mut scenario);

        // Place a new isolated tile at (5, 5) after the pulse (epoch is now 1).
        place_at(&mut scenario, @0x11, 5, 5);

        // Now pulse again to advance epoch to 2. But that would kill the tile.
        // We need: tile alive + epoch > agent.last_action_epoch (0).
        // After the first pulse, epoch = 1, agent.last_action_epoch = 0, so 0 < 1 passes.
        // The tile placed after first pulse is alive. Let's defend it now.

        // Agent defends the tile at (5, 5) — epoch is 1, last_action_epoch is 0
        test_scenario::next_tx(&mut scenario, AGENT_RUNNER);
        {
            let mut world = test_scenario::take_shared<World>(&scenario);
            let mut agent = test_scenario::take_shared<Agent>(&scenario);
            let cap = test_scenario::take_from_sender<AgentCap>(&scenario);

            agent_actions::agent_defend(&mut world, &mut agent, &cap, 5, 5, test_scenario::ctx(&mut scenario));

            // Verify agent stats updated
            assert!(agent::agent_actions_taken(&agent) == 1);
            assert!(agent::agent_last_action_epoch(&agent) == 1);

            test_scenario::return_to_sender(&scenario, cap);
            test_scenario::return_shared(agent);
            test_scenario::return_shared(world);
        };

        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 8, location = miniworld::agent_actions)] // ETileDead
    fun test_agent_defend_tile_dead() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup_world_with_agent(&mut scenario);

        // Pulse to advance epoch so rate limit passes
        do_pulse(&mut scenario);

        // Agent tries to defend an empty cell at (5, 5) — no tile there
        test_scenario::next_tx(&mut scenario, AGENT_RUNNER);
        {
            let mut world = test_scenario::take_shared<World>(&scenario);
            let mut agent = test_scenario::take_shared<Agent>(&scenario);
            let cap = test_scenario::take_from_sender<AgentCap>(&scenario);

            agent_actions::agent_defend(&mut world, &mut agent, &cap, 5, 5, test_scenario::ctx(&mut scenario));

            test_scenario::return_to_sender(&scenario, cap);
            test_scenario::return_shared(agent);
            test_scenario::return_shared(world);
        };

        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 5, location = miniworld::agent_actions)] // ETileNotAtRisk
    fun test_agent_defend_tile_not_at_risk() {
        // A 2x2 block is a stable still life — each cell has exactly 3 neighbors.
        let mut scenario = test_scenario::begin(ADMIN);
        setup_world_with_agent(&mut scenario);

        // Place a 2x2 block at (10,10)-(11,11) using different addresses
        place_at(&mut scenario, @0x10, 10, 10);
        place_at(&mut scenario, @0x11, 11, 10);
        place_at(&mut scenario, @0x12, 10, 11);
        place_at(&mut scenario, @0x13, 11, 11);

        // Pulse to advance epoch (block survives, epoch goes to 1)
        do_pulse(&mut scenario);

        // Agent tries to defend (10, 10) — it has 3 neighbors, NOT at risk
        test_scenario::next_tx(&mut scenario, AGENT_RUNNER);
        {
            let mut world = test_scenario::take_shared<World>(&scenario);
            let mut agent = test_scenario::take_shared<Agent>(&scenario);
            let cap = test_scenario::take_from_sender<AgentCap>(&scenario);

            agent_actions::agent_defend(&mut world, &mut agent, &cap, 10, 10, test_scenario::ctx(&mut scenario));

            test_scenario::return_to_sender(&scenario, cap);
            test_scenario::return_shared(agent);
            test_scenario::return_shared(world);
        };

        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 4, location = miniworld::agent_actions)] // EAgentRateLimited
    fun test_agent_defend_rate_limited() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup_world_with_agent(&mut scenario);

        // Place two isolated tiles (different addresses to avoid rate limit)
        place_at(&mut scenario, @0x10, 5, 5);
        place_at(&mut scenario, @0x11, 20, 20);

        // Pulse to advance epoch to 1
        do_pulse(&mut scenario);

        // Both tiles die on pulse. Place them again.
        place_at(&mut scenario, @0x12, 5, 5);
        place_at(&mut scenario, @0x13, 20, 20);

        // Agent defends first tile — succeeds (epoch 1 > last_action_epoch 0)
        test_scenario::next_tx(&mut scenario, AGENT_RUNNER);
        {
            let mut world = test_scenario::take_shared<World>(&scenario);
            let mut agent = test_scenario::take_shared<Agent>(&scenario);
            let cap = test_scenario::take_from_sender<AgentCap>(&scenario);

            agent_actions::agent_defend(&mut world, &mut agent, &cap, 5, 5, test_scenario::ctx(&mut scenario));

            test_scenario::return_to_sender(&scenario, cap);
            test_scenario::return_shared(agent);
            test_scenario::return_shared(world);
        };

        // Agent tries to defend second tile in same epoch — should fail
        test_scenario::next_tx(&mut scenario, AGENT_RUNNER);
        {
            let mut world = test_scenario::take_shared<World>(&scenario);
            let mut agent = test_scenario::take_shared<Agent>(&scenario);
            let cap = test_scenario::take_from_sender<AgentCap>(&scenario);

            agent_actions::agent_defend(&mut world, &mut agent, &cap, 20, 20, test_scenario::ctx(&mut scenario));

            test_scenario::return_to_sender(&scenario, cap);
            test_scenario::return_shared(agent);
            test_scenario::return_shared(world);
        };

        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 6, location = miniworld::agent_actions)] // EInvalidAgentCap
    fun test_agent_defend_wrong_cap() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup_registry(&mut scenario);

        // Create world 1 with agent (cap -> AGENT_RUNNER)
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut registry = test_scenario::take_shared<WorldRegistry>(&scenario);
            world::create_world_v2(&mut registry, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(registry);
        };
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut world = test_scenario::take_shared<World>(&scenario);
            agent::deploy_agent(&mut world, AGENT_RUNNER, 0, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(world);
        };

        // Create world 2 with agent (cap -> @0xA2)
        test_scenario::next_tx(&mut scenario, @0x20);
        {
            let mut registry = test_scenario::take_shared<WorldRegistry>(&scenario);
            world::create_world_v2(&mut registry, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(registry);
        };
        test_scenario::next_tx(&mut scenario, @0x20);
        {
            let mut world = test_scenario::take_shared<World>(&scenario);
            agent::deploy_agent(&mut world, @0xA2, 0, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(world);
        };

        // Place isolated tile on both worlds and pulse both to advance epochs.
        // We take both worlds explicitly to operate on each.
        test_scenario::next_tx(&mut scenario, @0x10);
        {
            // take_shared returns most recently created first — that's world2
            let mut world2 = test_scenario::take_shared<World>(&scenario);
            let mut world1 = test_scenario::take_shared<World>(&scenario);
            world::place_tile(&mut world1, 5, 5, 0, test_scenario::ctx(&mut scenario));
            world::place_tile(&mut world2, 5, 5, 0, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(world1);
            test_scenario::return_shared(world2);
        };

        // Pulse world1 (USER1 has its PulseCap)
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let world2 = test_scenario::take_shared<World>(&scenario);
            let mut world1 = test_scenario::take_shared<World>(&scenario);
            let cap = test_scenario::take_from_sender<PulseCap>(&scenario);
            world::pulse(&mut world1, &cap, test_scenario::ctx(&mut scenario));
            test_scenario::return_to_sender(&scenario, cap);
            test_scenario::return_shared(world1);
            test_scenario::return_shared(world2);
        };

        // Pulse world2 (@0x20 has its PulseCap)
        test_scenario::next_tx(&mut scenario, @0x20);
        {
            let mut world2 = test_scenario::take_shared<World>(&scenario);
            let world1 = test_scenario::take_shared<World>(&scenario);
            let cap = test_scenario::take_from_sender<PulseCap>(&scenario);
            world::pulse(&mut world2, &cap, test_scenario::ctx(&mut scenario));
            test_scenario::return_to_sender(&scenario, cap);
            test_scenario::return_shared(world1);
            test_scenario::return_shared(world2);
        };

        // Re-place isolated tile on world2 (it died on pulse)
        test_scenario::next_tx(&mut scenario, @0x11);
        {
            let mut world2 = test_scenario::take_shared<World>(&scenario);
            let world1 = test_scenario::take_shared<World>(&scenario);
            world::place_tile(&mut world2, 5, 5, 0, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(world1);
            test_scenario::return_shared(world2);
        };

        // @0xA2 has cap for agent2. Try to use it with agent1 -> EInvalidAgentCap
        // take_shared<Agent> returns most recently created first — that's agent2
        test_scenario::next_tx(&mut scenario, @0xA2);
        {
            let world2 = test_scenario::take_shared<World>(&scenario);
            let mut world1 = test_scenario::take_shared<World>(&scenario);
            let agent2 = test_scenario::take_shared<Agent>(&scenario);
            let mut agent1 = test_scenario::take_shared<Agent>(&scenario);
            let cap = test_scenario::take_from_sender<AgentCap>(&scenario);

            // cap belongs to agent2, but we pass agent1 -> mismatch
            agent_actions::agent_defend(&mut world1, &mut agent1, &cap, 5, 5, test_scenario::ctx(&mut scenario));

            test_scenario::return_to_sender(&scenario, cap);
            test_scenario::return_shared(agent1);
            test_scenario::return_shared(agent2);
            test_scenario::return_shared(world1);
            test_scenario::return_shared(world2);
        };

        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 7, location = miniworld::agent_actions)] // EWrongWorld
    fun test_agent_defend_wrong_world() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup_registry(&mut scenario);

        // Create world 1 with agent (cap -> AGENT_RUNNER)
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut registry = test_scenario::take_shared<WorldRegistry>(&scenario);
            world::create_world_v2(&mut registry, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(registry);
        };
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut world = test_scenario::take_shared<World>(&scenario);
            agent::deploy_agent(&mut world, AGENT_RUNNER, 0, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(world);
        };

        // Create world 2 (no agent needed, just a different world)
        test_scenario::next_tx(&mut scenario, @0x20);
        {
            let mut registry = test_scenario::take_shared<WorldRegistry>(&scenario);
            world::create_world_v2(&mut registry, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(registry);
        };

        // Place isolated tile on world2 and pulse world2 to advance its epoch.
        test_scenario::next_tx(&mut scenario, @0x10);
        {
            let mut world2 = test_scenario::take_shared<World>(&scenario);
            let world1 = test_scenario::take_shared<World>(&scenario);
            world::place_tile(&mut world2, 5, 5, 0, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(world1);
            test_scenario::return_shared(world2);
        };

        // Pulse world2 (@0x20 has its PulseCap)
        test_scenario::next_tx(&mut scenario, @0x20);
        {
            let mut world2 = test_scenario::take_shared<World>(&scenario);
            let world1 = test_scenario::take_shared<World>(&scenario);
            let cap = test_scenario::take_from_sender<PulseCap>(&scenario);
            world::pulse(&mut world2, &cap, test_scenario::ctx(&mut scenario));
            test_scenario::return_to_sender(&scenario, cap);
            test_scenario::return_shared(world1);
            test_scenario::return_shared(world2);
        };

        // Also pulse world1 so the agent can pass rate limit
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let world2 = test_scenario::take_shared<World>(&scenario);
            let mut world1 = test_scenario::take_shared<World>(&scenario);
            let cap = test_scenario::take_from_sender<PulseCap>(&scenario);
            world::pulse(&mut world1, &cap, test_scenario::ctx(&mut scenario));
            test_scenario::return_to_sender(&scenario, cap);
            test_scenario::return_shared(world1);
            test_scenario::return_shared(world2);
        };

        // Re-place isolated tile on world2 (it died in pulse)
        test_scenario::next_tx(&mut scenario, @0x11);
        {
            let mut world2 = test_scenario::take_shared<World>(&scenario);
            let world1 = test_scenario::take_shared<World>(&scenario);
            world::place_tile(&mut world2, 5, 5, 0, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(world1);
            test_scenario::return_shared(world2);
        };

        // Agent was deployed on world1. Try to defend a tile on world2 -> EWrongWorld
        test_scenario::next_tx(&mut scenario, AGENT_RUNNER);
        {
            let mut world2 = test_scenario::take_shared<World>(&scenario);
            let world1 = test_scenario::take_shared<World>(&scenario);
            let mut agent = test_scenario::take_shared<Agent>(&scenario);
            let cap = test_scenario::take_from_sender<AgentCap>(&scenario);

            // agent.world_id == world1.id, but we pass world2 -> EWrongWorld
            agent_actions::agent_defend(&mut world2, &mut agent, &cap, 5, 5, test_scenario::ctx(&mut scenario));

            test_scenario::return_to_sender(&scenario, cap);
            test_scenario::return_shared(agent);
            test_scenario::return_shared(world1);
            test_scenario::return_shared(world2);
        };

        test_scenario::end(scenario);
    }
}
