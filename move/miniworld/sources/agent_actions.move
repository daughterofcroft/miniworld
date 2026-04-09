module miniworld::agent_actions {
    use sui::event;
    use miniworld::world::{Self, World};
    use miniworld::agent::{Self, Agent, AgentCap};

    // ── Error codes ──
    const EAgentRateLimited: u64 = 4;
    const ETileNotAtRisk: u64 = 5;
    const EInvalidAgentCap: u64 = 6;
    const EWrongWorld: u64 = 7;
    const ETileDead: u64 = 8;
    const EInvalidCoordinate: u64 = 9;
    const EAgentRevoked: u64 = 11;

    // ── Events ──

    /// Emitted when an agent defends a tile.
    public struct AgentAction has copy, drop {
        world_id: ID,
        agent_id: ID,
        x: u8,
        y: u8,
        epoch: u64,
    }

    // ── Functions ──

    /// Agent defends a tile at (x, y) by recording a defense action.
    /// Validates: correct cap, correct world, rate limit, tile alive, tile at risk.
    /// The tile is "at risk" if it would die next pulse (neighbors < 2 or > 3).
    public fun agent_defend(
        world: &mut World,
        agent: &mut Agent,
        cap: &AgentCap,
        x: u8,
        y: u8,
        _ctx: &mut TxContext,
    ) {
        // Check agent is not revoked
        assert!(!agent::is_revoked(agent), EAgentRevoked);

        // Validate cap matches agent
        assert!(agent::agent_cap_agent_id(cap) == object::id(agent), EInvalidAgentCap);

        // Validate agent is for this world
        assert!(agent::agent_world_id(agent) == object::id(world), EWrongWorld);

        // Rate limit: 1 action per epoch
        assert!(agent::agent_last_action_epoch(agent) < world::world_epoch(world), EAgentRateLimited);

        // Validate coordinates
        let width = world::world_width(world);
        let height = world::world_height(world);
        assert!(x < width && y < height, EInvalidCoordinate);

        // Check tile is alive
        let idx = world::to_index(x, y, width);
        assert!(world::is_cell_alive(world, idx), ETileDead);

        // Check tile is at risk (would die next pulse: neighbors < 2 or > 3)
        let neighbors = world::count_neighbors(
            world::borrow_grid(world),
            x as u64,
            y as u64,
            width as u64,
            height as u64,
        );
        assert!(neighbors < 2 || neighbors > 3, ETileNotAtRisk);

        // Record action on agent
        agent::record_action(agent, world::world_epoch(world));

        // Emit event
        event::emit(AgentAction {
            world_id: object::id(world),
            agent_id: object::id(agent),
            x,
            y,
            epoch: world::world_epoch(world),
        });
    }
}
