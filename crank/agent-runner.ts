import "dotenv/config";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";

// ── Configuration ──

const PACKAGE_ID = process.env.MINIWORLD_PACKAGE_ID;
const WORLD_ID = process.env.MINIWORLD_WORLD_ID;
const AGENT_ID = process.env.MINIWORLD_AGENT_ID;
const AGENT_CAP_ID = process.env.MINIWORLD_AGENT_CAP_ID;
const AGENT_SECRET = process.env.AGENT_SECRET_KEY;

if (!PACKAGE_ID || !WORLD_ID || !AGENT_ID || !AGENT_CAP_ID || !AGENT_SECRET) {
  console.error("Missing required env vars. Copy .env.agent.example to .env and fill in values:");
  console.error("  MINIWORLD_PACKAGE_ID, MINIWORLD_WORLD_ID, MINIWORLD_AGENT_ID, MINIWORLD_AGENT_CAP_ID, AGENT_SECRET_KEY");
  process.exit(1);
}

const PULSE_INTERVAL_MS = Math.max(5_000, Number(process.env.PULSE_INTERVAL_MS || 60_000) || 60_000);

// Sui keystore format: 1-byte scheme flag + 32-byte secret key
const keyBytes = Buffer.from(AGENT_SECRET, "base64");
const keypair = Ed25519Keypair.fromSecretKey(
  keyBytes.length === 33 ? keyBytes.subarray(1) : keyBytes,
);
const client = new SuiClient({ url: getFullnodeUrl("testnet") });

// ── State ──

let defending = false; // mutex to prevent stacking
let lastDefendedEpoch: number | null = null;

// ── World state reading ──

interface WorldState {
  epoch: number;
  width: number;
  height: number;
  grid: (null | { tileType: number; owner: string })[];
}

async function readWorldState(): Promise<WorldState> {
  const obj = await client.getObject({
    id: WORLD_ID,
    options: { showContent: true },
  });

  if (!obj.data?.content || obj.data.content.dataType !== "moveObject") {
    throw new Error("Failed to read World object");
  }

  const fields = obj.data.content.fields as Record<string, any>;
  const epoch = Number(fields.epoch);
  const width = Number(fields.width);
  const height = Number(fields.height);

  // Parse grid: vector<Option<Tile>> is serialized as array of { vec: [] } or { vec: [{ fields }] }
  const rawGrid = fields.grid as any[];
  const grid = rawGrid.map((cell: any) => {
    if (cell === null || cell === undefined) return null;
    // Sui serializes Option<T> as the value directly or null
    if (cell.fields) {
      return {
        tileType: Number(cell.fields.tile_type),
        owner: cell.fields.owner as string,
      };
    }
    return null;
  });

  return { epoch, width, height, grid };
}

// ── Guardian strategy ──

interface AtRiskTile {
  x: number;
  y: number;
  tileType: number;
  owner: string;
  neighbors: number;
}

/**
 * Count alive neighbors using toroidal wrapping.
 * MUST exactly match Move contract's gol_count_neighbors:
 *   dy in 0..2, dx in 0..2, skip (1,1)
 *   nx = (x + dx + w - 1) % w
 *   ny = (y + dy + h - 1) % h
 */
function countNeighbors(
  grid: (null | { tileType: number; owner: string })[],
  x: number,
  y: number,
  width: number,
  height: number,
): number {
  let count = 0;
  for (let dy = 0; dy < 3; dy++) {
    for (let dx = 0; dx < 3; dx++) {
      if (dy === 1 && dx === 1) continue;
      const nx = (x + dx + width - 1) % width;
      const ny = (y + dy + height - 1) % height;
      if (grid[ny * width + nx] !== null) count++;
    }
  }
  return count;
}

/**
 * Find all alive tiles that are "at risk" (would die next pulse).
 * A tile is at risk if neighbors < 2 or neighbors > 3 (GoL B3/S23 rules).
 * Sorted by priority: user-placed tiles (type 0) first, then by neighbor
 * count descending (closer to surviving = more impactful to save).
 */
function findAtRiskTiles(state: WorldState): AtRiskTile[] {
  const atRisk: AtRiskTile[] = [];

  for (let idx = 0; idx < state.grid.length; idx++) {
    const cell = state.grid[idx];
    if (cell === null) continue;

    const x = idx % state.width;
    const y = Math.floor(idx / state.width);
    const neighbors = countNeighbors(state.grid, x, y, state.width, state.height);

    if (neighbors < 2 || neighbors > 3) {
      atRisk.push({
        x,
        y,
        tileType: cell.tileType,
        owner: cell.owner,
        neighbors,
      });
    }
  }

  // Sort: user-placed tiles (type 0) first, then by neighbors descending
  atRisk.sort((a, b) => {
    if (a.tileType !== b.tileType) {
      return a.tileType - b.tileType; // type 0 before type 1
    }
    return b.neighbors - a.neighbors; // more neighbors = higher priority
  });

  return atRisk;
}

// ── agent_defend transaction ──

async function executeDefend(x: number, y: number): Promise<string> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::agent_actions::agent_defend`,
    arguments: [
      tx.object(WORLD_ID),
      tx.object(AGENT_ID),
      tx.object(AGENT_CAP_ID),
      tx.pure.u8(x),
      tx.pure.u8(y),
    ],
  });
  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true, showEvents: true },
  });
  await client.waitForTransaction({ digest: result.digest });
  return result.digest;
}

// ── Main loop ──

async function tick() {
  if (defending) {
    console.log("Skipping: previous defense still in progress");
    return;
  }

  defending = true;
  try {
    const state = await readWorldState();

    // Idempotency: skip if already defended this epoch
    if (lastDefendedEpoch !== null && state.epoch <= lastDefendedEpoch) {
      console.log(`Skipping: epoch ${state.epoch} already defended`);
      return;
    }

    const atRisk = findAtRiskTiles(state);
    if (atRisk.length === 0) {
      console.log(`Epoch ${state.epoch}: no tiles at risk`);
      lastDefendedEpoch = state.epoch;
      return;
    }

    // Pick the highest priority tile
    const target = atRisk[0];
    console.log(
      `Epoch ${state.epoch}: ${atRisk.length} tiles at risk. Defending (${target.x}, ${target.y}) [type=${target.tileType}, neighbors=${target.neighbors}]`,
    );

    try {
      const digest = await executeDefend(target.x, target.y);
      lastDefendedEpoch = state.epoch;
      console.log(`  Defense executed: ${digest}`);
    } catch (err: any) {
      // Handle known abort codes from agent_actions.move
      if (err.message?.includes("MoveAbort")) {
        if (err.message.includes("4"))
          console.log("  Rate limited (already defended this epoch)");
        else if (err.message.includes("5"))
          console.log("  Tile not at risk (state changed)");
        else if (err.message.includes("8"))
          console.log("  Tile is dead (pulse happened first)");
        else console.error("  Defense aborted:", err.message);
      } else {
        console.error("  Defense failed:", err);
      }
    }
  } catch (err) {
    console.error("Tick failed:", err);
  } finally {
    defending = false;
  }
}

async function main() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║   Miniworld Agent Runner (Guardian)  ║");
  console.log("╚══════════════════════════════════════╝");
  console.log(`Package:  ${PACKAGE_ID}`);
  console.log(`World:    ${WORLD_ID}`);
  console.log(`Agent:    ${AGENT_ID}`);
  console.log(`AgentCap: ${AGENT_CAP_ID}`);
  console.log(`Interval: ${PULSE_INTERVAL_MS}ms`);
  console.log(`Agent address: ${keypair.toSuiAddress()}`);
  console.log("");

  // Read initial world state
  try {
    const state = await readWorldState();
    console.log(
      `World state: epoch=${state.epoch}, grid=${state.width}x${state.height}`,
    );
    const alive = state.grid.filter((c) => c !== null).length;
    const atRisk = findAtRiskTiles(state);
    console.log(`Alive: ${alive}, At risk: ${atRisk.length}`);
  } catch (err) {
    console.error("Failed to read initial state:", err);
  }

  console.log("\nStarting guardian loop...\n");
  setInterval(tick, PULSE_INTERVAL_MS);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
