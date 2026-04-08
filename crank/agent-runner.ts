import "dotenv/config";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";

import type { WorldState } from "./lib/types.js";
import { storeBlob, readBlob } from "./lib/walrus.js";
import { readWorldState, countNeighbors } from "./lib/world-state.js";

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

const WALRUS_PUBLISHER_URL =
  process.env.WALRUS_PUBLISHER_URL ||
  "https://publisher.walrus-testnet.walrus.space";
const WALRUS_AGGREGATOR_URL =
  process.env.WALRUS_AGGREGATOR_URL ||
  "https://aggregator.walrus-testnet.walrus.space";

// Sui keystore format: 1-byte scheme flag + 32-byte secret key
const keyBytes = Buffer.from(AGENT_SECRET, "base64");
const keypair = Ed25519Keypair.fromSecretKey(
  keyBytes.length === 33 ? keyBytes.subarray(1) : keyBytes,
);
const client = new SuiClient({ url: getFullnodeUrl("testnet") });

// ── Observation types ──

interface AgentObservation {
  epoch: number;
  timestamp: number;
  atRiskCount: number;
  savedTile: { x: number; y: number } | null;
  reason: string;
  aliveCount: number;
}

interface ObservationManifestEntry {
  epoch: number;
  blobId: string;
  timestamp: number;
}

// ── State ──

let defending = false; // mutex to prevent stacking
let lastDefendedEpoch: number | null = null;

let observationManifest: ObservationManifestEntry[] = [];
let observationManifestBlobId: string | null =
  process.env.WALRUS_AGENT_MANIFEST_BLOB_ID || null;

// ── Guardian strategy ──

interface AtRiskTile {
  x: number;
  y: number;
  tileType: number;
  owner: string;
  neighbors: number;
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

// ── Observation logging (best-effort) ──

async function logObservation(obs: AgentObservation): Promise<void> {
  try {
    const data = new TextEncoder().encode(JSON.stringify(obs));
    const blobId = await storeBlob(WALRUS_PUBLISHER_URL, data);

    observationManifest.push({
      epoch: obs.epoch,
      blobId,
      timestamp: obs.timestamp,
    });

    console.log(`  Observation stored: epoch=${obs.epoch} blobId=${blobId}`);

    // Publish manifest every 10 observations
    if (observationManifest.length % 10 === 0) {
      await publishObservationManifest();
    }
  } catch (err) {
    console.error("  Observation logging failed (non-fatal):", err);
  }
}

async function publishObservationManifest(): Promise<void> {
  try {
    const data = new TextEncoder().encode(JSON.stringify(observationManifest));
    observationManifestBlobId = await storeBlob(WALRUS_PUBLISHER_URL, data);
    console.log(
      `  Agent manifest published: blobId=${observationManifestBlobId} (${observationManifest.length} entries)`,
    );
    console.log(
      `  *** Set this in localStorage: miniworld_agent_manifest_<worldId> = ${observationManifestBlobId} ***`,
    );
  } catch (err) {
    console.error("  Agent manifest publish failed:", err);
  }
}

async function recoverObservationManifest(): Promise<void> {
  if (!observationManifestBlobId) return;
  try {
    const data = await readBlob(WALRUS_AGGREGATOR_URL, observationManifestBlobId);
    const text = new TextDecoder().decode(data);
    observationManifest = JSON.parse(text);
    console.log(`Recovered agent manifest: ${observationManifest.length} entries`);
  } catch (err) {
    console.log("No existing agent manifest to recover, starting fresh");
    observationManifest = [];
  }
}

// ── Main loop ──

async function tick() {
  if (defending) {
    console.log("Skipping: previous defense still in progress");
    return;
  }

  defending = true;
  try {
    const state = await readWorldState(client, WORLD_ID);

    // Idempotency: skip if already defended this epoch
    if (lastDefendedEpoch !== null && state.epoch <= lastDefendedEpoch) {
      console.log(`Skipping: epoch ${state.epoch} already defended`);
      return;
    }

    const aliveCount = state.grid.filter((c) => c !== null).length;
    const atRisk = findAtRiskTiles(state);

    if (atRisk.length === 0) {
      console.log(`Epoch ${state.epoch}: no tiles at risk`);
      lastDefendedEpoch = state.epoch;

      // Log observation (best-effort)
      await logObservation({
        epoch: state.epoch,
        timestamp: Date.now(),
        atRiskCount: 0,
        savedTile: null,
        reason: "no tiles at risk",
        aliveCount,
      });
      return;
    }

    // Pick the highest priority tile
    const target = atRisk[0];
    console.log(
      `Epoch ${state.epoch}: ${atRisk.length} tiles at risk. Defending (${target.x}, ${target.y}) [type=${target.tileType}, neighbors=${target.neighbors}]`,
    );

    let reason = `defended (${target.x},${target.y})`;

    try {
      const digest = await executeDefend(target.x, target.y);
      lastDefendedEpoch = state.epoch;
      console.log(`  Defense executed: ${digest}`);
    } catch (err: any) {
      // Handle known abort codes from agent_actions.move
      if (err.message?.includes("MoveAbort")) {
        if (err.message.includes("4")) {
          console.log("  Rate limited (already defended this epoch)");
          reason = "rate limited";
        } else if (err.message.includes("5")) {
          console.log("  Tile not at risk (state changed)");
          reason = "tile no longer at risk";
        } else if (err.message.includes("8")) {
          console.log("  Tile is dead (pulse happened first)");
          reason = "tile died before defense";
        } else {
          console.error("  Defense aborted:", err.message);
          reason = `aborted: ${err.message}`;
        }
      } else {
        console.error("  Defense failed:", err);
        reason = "defense tx failed";
      }
    }

    // Log observation (best-effort)
    await logObservation({
      epoch: state.epoch,
      timestamp: Date.now(),
      atRiskCount: atRisk.length,
      savedTile: reason.startsWith("defended") ? { x: target.x, y: target.y } : null,
      reason,
      aliveCount,
    });
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
  console.log(`Walrus publisher: ${WALRUS_PUBLISHER_URL}`);
  console.log(`Walrus aggregator: ${WALRUS_AGGREGATOR_URL}`);
  if (observationManifestBlobId) {
    console.log(`Agent manifest: ${observationManifestBlobId}`);
  }
  console.log("");

  // Attempt manifest recovery
  await recoverObservationManifest();

  // Read initial world state
  try {
    const state = await readWorldState(client, WORLD_ID);
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
