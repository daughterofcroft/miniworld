module miniworld::events {
    use sui::event;

    /// Emitted when a tile is placed or overwrites an existing tile.
    public struct TilePlaced has copy, drop {
        x: u8,
        y: u8,
        tile_type: u8,
        owner: address,
        epoch: u64,
        previous_owner: Option<address>,
    }

    /// Emitted when a pulse completes.
    public struct PulseExecuted has copy, drop {
        epoch: u64,
        births: u16,
        deaths: u16,
        alive_count: u16,
    }

    public(package) fun emit_tile_placed(
        x: u8,
        y: u8,
        tile_type: u8,
        owner: address,
        epoch: u64,
        previous_owner: Option<address>,
    ) {
        event::emit(TilePlaced { x, y, tile_type, owner, epoch, previous_owner });
    }

    public(package) fun emit_pulse_executed(
        epoch: u64,
        births: u16,
        deaths: u16,
        alive_count: u16,
    ) {
        event::emit(PulseExecuted { epoch, births, deaths, alive_count });
    }
}
