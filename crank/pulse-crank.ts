import "dotenv/config";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";

import type { SnapshotManifestEntry, WorldState } from "./lib/types.js";
import { storeBlob, readBlob } from "./lib/walrus.js";
import { readWorldState } from "./lib/world-state.js";

// ── Configuration ──

const PACKAGE_ID = process.env.MINIWORLD_PACKAGE_ID;
const WORLD_ID = process.env.MINIWORLD_WORLD_ID;
const PULSE_CAP_ID = process.env.MINIWORLD_PULSE_CAP_ID;
const CRANK_SECRET = process.env.CRANK_SECRET_KEY;

if (!PACKAGE_ID || !WORLD_ID || !PULSE_CAP_ID || !CRANK_SECRET) {
  console.error("Missing required env vars. Copy .env.example to .env and fill in values:");
  console.error("  MINIWORLD_PACKAGE_ID, MINIWORLD_WORLD_ID, MINIWORLD_PULSE_CAP_ID, CRANK_SECRET_KEY");
  process.exit(1);
}
const WALRUS_PUBLISHER_URL =
  process.env.WALRUS_PUBLISHER_URL ||
  "https://publisher.walrus-testnet.walrus.space";
const WALRUS_AGGREGATOR_URL =
  process.env.WALRUS_AGGREGATOR_URL ||
  "https://aggregator.walrus-testnet.walrus.space";
const PULSE_INTERVAL_MS = Math.max(5_000, Number(process.env.PULSE_INTERVAL_MS || 60_000) || 60_000);
const SNAPSHOT_EVERY_N = Math.max(1, Number(process.env.SNAPSHOT_EVERY_N || 10) || 10);

// Sui keystore format: 1-byte scheme flag + 32-byte secret key
const keyBytes = Buffer.from(CRANK_SECRET, "base64");
const keypair = Ed25519Keypair.fromSecretKey(
  keyBytes.length === 33 ? keyBytes.subarray(1) : keyBytes,
);
const client = new SuiClient({ url: getFullnodeUrl("testnet") });

// ── State ──

let pulseCount = 0;
let pulsing = false; // mutex to prevent stacking
let lastPulsedEpoch: number | null = null;

let manifest: SnapshotManifestEntry[] = [];
let manifestBlobId: string | null = process.env.WALRUS_MANIFEST_BLOB_ID || null;

// ── Pulse execution ──

async function executePulse(): Promise<string> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::world::pulse`,
    arguments: [tx.object(WORLD_ID), tx.object(PULSE_CAP_ID)],
  });
  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true, showEvents: true },
  });
  await client.waitForTransaction({ digest: result.digest });
  return result.digest;
}

// ── Snapshot ──

async function takeSnapshot(worldState: WorldState): Promise<string | null> {
  try {
    const snapshot = {
      epoch: worldState.epoch,
      timestamp: Date.now(),
      width: worldState.width,
      height: worldState.height,
      grid: worldState.grid,
    };

    const data = new TextEncoder().encode(JSON.stringify(snapshot));
    const blobId = await storeBlob(WALRUS_PUBLISHER_URL, data);

    manifest.push({
      epoch: worldState.epoch,
      blobId,
      timestamp: snapshot.timestamp,
    });

    console.log(
      `  Snapshot stored: epoch=${worldState.epoch} blobId=${blobId}`,
    );

    // Publish manifest every 10 snapshots (every 100 pulses)
    if (manifest.length % 10 === 0) {
      await publishManifest();
    }

    return blobId;
  } catch (err) {
    console.error("  Snapshot failed:", err);
    return null;
  }
}

async function publishManifest(): Promise<void> {
  try {
    const data = new TextEncoder().encode(JSON.stringify(manifest));
    manifestBlobId = await storeBlob(WALRUS_PUBLISHER_URL, data);
    console.log(`  Manifest published: blobId=${manifestBlobId} (${manifest.length} entries)`);
  } catch (err) {
    console.error("  Manifest publish failed:", err);
  }
}

// ── Recovery ──

async function recoverManifest(): Promise<void> {
  if (!manifestBlobId) return;
  try {
    const data = await readBlob(WALRUS_AGGREGATOR_URL, manifestBlobId);
    const text = new TextDecoder().decode(data);
    manifest = JSON.parse(text);
    console.log(`Recovered manifest: ${manifest.length} entries`);
  } catch (err) {
    console.log("No existing manifest to recover, starting fresh");
    manifest = [];
  }
}

// ── Main loop ──

async function tick() {
  if (pulsing) {
    console.log("Skipping: previous pulse still in progress");
    return;
  }

  pulsing = true;
  try {
    // Idempotency check: read current epoch, skip if we already pulsed it
    const state = await readWorldState(client, WORLD_ID);
    if (lastPulsedEpoch !== null && state.epoch <= lastPulsedEpoch) {
      console.log(`Skipping: epoch ${state.epoch} already pulsed (last: ${lastPulsedEpoch})`);
      return;
    }

    const digest = await executePulse();
    pulseCount++;
    lastPulsedEpoch = state.epoch + 1; // track the post-pulse epoch

    console.log(
      `Pulse #${pulseCount} executed: ${digest} (epoch ${state.epoch} -> ${state.epoch + 1})`,
    );

    // Take snapshot every Nth pulse
    if (pulseCount % SNAPSHOT_EVERY_N === 0) {
      // Re-read state after pulse to get updated grid
      const updatedState = await readWorldState(client, WORLD_ID);
      await takeSnapshot(updatedState);
    }
  } catch (err) {
    console.error("Pulse failed:", err);
  } finally {
    pulsing = false;
  }
}

async function main() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║     Miniworld Crank Started          ║");
  console.log("╚══════════════════════════════════════╝");
  console.log(`Package:  ${PACKAGE_ID}`);
  console.log(`World:    ${WORLD_ID}`);
  console.log(`PulseCap: ${PULSE_CAP_ID}`);
  console.log(`Interval: ${PULSE_INTERVAL_MS}ms`);
  console.log(`Snapshot: every ${SNAPSHOT_EVERY_N} pulses`);
  console.log(`Crank address: ${keypair.toSuiAddress()}`);
  console.log("");

  // Attempt manifest recovery
  await recoverManifest();

  // Read initial world state
  try {
    const state = await readWorldState(client, WORLD_ID);
    console.log(
      `World state: epoch=${state.epoch}, grid=${state.width}x${state.height}`,
    );
    const alive = state.grid.filter((c) => c !== null).length;
    console.log(`Alive cells: ${alive}/${state.grid.length}`);
  } catch (err) {
    console.error("Failed to read initial world state:", err);
    console.log("Crank will attempt pulses anyway...");
  }

  console.log("\nStarting pulse loop...\n");
  setInterval(tick, PULSE_INTERVAL_MS);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
