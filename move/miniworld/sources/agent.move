module miniworld::agent {
    use sui::event;
    use miniworld::world::{Self, World};

    // ── Error codes ──
    const ENotWorldOwner: u64 = 200;
    const EAgentAlreadyDeployed: u64 = 201;

    // ── Structs ──

    /// The agent object. Shared so both users (inspect) and agent-runner (act) can reference it.
    public struct Agent has key {
        id: UID,
        owner: address,
        world_id: ID,
        strategy: u8,
        actions_taken: u64,
        last_action_epoch: u64,
    }

    /// Capability that authorizes an agent to act. Owned by the agent-runner's keypair address.
    public struct AgentCap has key, store {
        id: UID,
        agent_id: ID,
    }

    // ── Events ──

    public struct AgentDeployedEvent has copy, drop {
        world_id: ID,
        agent_id: ID,
        owner: address,
        agent_address: address,
        strategy: u8,
    }

    // ── Entry functions ──

    /// Deploy an agent on a world. Caller must be the world owner (checked via WorldOwner dynamic field).
    /// Only one agent per world (checked via AgentDeployed dynamic field).
    /// Agent object is shared. AgentCap is transferred to agent_address (the agent-runner's keypair).
    public fun deploy_agent(
        world: &mut World,
        agent_address: address,
        strategy: u8,
        ctx: &mut TxContext,
    ) {
        // Check caller is world owner
        assert!(world::has_owner(world), ENotWorldOwner);
        assert!(world::world_owner(world) == ctx.sender(), ENotWorldOwner);

        // Check no agent already deployed
        assert!(!world::has_agent(world), EAgentAlreadyDeployed);

        let agent = Agent {
            id: object::new(ctx),
            owner: ctx.sender(),
            world_id: object::id(world),
            strategy,
            actions_taken: 0,
            last_action_epoch: 0,
        };

        let agent_id = object::id(&agent);

        // Mark world as having an agent
        world::set_agent_deployed(world, agent_id);

        let cap = AgentCap {
            id: object::new(ctx),
            agent_id,
        };

        event::emit(AgentDeployedEvent {
            world_id: object::id(world),
            agent_id,
            owner: ctx.sender(),
            agent_address,
            strategy,
        });

        transfer::share_object(agent);
        transfer::transfer(cap, agent_address);
    }

    // ── Public mutators ──

    /// Record an action on the agent. Called by world::agent_defend.
    public fun record_action(agent: &mut Agent, epoch: u64) {
        agent.actions_taken = agent.actions_taken + 1;
        agent.last_action_epoch = epoch;
    }

    // ── Public accessors ──

    public fun agent_owner(agent: &Agent): address { agent.owner }
    public fun agent_world_id(agent: &Agent): ID { agent.world_id }
    public fun agent_strategy(agent: &Agent): u8 { agent.strategy }
    public fun agent_actions_taken(agent: &Agent): u64 { agent.actions_taken }
    public fun agent_last_action_epoch(agent: &Agent): u64 { agent.last_action_epoch }
    public fun agent_cap_agent_id(cap: &AgentCap): ID { cap.agent_id }
}
