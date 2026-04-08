#[test_only]
module miniworld::agent_tests {
    use sui::test_scenario;
    use miniworld::world::{Self, World};
    use miniworld::world_registry::{Self, WorldRegistry};
    use miniworld::agent::{Self, Agent, AgentCap};

    const ADMIN: address = @0xAD;
    const USER1: address = @0x1;
    const USER2: address = @0x2;
    const AGENT_RUNNER: address = @0xA1;

    // Helper: set up registry (same as world_v2_tests)
    fun setup_registry(scenario: &mut test_scenario::Scenario) {
        test_scenario::next_tx(scenario, ADMIN);
        {
            world_registry::test_create_registry(test_scenario::ctx(scenario));
        };
    }

    #[test]
    fun test_deploy_agent() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup_registry(&mut scenario);

        // USER1 creates a world via v2
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut registry = test_scenario::take_shared<WorldRegistry>(&scenario);
            world::create_world_v2(&mut registry, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(registry);
        };

        // USER1 deploys an agent
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut world = test_scenario::take_shared<World>(&scenario);
            agent::deploy_agent(&mut world, AGENT_RUNNER, 0, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(world);
        };

        // Verify Agent is shared with correct fields
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let world = test_scenario::take_shared<World>(&scenario);
            assert!(world::has_agent(&world));
            test_scenario::return_shared(world);

            let agent = test_scenario::take_shared<Agent>(&scenario);
            assert!(agent::agent_owner(&agent) == USER1);
            assert!(agent::agent_strategy(&agent) == 0);
            assert!(agent::agent_actions_taken(&agent) == 0);
            assert!(agent::agent_last_action_epoch(&agent) == 0);
            test_scenario::return_shared(agent);
        };

        // Verify AgentCap was transferred to AGENT_RUNNER
        test_scenario::next_tx(&mut scenario, AGENT_RUNNER);
        {
            let cap = test_scenario::take_from_sender<AgentCap>(&scenario);
            test_scenario::return_to_sender(&scenario, cap);
        };

        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 200, location = miniworld::agent)] // ENotWorldOwner
    fun test_deploy_agent_not_owner() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup_registry(&mut scenario);

        // USER1 creates a world
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut registry = test_scenario::take_shared<WorldRegistry>(&scenario);
            world::create_world_v2(&mut registry, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(registry);
        };

        // USER2 (not owner) tries to deploy agent — should fail
        test_scenario::next_tx(&mut scenario, USER2);
        {
            let mut world = test_scenario::take_shared<World>(&scenario);
            agent::deploy_agent(&mut world, AGENT_RUNNER, 0, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(world);
        };

        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 201, location = miniworld::agent)] // EAgentAlreadyDeployed
    fun test_deploy_agent_already_deployed() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup_registry(&mut scenario);

        // USER1 creates a world
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut registry = test_scenario::take_shared<WorldRegistry>(&scenario);
            world::create_world_v2(&mut registry, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(registry);
        };

        // USER1 deploys first agent
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut world = test_scenario::take_shared<World>(&scenario);
            agent::deploy_agent(&mut world, AGENT_RUNNER, 0, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(world);
        };

        // USER1 tries to deploy second agent — should fail
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut world = test_scenario::take_shared<World>(&scenario);
            agent::deploy_agent(&mut world, AGENT_RUNNER, 1, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(world);
        };

        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 200, location = miniworld::agent)] // ENotWorldOwner
    fun test_deploy_agent_no_owner() {
        let mut scenario = test_scenario::begin(ADMIN);

        // Create world via OLD create_world (no owner set)
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            world::create_world(test_scenario::ctx(&mut scenario));
        };

        // Try to deploy agent on unowned world — should fail
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut world = test_scenario::take_shared<World>(&scenario);
            agent::deploy_agent(&mut world, AGENT_RUNNER, 0, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(world);
        };

        test_scenario::end(scenario);
    }
}
