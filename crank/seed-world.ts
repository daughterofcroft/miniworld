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
// Each pattern is an array of [x, y] coordinates.
// Patterns are placed at an offset so they don't overlap.

const PATTERNS: Record<string, { offset: [number, number]; cells: [number, number][] }> = {
  // Glider: travels diagonally. The signature GoL pattern.
  glider: {
    offset: [2, 2],
    cells: [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]],
  },
  // Block: 2x2 still life. Survives forever.
  block: {
    offset: [20, 2],
    cells: [[0, 0], [1, 0], [0, 1], [1, 1]],
  },
  // Blinker: 3-cell oscillator. Toggles horizontal/vertical every pulse.
  blinker: {
    offset: [10, 10],
    cells: [[0, 0], [1, 0], [2, 0]],
  },
  // R-pentomino: 5 cells that explode into chaos for ~1100 generations.
  // The most famous "methuselah" pattern. On a 32x32 toroidal grid it
  // creates beautiful sustained activity.
  rpentomino: {
    offset: [15, 15],
    cells: [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]],
  },
  // Beacon: 4-cell oscillator (period 2).
  beacon: {
    offset: [25, 15],
    cells: [[0, 0], [1, 0], [0, 1], [3, 2], [2, 3], [3, 3]],
  },
  // Lightweight spaceship (LWSS): travels horizontally.
  lwss: {
    offset: [4, 22],
    cells: [[0, 0], [3, 0], [4, 1], [0, 2], [4, 2], [1, 3], [2, 3], [3, 3], [4, 3]],
  },
};

// ── Helpers ──

async function placeTile(x: number, y: number): Promise<string> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::world::place_tile`,
    arguments: [
      tx.object(WORLD_ID),
      tx.pure.u8(x),
      tx.pure.u8(y),
      tx.pure.u8(0),
    ],
  });
  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });
  await client.waitForTransaction({ digest: result.digest });
  return result.digest;
}

async function pulse(): Promise<string> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::world::pulse`,
    arguments: [tx.object(WORLD_ID), tx.object(PULSE_CAP_ID)],
  });
  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });
  await client.waitForTransaction({ digest: result.digest });
  return result.digest;
}

async function getEpoch(): Promise<number> {
  const obj = await client.getObject({
    id: WORLD_ID,
    options: { showContent: true },
  });
  if (obj.data?.content?.dataType === "moveObject") {
    return Number((obj.data.content.fields as Record<string, any>).epoch);
  }
  return 0;
}

// ── Main ──

async function main() {
  const patternNames = process.argv.slice(2);
  const selectedPatterns =
    patternNames.length > 0
      ? patternNames
      : Object.keys(PATTERNS);

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
      allCells.push({
        x: p.offset[0] + cx,
        y: p.offset[1] + cy,
        pattern: name,
      });
    }
  }

  console.log(`Total cells to place: ${allCells.length}`);
  console.log(`Requires ${allCells.length} place_tile txs + ${allCells.length} pulse txs`);
  console.log("");

  const startEpoch = await getEpoch();
  console.log(`Current epoch: ${startEpoch}`);
  console.log("");

  // Place one tile per epoch (rate limit: 1 per address per epoch)
  for (let i = 0; i < allCells.length; i++) {
    const cell = allCells[i];
    const progress = `[${i + 1}/${allCells.length}]`;

    try {
      const digest = await placeTile(cell.x, cell.y);
      console.log(`${progress} Placed (${cell.x}, ${cell.y}) [${cell.pattern}] — ${digest.slice(0, 12)}...`);
    } catch (err: any) {
      console.error(`${progress} FAILED (${cell.x}, ${cell.y}): ${err.message?.slice(0, 80)}`);
    }

    // Pulse to advance epoch (allows next placement)
    if (i < allCells.length - 1) {
      try {
        const digest = await pulse();
        console.log(`       Pulse — ${digest.slice(0, 12)}...`);
      } catch (err: any) {
        console.error(`       Pulse FAILED: ${err.message?.slice(0, 80)}`);
        console.error("       Cannot continue without advancing epoch. Stopping.");
        break;
      }
    }
  }

  const finalEpoch = await getEpoch();
  console.log("");
  console.log("╔══════════════════════════════════════╗");
  console.log("║     Seeding Complete                 ║");
  console.log("╚══════════════════════════════════════╝");
  console.log(`Epoch: ${startEpoch} → ${finalEpoch}`);
  console.log(`Cells placed: ${allCells.length}`);
  console.log("");
  console.log("Run the crank to watch them evolve:");
  console.log("  pnpm crank");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
