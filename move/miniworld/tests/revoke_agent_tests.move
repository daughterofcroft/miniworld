#[test_only]
module miniworld::revoke_agent_tests {
    use sui::test_scenario;
    use miniworld::world::{Self, World};
    use miniworld::world_registry::{Self, WorldRegistry};
    use miniworld::agent::{Self, Agent, AgentCap};
    use miniworld::agent_actions;

    const ADMIN: address = @0xAD;
    const USER1: address = @0x1;
    const USER2: address = @0x2;
    const AGENT_RUNNER: address = @0xA1;

    // Helper: set up registry
    fun setup_registry(scenario: &mut test_scenario::Scenario) {
        test_scenario::next_tx(scenario, ADMIN);
        {
            world_registry::test_create_registry(test_scenario::ctx(scenario));
        };
    }

    // Helper: create world via v2 and deploy agent
    fun setup_world_with_agent(scenario: &mut test_scenario::Scenario) {
        // USER1 creates a world
        test_scenario::next_tx(scenario, USER1);
        {
            let mut registry = test_scenario::take_shared<WorldRegistry>(scenario);
            world::create_world_v2(&mut registry, test_scenario::ctx(scenario));
            test_scenario::return_shared(registry);
        };

        // USER1 deploys an agent
        test_scenario::next_tx(scenario, USER1);
        {
            let mut world = test_scenario::take_shared<World>(scenario);
            agent::deploy_agent(&mut world, AGENT_RUNNER, 0, test_scenario::ctx(scenario));
            test_scenario::return_shared(world);
        };
    }

    #[test]
    fun test_revoke_agent_happy_path() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup_registry(&mut scenario);
        setup_world_with_agent(&mut scenario);

        // USER1 revokes the agent
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut world = test_scenario::take_shared<World>(&scenario);
            let mut agent = test_scenario::take_shared<Agent>(&scenario);

            assert!(world::has_agent(&world));
            assert!(!agent::is_revoked(&agent));

            agent::revoke_agent(&mut world, &mut agent, test_scenario::ctx(&mut scenario));

            assert!(!world::has_agent(&world));
            assert!(agent::is_revoked(&agent));

            test_scenario::return_shared(world);
            test_scenario::return_shared(agent);
        };

        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 200, location = miniworld::agent)] // ENotWorldOwner
    fun test_revoke_agent_not_owner() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup_registry(&mut scenario);
        setup_world_with_agent(&mut scenario);

        // USER2 (not owner) tries to revoke — should fail
        test_scenario::next_tx(&mut scenario, USER2);
        {
            let mut world = test_scenario::take_shared<World>(&scenario);
            let mut agent = test_scenario::take_shared<Agent>(&scenario);

            agent::revoke_agent(&mut world, &mut agent, test_scenario::ctx(&mut scenario));

            test_scenario::return_shared(world);
            test_scenario::return_shared(agent);
        };

        test_scenario::end(scenario);
    }

    #[test]
    fun test_deploy_after_revoke() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup_registry(&mut scenario);
        setup_world_with_agent(&mut scenario);

        // USER1 revokes the agent
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut world = test_scenario::take_shared<World>(&scenario);
            let mut agent = test_scenario::take_shared<Agent>(&scenario);

            agent::revoke_agent(&mut world, &mut agent, test_scenario::ctx(&mut scenario));

            test_scenario::return_shared(world);
            test_scenario::return_shared(agent);
        };

        // USER1 deploys a new agent — should succeed since slot is cleared
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut world = test_scenario::take_shared<World>(&scenario);
            assert!(!world::has_agent(&world));

            agent::deploy_agent(&mut world, AGENT_RUNNER, 1, test_scenario::ctx(&mut scenario));

            assert!(world::has_agent(&world));
            test_scenario::return_shared(world);
        };

        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 11, location = miniworld::agent_actions)] // EAgentRevoked
    fun test_agent_defend_revoked() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup_registry(&mut scenario);
        setup_world_with_agent(&mut scenario);

        // Place a tile so agent has something to defend
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut world = test_scenario::take_shared<World>(&scenario);
            world::place_tile(&mut world, 0, 0, 1, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(world);
        };

        // Revoke the agent
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut world = test_scenario::take_shared<World>(&scenario);
            let mut agent = test_scenario::take_shared<Agent>(&scenario);

            agent::revoke_agent(&mut world, &mut agent, test_scenario::ctx(&mut scenario));

            test_scenario::return_shared(world);
            test_scenario::return_shared(agent);
        };

        // Try to defend with revoked agent — should fail
        test_scenario::next_tx(&mut scenario, AGENT_RUNNER);
        {
            let mut world = test_scenario::take_shared<World>(&scenario);
            let mut agent = test_scenario::take_shared<Agent>(&scenario);
            let cap = test_scenario::take_from_sender<AgentCap>(&scenario);

            agent_actions::agent_defend(
                &mut world,
                &mut agent,
                &cap,
                0, 0,
                test_scenario::ctx(&mut scenario),
            );

            test_scenario::return_to_sender(&scenario, cap);
            test_scenario::return_shared(world);
            test_scenario::return_shared(agent);
        };

        test_scenario::end(scenario);
    }
}
