#[test_only]
module pulse::pulse_tests {
    use sui::test_scenario;
    use sui::coin;
    use pulse::pulse::{Self, PulseVault, PulsePool, PULSE};

    const ADMIN: address = @0xAD;
    const USER1: address = @0x1;
    const USER2: address = @0x2;

    fun setup(scenario: &mut test_scenario::Scenario) {
        test_scenario::next_tx(scenario, ADMIN);
        {
            pulse::test_init(test_scenario::ctx(scenario));
        };
    }

    #[test]
    fun test_init_creates_vault_and_pool() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup(&mut scenario);

        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let vault = test_scenario::take_shared<PulseVault>(&scenario);
            let pool = test_scenario::take_shared<PulsePool>(&scenario);
            assert!(pulse::pool_balance(&pool, USER1) == 0);
            test_scenario::return_shared(vault);
            test_scenario::return_shared(pool);
        };

        test_scenario::end(scenario);
    }

    #[test]
    fun test_credit_and_claim() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup(&mut scenario);

        // Credit 100 PULSE to USER1
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut pool = test_scenario::take_shared<PulsePool>(&scenario);
            pulse::credit_pool(&mut pool, USER1, 100);
            assert!(pulse::pool_balance(&pool, USER1) == 100);
            test_scenario::return_shared(pool);
        };

        // USER1 claims
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut vault = test_scenario::take_shared<PulseVault>(&scenario);
            let mut pool = test_scenario::take_shared<PulsePool>(&scenario);
            pulse::claim_pulse(&mut vault, &mut pool, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(vault);
            test_scenario::return_shared(pool);
        };

        // Verify USER1 received the coin
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let coin = test_scenario::take_from_sender<coin::Coin<PULSE>>(&scenario);
            assert!(coin::value(&coin) == 100);
            test_scenario::return_to_sender(&scenario, coin);
        };

        test_scenario::end(scenario);
    }

    #[test]
    fun test_credit_multiple_addresses() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup(&mut scenario);

        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut pool = test_scenario::take_shared<PulsePool>(&scenario);
            pulse::credit_pool(&mut pool, USER1, 50);
            pulse::credit_pool(&mut pool, USER2, 75);
            pulse::credit_pool(&mut pool, USER1, 25); // accumulate
            assert!(pulse::pool_balance(&pool, USER1) == 75);
            assert!(pulse::pool_balance(&pool, USER2) == 75);
            test_scenario::return_shared(pool);
        };

        test_scenario::end(scenario);
    }

    #[test]
    fun test_claim_zero_balance() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup(&mut scenario);

        // USER1 claims with no balance (should be no-op)
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut vault = test_scenario::take_shared<PulseVault>(&scenario);
            let mut pool = test_scenario::take_shared<PulsePool>(&scenario);
            pulse::claim_pulse(&mut vault, &mut pool, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(vault);
            test_scenario::return_shared(pool);
        };

        // No coin should exist for USER1
        test_scenario::next_tx(&mut scenario, USER1);
        {
            assert!(!test_scenario::has_most_recent_for_sender<coin::Coin<PULSE>>(&scenario));
        };

        test_scenario::end(scenario);
    }

    #[test]
    fun test_burn_pulse() {
        let mut scenario = test_scenario::begin(ADMIN);
        setup(&mut scenario);

        // Mint some PULSE to USER1
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<PulseVault>(&scenario);
            pulse::mint_pulse(&mut vault, 100, USER1, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(vault);
        };

        // USER1 burns it
        test_scenario::next_tx(&mut scenario, USER1);
        {
            let mut vault = test_scenario::take_shared<PulseVault>(&scenario);
            let coin = test_scenario::take_from_sender<coin::Coin<PULSE>>(&scenario);
            pulse::burn_pulse(&mut vault, coin);
            test_scenario::return_shared(vault);
        };

        // No coin should remain
        test_scenario::next_tx(&mut scenario, USER1);
        {
            assert!(!test_scenario::has_most_recent_for_sender<coin::Coin<PULSE>>(&scenario));
        };

        test_scenario::end(scenario);
    }
}
