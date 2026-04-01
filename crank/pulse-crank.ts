import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";

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

const keypair = Ed25519Keypair.fromSecretKey(
  Buffer.from(CRANK_SECRET, "base64"),
);
const client = new SuiClient({ url: getFullnodeUrl("testnet") });

// ── State ──

let pulseCount = 0;
let pulsing = false; // mutex to prevent stacking
let lastPulsedEpoch: number | null = null;

interface SnapshotManifestEntry {
  epoch: number;
  blobId: string;
  timestamp: number;
}

let manifest: SnapshotManifestEntry[] = [];
let manifestBlobId: string | null = process.env.WALRUS_MANIFEST_BLOB_ID || null;

// ── Walrus helpers ──

async function storeBlob(data: Uint8Array): Promise<string> {
  const response = await fetch(`${WALRUS_PUBLISHER_URL}/v1/blobs`, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: data,
  });
  if (!response.ok) {
    throw new Error(`Walrus store failed: ${response.status} ${response.statusText}`);
  }
  const result = await response.json();
  // Walrus returns { newlyCreated: { blobObject: { blobId } } } or { alreadyCertified: { blobId } }
  if (result.newlyCreated) {
    return result.newlyCreated.blobObject.blobId;
  }
  if (result.alreadyCertified) {
    return result.alreadyCertified.blobId;
  }
  throw new Error(`Unexpected Walrus response: ${JSON.stringify(result)}`);
}

async function readBlob(blobId: string): Promise<Uint8Array> {
  const response = await fetch(
    `${WALRUS_AGGREGATOR_URL}/v1/blobs/${blobId}`,
  );
  if (!response.ok) {
    throw new Error(`Walrus read failed: ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

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
    const blobId = await storeBlob(data);

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
    manifestBlobId = await storeBlob(data);
    console.log(`  Manifest published: blobId=${manifestBlobId} (${manifest.length} entries)`);
  } catch (err) {
    console.error("  Manifest publish failed:", err);
  }
}

// ── Recovery ──

async function recoverManifest(): Promise<void> {
  if (!manifestBlobId) return;
  try {
    const data = await readBlob(manifestBlobId);
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
    const state = await readWorldState();
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
      const updatedState = await readWorldState();
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
    const state = await readWorldState();
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
