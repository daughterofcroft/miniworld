import "dotenv/config";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";

// ── Configuration ──

const PACKAGE_ID = process.env.MINIWORLD_PACKAGE_ID;
const WORLD_ID = process.env.MINIWORLD_WORLD_ID;
const PULSE_CAP_ID = process.env.MINIWORLD_PULSE_CAP_ID;
const CRANK_SECRET = process.env.CRANK_SECRET_KEY;

if (!PACKAGE_ID || !WORLD_ID || !PULSE_CAP_ID || !CRANK_SECRET) {
  console.error("Missing required env vars. Copy .env.example to .env and fill in values.");
  process.exit(1);
}

const keyBytes = Buffer.from(CRANK_SECRET, "base64");
const mainKeypair = Ed25519Keypair.fromSecretKey(
  keyBytes.length === 33 ? keyBytes.subarray(1) : keyBytes,
);
const client = new SuiClient({ url: getFullnodeUrl("testnet") });

// ── Classic Game of Life patterns ──

const PATTERNS: Record<string, { offset: [number, number]; cells: [number, number][] }> = {
  glider: {
    offset: [2, 2],
    cells: [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]],
  },
  block: {
    offset: [20, 2],
    cells: [[0, 0], [1, 0], [0, 1], [1, 1]],
  },
  blinker: {
    offset: [10, 10],
    cells: [[0, 0], [1, 0], [2, 0]],
  },
  rpentomino: {
    offset: [15, 15],
    cells: [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]],
  },
  beacon: {
    offset: [25, 15],
    cells: [[0, 0], [1, 0], [0, 1], [3, 2], [2, 3], [3, 3]],
  },
  lwss: {
    offset: [4, 22],
    cells: [[0, 0], [3, 0], [4, 1], [0, 2], [4, 2], [1, 3], [2, 3], [3, 3], [4, 3]],
  },
};

// ── Main ──

async function main() {
  const patternNames = process.argv.slice(2);
  const selectedPatterns =
    patternNames.length > 0 ? patternNames : Object.keys(PATTERNS);

  console.log("╔══════════════════════════════════════╗");
  console.log("║     Miniworld World Seeder           ║");
  console.log("╚══════════════════════════════════════╝");
  console.log(`Seeding patterns: ${selectedPatterns.join(", ")}`);
  console.log(`Wallet: ${mainKeypair.toSuiAddress()}`);
  console.log("");

  // Collect all cells
  const allCells: { x: number; y: number; pattern: string }[] = [];
  for (const name of selectedPatterns) {
    const p = PATTERNS[name];
    if (!p) {
      console.error(`Unknown pattern: ${name}. Available: ${Object.keys(PATTERNS).join(", ")}`);
      process.exit(1);
    }
    for (const [cx, cy] of p.cells) {
      allCells.push({ x: p.offset[0] + cx, y: p.offset[1] + cy, pattern: name });
    }
  }

  console.log(`Total cells: ${allCells.length}`);

  // Strategy: use multiple temporary keypairs so all tiles in one pattern
  // can be placed in the SAME epoch. GoL kills isolated tiles, so patterns
  // must land simultaneously. Each address gets 1 placement per epoch.
  //
  // Steps:
  // 1. Generate N temporary keypairs (one per tile)
  // 2. Fund each with a tiny SUI amount from the main wallet (one PTB)
  // 3. Each temp address places its tile (parallel TXs, same epoch)
  // 4. Main wallet pulses once to "activate" the pattern
  //
  // This uses 3 transactions total regardless of tile count.

  const tempKeypairs = allCells.map(() => new Ed25519Keypair());
  const fundAmount = 10_000_000; // 0.01 SUI per temp address (enough for 1 place_tile)

  // Step 1: Fund all temp addresses in one PTB
  console.log(`\nFunding ${tempKeypairs.length} temp addresses...`);
  const fundTx = new Transaction();
  for (const kp of tempKeypairs) {
    const [coin] = fundTx.splitCoins(fundTx.gas, [fundAmount]);
    fundTx.transferObjects([coin], kp.toSuiAddress());
  }

  const fundResult = await client.signAndExecuteTransaction({
    signer: mainKeypair,
    transaction: fundTx,
    options: { showEffects: true },
  });
  await client.waitForTransaction({ digest: fundResult.digest });

  if (fundResult.effects?.status?.status !== "success") {
    console.error("Funding FAILED:", fundResult.effects?.status);
    process.exit(1);
  }
  console.log(`  Funded — ${fundResult.digest.slice(0, 12)}...`);

  // Step 2: Pulse first to ensure clean epoch (clear main wallet rate limit)
  console.log("Pulsing to fresh epoch...");
  const pulseTx = new Transaction();
  pulseTx.moveCall({
    target: `${PACKAGE_ID}::world::pulse`,
    arguments: [pulseTx.object(WORLD_ID!), pulseTx.object(PULSE_CAP_ID!)],
  });
  const pulseResult = await client.signAndExecuteTransaction({
    signer: mainKeypair,
    transaction: pulseTx,
    options: { showEffects: true },
  });
  await client.waitForTransaction({ digest: pulseResult.digest });
  console.log(`  Pulsed — ${pulseResult.digest.slice(0, 12)}...`);

  // Step 3: All temp addresses place tiles simultaneously (parallel TXs, same epoch)
  console.log("Placing all tiles in parallel...");
  const placementPromises = allCells.map(async (cell, i) => {
    const kp = tempKeypairs[i];
    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::world::place_tile`,
      arguments: [
        tx.object(WORLD_ID!),
        tx.pure.u8(cell.x),
        tx.pure.u8(cell.y),
        tx.pure.u8(0),
      ],
    });

    try {
      const result = await client.signAndExecuteTransaction({
        signer: kp,
        transaction: tx,
        options: { showEffects: true },
      });
      await client.waitForTransaction({ digest: result.digest });
      const ok = result.effects?.status?.status === "success";
      console.log(`  ${ok ? "OK" : "FAIL"} (${cell.x},${cell.y}) [${cell.pattern}]`);
      return ok;
    } catch (err: any) {
      console.error(`  ERR (${cell.x},${cell.y}) [${cell.pattern}]: ${err.message?.slice(0, 60)}`);
      return false;
    }
  });

  const results = await Promise.all(placementPromises);
  const placed = results.filter(Boolean).length;

  // Read final state
  const obj = await client.getObject({ id: WORLD_ID!, options: { showContent: true } });
  if (obj.data?.content?.dataType === "moveObject") {
    const fields = obj.data.content.fields as Record<string, any>;
    const grid = fields.grid as any[];
    const alive = grid.filter((c: any) => c !== null && c?.fields).length;
    console.log(`\nWorld: epoch=${fields.epoch}, alive=${alive}/${grid.length}`);
  }

  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║  Seeded ${placed}/${allCells.length} tiles (3 TXs total)     ║`);
  console.log(`╚══════════════════════════════════════╝`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
