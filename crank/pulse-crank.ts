import "dotenv/config";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";

import type { SnapshotManifestEntry, WorldState } from "./lib/types.js";
import { storeBlob, readBlob } from "./lib/walrus.js";
import { readWorldState } from "./lib/world-state.js";

// ── Types ──

interface WorldConfig {
  worldId: string;
  pulseCapId: string;
  name: string;
}

interface WorldRunState {
  config: WorldConfig;
  lastPulsedEpoch: number | null;
  pulseCount: number;
  pulsing: boolean;
  manifest: SnapshotManifestEntry[];
  manifestBlobId: string | null;
}

// ── Crash recovery: manifest persistence ──

const MINIWORLD_DIR = join(homedir(), ".miniworld");

function loadManifestId(worldId: string): string | null {
  const file = join(MINIWORLD_DIR, `manifest-${worldId.slice(0, 16)}.txt`);
  try {
    return readFileSync(file, "utf-8").trim();
  } catch {
    return null;
  }
}

function saveManifestId(worldId: string, blobId: string) {
  mkdirSync(MINIWORLD_DIR, { recursive: true });
  writeFileSync(
    join(MINIWORLD_DIR, `manifest-${worldId.slice(0, 16)}.txt`),
    blobId,
  );
}

// ── Shared configuration ──

const CRANK_SECRET = process.env.CRANK_SECRET_KEY;
const PACKAGE_ID = process.env.MINIWORLD_PACKAGE_ID;

if (!PACKAGE_ID || !CRANK_SECRET) {
  console.error(
    "Missing required env vars: MINIWORLD_PACKAGE_ID, CRANK_SECRET_KEY",
  );
  process.exit(1);
}

const WALRUS_PUBLISHER_URL =
  process.env.WALRUS_PUBLISHER_URL ||
  "https://publisher.walrus-testnet.walrus.space";
const WALRUS_AGGREGATOR_URL =
  process.env.WALRUS_AGGREGATOR_URL ||
  "https://aggregator.walrus-testnet.walrus.space";
const PULSE_INTERVAL_MS = Math.max(
  5_000,
  Number(process.env.PULSE_INTERVAL_MS || 15_000) || 15_000,
);
const SNAPSHOT_EVERY_N = Math.max(
  1,
  Number(process.env.SNAPSHOT_EVERY_N || 10) || 10,
);

// Sui keystore format: 1-byte scheme flag + 32-byte secret key
const keyBytes = Buffer.from(CRANK_SECRET, "base64");
const keypair = Ed25519Keypair.fromSecretKey(
  keyBytes.length === 33 ? keyBytes.subarray(1) : keyBytes,
);
const client = new SuiClient({ url: getFullnodeUrl("testnet") });

// ── World configuration (multi-world or single-world fallback) ──

let worldConfigs: WorldConfig[];
try {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const worldsPath = join(__dirname, "worlds.json");
  worldConfigs = JSON.parse(readFileSync(worldsPath, "utf-8"));
  console.log(`Loaded ${worldConfigs.length} world(s) from worlds.json`);
} catch {
  // Fall back to single-world env vars
  if (!process.env.MINIWORLD_WORLD_ID || !process.env.MINIWORLD_PULSE_CAP_ID) {
    console.error(
      "No worlds.json and no MINIWORLD_WORLD_ID/MINIWORLD_PULSE_CAP_ID env vars",
    );
    process.exit(1);
  }
  worldConfigs = [
    {
      worldId: process.env.MINIWORLD_WORLD_ID,
      pulseCapId: process.env.MINIWORLD_PULSE_CAP_ID,
      name: "Default World",
    },
  ];
  console.log("Using single-world mode from env vars");
}

// ── Per-world state ──

const worlds: WorldRunState[] = worldConfigs.map((config) => ({
  config,
  lastPulsedEpoch: null,
  pulseCount: 0,
  pulsing: false,
  manifest: [],
  manifestBlobId: loadManifestId(config.worldId),
}));

// ── Graceful shutdown ──

let running = true;
process.on("SIGINT", () => {
  running = false;
  console.log("\nShutting down...");
});
process.on("SIGTERM", () => {
  running = false;
});

// ── Pulse execution ──

async function executePulse(worldId: string, pulseCapId: string): Promise<string> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::world::pulse`,
    arguments: [tx.object(worldId), tx.object(pulseCapId)],
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

async function takeSnapshot(
  ws: WorldRunState,
  worldState: WorldState,
): Promise<string | null> {
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

    ws.manifest.push({
      epoch: worldState.epoch,
      blobId,
      timestamp: snapshot.timestamp,
    });

    console.log(
      `  [${ws.config.name}] Snapshot stored: epoch=${worldState.epoch} blobId=${blobId}`,
    );

    // Publish manifest every 10 snapshots
    if (ws.manifest.length % 10 === 0) {
      await publishManifest(ws);
    }

    return blobId;
  } catch (err) {
    console.error(`  [${ws.config.name}] Snapshot failed:`, err);
    return null;
  }
}

async function publishManifest(ws: WorldRunState): Promise<void> {
  try {
    const data = new TextEncoder().encode(JSON.stringify(ws.manifest));
    ws.manifestBlobId = await storeBlob(WALRUS_PUBLISHER_URL, data);
    saveManifestId(ws.config.worldId, ws.manifestBlobId);
    console.log(
      `  [${ws.config.name}] Manifest published: blobId=${ws.manifestBlobId} (${ws.manifest.length} entries)`,
    );
  } catch (err) {
    console.error(`  [${ws.config.name}] Manifest publish failed:`, err);
  }
}

// ── Recovery ──

async function recoverManifest(ws: WorldRunState): Promise<void> {
  if (!ws.manifestBlobId) return;
  try {
    const data = await readBlob(WALRUS_AGGREGATOR_URL, ws.manifestBlobId);
    const text = new TextDecoder().decode(data);
    ws.manifest = JSON.parse(text);
    console.log(
      `  [${ws.config.name}] Recovered manifest: ${ws.manifest.length} entries`,
    );
  } catch (err) {
    console.log(
      `  [${ws.config.name}] No existing manifest to recover, starting fresh`,
    );
    ws.manifest = [];
  }
}

// ── Per-world tick ──

async function tickWorld(ws: WorldRunState): Promise<void> {
  if (ws.pulsing) {
    console.log(`[${ws.config.name}] Skipping: previous pulse still in progress`);
    return;
  }

  ws.pulsing = true;
  try {
    // Idempotency check: read current epoch, skip if we already pulsed it
    const state = await readWorldState(client, ws.config.worldId);
    if (ws.lastPulsedEpoch !== null && state.epoch <= ws.lastPulsedEpoch) {
      console.log(
        `[${ws.config.name}] Skipping: epoch ${state.epoch} already pulsed (last: ${ws.lastPulsedEpoch})`,
      );
      return;
    }

    const digest = await executePulse(ws.config.worldId, ws.config.pulseCapId);
    ws.pulseCount++;
    ws.lastPulsedEpoch = state.epoch + 1; // track the post-pulse epoch

    console.log(
      `[${ws.config.name}] Pulse #${ws.pulseCount}: ${digest} (epoch ${state.epoch} -> ${state.epoch + 1})`,
    );

    // Take snapshot every Nth pulse
    if (ws.pulseCount % SNAPSHOT_EVERY_N === 0) {
      // Re-read state after pulse to get updated grid
      const updatedState = await readWorldState(client, ws.config.worldId);
      await takeSnapshot(ws, updatedState);
    }
  } catch (err) {
    console.error(`[${ws.config.name}] Pulse failed:`, err);
  } finally {
    ws.pulsing = false;
  }
}

// ── Round-robin loop ──

async function tick(): Promise<void> {
  for (const ws of worlds) {
    if (!running) break;
    await tickWorld(ws);
  }
}

// ── Main ──

async function main() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║   Miniworld Crank (Multi-World)      ║");
  console.log("╚══════════════════════════════════════╝");
  console.log(`Package:  ${PACKAGE_ID}`);
  console.log(`Worlds:   ${worldConfigs.length}`);
  console.log(`Interval: ${PULSE_INTERVAL_MS}ms`);
  console.log(`Snapshot: every ${SNAPSHOT_EVERY_N} pulses`);
  console.log(`Crank address: ${keypair.toSuiAddress()}`);
  console.log("");

  // Initialize per-world state
  for (const ws of worlds) {
    console.log(`  ${ws.config.name}: ${ws.config.worldId.slice(0, 16)}...`);
    await recoverManifest(ws);

    // Read initial world state
    try {
      const state = await readWorldState(client, ws.config.worldId);
      console.log(
        `    epoch=${state.epoch}, grid=${state.width}x${state.height}`,
      );
      const alive = state.grid.filter((c) => c !== null).length;
      console.log(`    alive cells: ${alive}/${state.grid.length}`);
    } catch (err) {
      console.error(`    Failed to read world state:`, err);
      console.log("    Will attempt pulses anyway...");
    }
  }

  console.log("\nStarting pulse loop...\n");

  const intervalId = setInterval(async () => {
    if (!running) {
      clearInterval(intervalId);
      console.log("Crank stopped.");
      return;
    }
    await tick();
  }, PULSE_INTERVAL_MS);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
