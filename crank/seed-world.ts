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
const keypair = Ed25519Keypair.fromSecretKey(
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
  console.log(`Wallet: ${keypair.toSuiAddress()}`);
  console.log("");

  // Collect all cells to place
  const allCells: { x: number; y: number; pattern: string }[] = [];
  for (const name of selectedPatterns) {
    const p = PATTERNS[name];
    if (!p) {
      console.error(`Unknown pattern: ${name}`);
      console.error(`Available: ${Object.keys(PATTERNS).join(", ")}`);
      process.exit(1);
    }
    for (const [cx, cy] of p.cells) {
      allCells.push({ x: p.offset[0] + cx, y: p.offset[1] + cy, pattern: name });
    }
  }

  console.log(`Total cells to place: ${allCells.length}`);

  // Build ONE Programmable Transaction Block with all placements.
  // Rate limit is 1 place per address per epoch, so we interleave:
  //   place_tile → pulse → place_tile → pulse → ...
  // Sui PTBs execute sequentially: the pulse advances the epoch mid-TX,
  // so the next place_tile sees the new epoch. All in one gas payment.
  const tx = new Transaction();
  tx.setGasBudget(50_000_000);

  // Start with a pulse to clear any rate limit from the current epoch
  tx.moveCall({
    target: `${PACKAGE_ID}::world::pulse`,
    arguments: [tx.object(WORLD_ID!), tx.object(PULSE_CAP_ID!)],
  });

  for (let i = 0; i < allCells.length; i++) {
    const cell = allCells[i];

    // Place tile
    tx.moveCall({
      target: `${PACKAGE_ID}::world::place_tile`,
      arguments: [
        tx.object(WORLD_ID!),
        tx.pure.u8(cell.x),
        tx.pure.u8(cell.y),
        tx.pure.u8(0),
      ],
    });

    // Pulse after each tile to advance epoch for the next placement
    if (i < allCells.length - 1) {
      tx.moveCall({
        target: `${PACKAGE_ID}::world::pulse`,
        arguments: [tx.object(WORLD_ID!), tx.object(PULSE_CAP_ID!)],
      });
    }

    console.log(`  [${i + 1}/${allCells.length}] (${cell.x}, ${cell.y}) [${cell.pattern}]`);
  }

  console.log("");
  console.log(`Submitting 1 transaction with ${allCells.length} placements + ${allCells.length - 1} pulses...`);

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true, showEvents: true },
  });
  await client.waitForTransaction({ digest: result.digest });

  const status = result.effects?.status?.status;
  if (status !== "success") {
    console.error(`Transaction FAILED: ${status}`);
    console.error(JSON.stringify(result.effects?.status, null, 2));
    process.exit(1);
  }

  console.log(`Transaction: ${result.digest}`);
  console.log(`Status: ${status}`);
  console.log(`Gas used: ${Number(result.effects?.gasUsed?.computationCost ?? 0) / 1e6}M computation`);

  // Read final state
  const obj = await client.getObject({ id: WORLD_ID, options: { showContent: true } });
  if (obj.data?.content?.dataType === "moveObject") {
    const fields = obj.data.content.fields as Record<string, any>;
    const grid = fields.grid as any[];
    const alive = grid.filter((c: any) => c !== null && c?.fields).length;
    console.log(`\nWorld: epoch=${fields.epoch}, alive=${alive}/${grid.length}`);
  }

  console.log("\n╔══════════════════════════════════════╗");
  console.log("║     Seeding Complete (1 TX)          ║");
  console.log("╚══════════════════════════════════════╝");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
