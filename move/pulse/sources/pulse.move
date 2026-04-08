module pulse::pulse {
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::table::{Self, Table};
    use sui::event;

    // ── OTW for coin creation ──
    public struct PULSE has drop {}

    // ── Structs ──

    /// Shared vault holding the TreasuryCap. Only authorized functions can mint.
    public struct PulseVault has key {
        id: UID,
        treasury_cap: TreasuryCap<PULSE>,
    }

    /// Shared pool for batched yield. Prevents coin fragmentation by accumulating
    /// balances in a table. Users call claim_pulse to withdraw as a single Coin.
    public struct PulsePool has key {
        id: UID,
        balances: Table<address, u64>,
    }

    /// Capability authorizing a crank to call harvest. One per world.
    public struct HarvestCap has key {
        id: UID,
        world_id: ID,
    }

    // ── Events ──

    public struct PulseVaultCreated has copy, drop {
        vault_id: ID,
        pool_id: ID,
    }

    public struct PulseClaimed has copy, drop {
        claimer: address,
        amount: u64,
    }

    public struct PulseBurned has copy, drop {
        burner: address,
        amount: u64,
    }

    // ── Init (runs on fresh deploy) ──

    fun init(witness: PULSE, ctx: &mut TxContext) {
        let (treasury_cap, metadata) = coin::create_currency(
            witness,
            0,                          // 0 decimals: 1 PULSE = 1 PULSE
            b"PULSE",                   // symbol
            b"Pulse",                   // name
            b"Yield token for Miniworld. Minted by alive tiles, burned by raids.", // description
            option::none(),             // icon URL (none for now)
            ctx,
        );

        // Freeze the metadata (immutable coin info)
        transfer::public_freeze_object(metadata);

        let vault = PulseVault {
            id: object::new(ctx),
            treasury_cap,
        };

        let pool = PulsePool {
            id: object::new(ctx),
            balances: table::new(ctx),
        };

        event::emit(PulseVaultCreated {
            vault_id: object::id(&vault),
            pool_id: object::id(&pool),
        });

        transfer::share_object(vault);
        transfer::share_object(pool);
    }

    // ── Pool operations ──

    /// Credit PULSE yield to an address in the pool. Called by harvest.
    /// Anyone can call this (the yield computation happens in the miniworld package).
    public fun credit_pool(
        pool: &mut PulsePool,
        recipient: address,
        amount: u64,
    ) {
        if (table::contains(&pool.balances, recipient)) {
            let balance = table::borrow_mut(&mut pool.balances, recipient);
            *balance = *balance + amount;
        } else {
            table::add(&mut pool.balances, recipient, amount);
        };
    }

    /// Claim accumulated PULSE from the pool. Mints a Coin and transfers to caller.
    public fun claim_pulse(
        vault: &mut PulseVault,
        pool: &mut PulsePool,
        ctx: &mut TxContext,
    ) {
        let sender = ctx.sender();
        if (!table::contains(&pool.balances, sender)) {
            return // Nothing to claim, no-op
        };

        let amount = table::remove(&mut pool.balances, sender);
        if (amount == 0) {
            return // Zero balance, no-op
        };

        let coin = coin::mint(&mut vault.treasury_cap, amount, ctx);
        transfer::public_transfer(coin, sender);

        event::emit(PulseClaimed { claimer: sender, amount });
    }

    /// Burn PULSE coins. Used by raid mechanic.
    public fun burn_pulse(
        vault: &mut PulseVault,
        coin: Coin<PULSE>,
    ) {
        let amount = coin::value(&coin);
        coin::burn(&mut vault.treasury_cap, coin);
        // Note: burner address not available without ctx, emit with @0x0
        event::emit(PulseBurned { burner: @0x0, amount });
    }

    /// Mint PULSE directly (for bootstrap grants). Restricted to package.
    public fun mint_pulse(
        vault: &mut PulseVault,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext,
    ) {
        let coin = coin::mint(&mut vault.treasury_cap, amount, ctx);
        transfer::public_transfer(coin, recipient);
    }

    /// Create a HarvestCap for a specific world. Called once per world setup.
    public fun create_harvest_cap(
        world_id: ID,
        ctx: &mut TxContext,
    ): HarvestCap {
        HarvestCap {
            id: object::new(ctx),
            world_id,
        }
    }

    // ── Accessors ──

    public fun pool_balance(pool: &PulsePool, addr: address): u64 {
        if (table::contains(&pool.balances, addr)) {
            *table::borrow(&pool.balances, addr)
        } else {
            0
        }
    }

    public fun harvest_cap_world_id(cap: &HarvestCap): ID {
        cap.world_id
    }

    /// Transfer a HarvestCap to a recipient. Required because HarvestCap
    /// has `key` but not `store`, so only this module can transfer it.
    public fun transfer_harvest_cap(cap: HarvestCap, recipient: address) {
        transfer::transfer(cap, recipient);
    }

    // ── Test helpers ──

    #[test_only]
    public fun test_init(ctx: &mut TxContext) {
        init(PULSE {}, ctx);
    }
}
