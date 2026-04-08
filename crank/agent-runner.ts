import "dotenv/config";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";

import type { GridCell, WorldState } from "./lib/types.js";
import { storeBlob, readBlob } from "./lib/walrus.js";
import { readWorldState, countNeighbors } from "./lib/world-state.js";

// ── Types ──

interface AgentConfig {
  worldId: string;
  agentId: string;
  agentCapId: string;
  name: string;
}

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

interface AgentRunState {
  config: AgentConfig;
  lastDefendedEpoch: number | null;
  defending: boolean;
  observationManifest: ObservationManifestEntry[];
  manifestBlobId: string | null;
}

interface AtRiskTile {
  x: number;
  y: number;
  tileType: number;
  owner: string;
  neighbors: number;
  priority: number;
}

// ── Crash recovery: manifest persistence ──

const MINIWORLD_DIR = join(homedir(), ".miniworld");

function loadAgentManifestId(agentId: string): string | null {
  const file = join(MINIWORLD_DIR, `agent-manifest-${agentId.slice(0, 16)}.txt`);
  try {
    return readFileSync(file, "utf-8").trim();
  } catch {
    return null;
  }
}

function saveAgentManifestId(agentId: string, blobId: string) {
  mkdirSync(MINIWORLD_DIR, { recursive: true });
  writeFileSync(
    join(MINIWORLD_DIR, `agent-manifest-${agentId.slice(0, 16)}.txt`),
    blobId,
  );
}

// ── Shared configuration ──

const PACKAGE_ID = process.env.MINIWORLD_PACKAGE_ID;
const AGENT_SECRET = process.env.AGENT_SECRET_KEY;

if (!PACKAGE_ID || !AGENT_SECRET) {
  console.error(
    "Missing required env vars: MINIWORLD_PACKAGE_ID, AGENT_SECRET_KEY",
  );
  process.exit(1);
}

const PULSE_INTERVAL_MS = Math.max(
  5_000,
  Number(process.env.PULSE_INTERVAL_MS || 60_000) || 60_000,
);

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

// ── Agent configuration (multi-agent or single-agent fallback) ──

let agentConfigs: AgentConfig[];
try {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const agentsPath = join(__dirname, "agents.json");
  agentConfigs = JSON.parse(readFileSync(agentsPath, "utf-8"));
  console.log(`Loaded ${agentConfigs.length} agent(s) from agents.json`);
} catch {
  // Fall back to single-agent env vars
  if (
    !process.env.MINIWORLD_WORLD_ID ||
    !process.env.MINIWORLD_AGENT_ID ||
    !process.env.MINIWORLD_AGENT_CAP_ID
  ) {
    console.error(
      "No agents.json and no MINIWORLD_WORLD_ID/MINIWORLD_AGENT_ID/MINIWORLD_AGENT_CAP_ID env vars",
    );
    process.exit(1);
  }
  agentConfigs = [
    {
      worldId: process.env.MINIWORLD_WORLD_ID,
      agentId: process.env.MINIWORLD_AGENT_ID,
      agentCapId: process.env.MINIWORLD_AGENT_CAP_ID,
      name: "Guardian Alpha",
    },
  ];
  console.log("Using single-agent mode from env vars");
}

// ── Per-agent state ──

const agents: AgentRunState[] = agentConfigs.map((config) => ({
  config,
  lastDefendedEpoch: null,
  defending: false,
  observationManifest: [],
  manifestBlobId: loadAgentManifestId(config.agentId),
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

// ── Guardian strategy ──

/**
 * Check if a tile at (x,y) has any raider neighbors (tile_type=2).
 */
function checkForRaiderNeighbors(
  grid: GridCell[],
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  for (let dy = 0; dy < 3; dy++) {
    for (let dx = 0; dx < 3; dx++) {
      if (dy === 1 && dx === 1) continue;
      const nx = (x + dx + width - 1) % width;
      const ny = (y + dy + height - 1) % height;
      const cell = grid[ny * width + nx];
      if (cell !== null && cell.tileType === 2) return true;
    }
  }
  return false;
}

/**
 * Find all alive tiles that are "at risk" (would die next pulse).
 * A tile is at risk if neighbors < 2 or neighbors > 3 (GoL B3/S23 rules).
 * Sorted by priority: raider-adjacent tiles boosted, user-placed tiles (type 0)
 * first, then by neighbor count descending.
 */
function findAtRiskTiles(state: WorldState): AtRiskTile[] {
  const atRisk: AtRiskTile[] = [];

  for (let idx = 0; idx < state.grid.length; idx++) {
    const cell = state.grid[idx];
    if (cell === null) continue;

    const x = idx % state.width;
    const y = Math.floor(idx / state.width);
    const neighbors = countNeighbors(
      state.grid,
      x,
      y,
      state.width,
      state.height,
    );

    if (neighbors < 2 || neighbors > 3) {
      // Base priority: user tiles (type 0) get 100, system tiles get 0
      let priority = cell.tileType === 0 ? 100 : 0;
      // More neighbors = closer to surviving = more impactful to save
      priority += neighbors;

      atRisk.push({
        x,
        y,
        tileType: cell.tileType,
        owner: cell.owner,
        neighbors,
        priority,
      });
    }
  }

  // Boost priority for tiles with raider neighbors
  for (const tile of atRisk) {
    const hasRaiderNeighbor = checkForRaiderNeighbors(
      state.grid,
      tile.x,
      tile.y,
      state.width,
      state.height,
    );
    if (hasRaiderNeighbor) {
      tile.priority += 10; // Boost priority — defending near raiders is more valuable
    }
  }

  // Sort by priority descending
  atRisk.sort((a, b) => b.priority - a.priority);

  return atRisk;
}

// ── agent_defend transaction ──

async function executeDefend(
  agent: AgentRunState,
  x: number,
  y: number,
): Promise<string> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::agent_actions::agent_defend`,
    arguments: [
      tx.object(agent.config.worldId),
      tx.object(agent.config.agentId),
      tx.object(agent.config.agentCapId),
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

async function logObservation(
  agent: AgentRunState,
  obs: AgentObservation,
): Promise<void> {
  try {
    const data = new TextEncoder().encode(JSON.stringify(obs));
    const blobId = await storeBlob(WALRUS_PUBLISHER_URL, data);

    agent.observationManifest.push({
      epoch: obs.epoch,
      blobId,
      timestamp: obs.timestamp,
    });

    console.log(
      `  [${agent.config.name}] Observation stored: epoch=${obs.epoch} blobId=${blobId}`,
    );

    // Publish manifest every 10 observations
    if (agent.observationManifest.length % 10 === 0) {
      await publishObservationManifest(agent);
    }
  } catch (err) {
    console.error(
      `  [${agent.config.name}] Observation logging failed (non-fatal):`,
      err,
    );
  }
}

async function publishObservationManifest(
  agent: AgentRunState,
): Promise<void> {
  try {
    const data = new TextEncoder().encode(
      JSON.stringify(agent.observationManifest),
    );
    agent.manifestBlobId = await storeBlob(WALRUS_PUBLISHER_URL, data);
    saveAgentManifestId(agent.config.agentId, agent.manifestBlobId);
    console.log(
      `  [${agent.config.name}] Manifest published: blobId=${agent.manifestBlobId} (${agent.observationManifest.length} entries)`,
    );
  } catch (err) {
    console.error(
      `  [${agent.config.name}] Manifest publish failed:`,
      err,
    );
  }
}

async function recoverObservationManifest(
  agent: AgentRunState,
): Promise<void> {
  if (!agent.manifestBlobId) return;
  try {
    const data = await readBlob(WALRUS_AGGREGATOR_URL, agent.manifestBlobId);
    const text = new TextDecoder().decode(data);
    agent.observationManifest = JSON.parse(text);
    console.log(
      `  [${agent.config.name}] Recovered manifest: ${agent.observationManifest.length} entries`,
    );
  } catch (err) {
    console.log(
      `  [${agent.config.name}] No existing manifest to recover, starting fresh`,
    );
    agent.observationManifest = [];
  }
}

// ── Per-agent tick ──

async function tickAgent(agent: AgentRunState): Promise<void> {
  if (agent.defending) {
    console.log(
      `[${agent.config.name}] Skipping: previous defense still in progress`,
    );
    return;
  }

  agent.defending = true;
  try {
    const state = await readWorldState(client, agent.config.worldId);

    // Idempotency: skip if already defended this epoch
    if (
      agent.lastDefendedEpoch !== null &&
      state.epoch <= agent.lastDefendedEpoch
    ) {
      console.log(
        `[${agent.config.name}] Skipping: epoch ${state.epoch} already defended`,
      );
      return;
    }

    const aliveCount = state.grid.filter((c) => c !== null).length;
    const atRisk = findAtRiskTiles(state);

    if (atRisk.length === 0) {
      console.log(`[${agent.config.name}] Epoch ${state.epoch}: no tiles at risk`);
      agent.lastDefendedEpoch = state.epoch;

      // Log observation (best-effort)
      await logObservation(agent, {
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
      `[${agent.config.name}] Epoch ${state.epoch}: ${atRisk.length} tiles at risk. Defending (${target.x}, ${target.y}) [type=${target.tileType}, neighbors=${target.neighbors}, priority=${target.priority}]`,
    );

    let reason = `defended (${target.x},${target.y})`;

    try {
      const digest = await executeDefend(agent, target.x, target.y);
      agent.lastDefendedEpoch = state.epoch;
      console.log(`  [${agent.config.name}] Defense executed: ${digest}`);
    } catch (err: any) {
      // Handle known abort codes from agent_actions.move
      if (err.message?.includes("MoveAbort")) {
        if (err.message.includes("4")) {
          console.log(
            `  [${agent.config.name}] Rate limited (already defended this epoch)`,
          );
          reason = "rate limited";
        } else if (err.message.includes("5")) {
          console.log(
            `  [${agent.config.name}] Tile not at risk (state changed)`,
          );
          reason = "tile no longer at risk";
        } else if (err.message.includes("8")) {
          console.log(
            `  [${agent.config.name}] Tile is dead (pulse happened first)`,
          );
          reason = "tile died before defense";
        } else {
          console.error(
            `  [${agent.config.name}] Defense aborted:`,
            err.message,
          );
          reason = `aborted: ${err.message}`;
        }
      } else {
        console.error(`  [${agent.config.name}] Defense failed:`, err);
        reason = "defense tx failed";
      }
    }

    // Log observation (best-effort)
    await logObservation(agent, {
      epoch: state.epoch,
      timestamp: Date.now(),
      atRiskCount: atRisk.length,
      savedTile: reason.startsWith("defended")
        ? { x: target.x, y: target.y }
        : null,
      reason,
      aliveCount,
    });
  } catch (err) {
    console.error(`[${agent.config.name}] Tick failed:`, err);
  } finally {
    agent.defending = false;
  }
}

// ── Round-robin loop ──

async function tick(): Promise<void> {
  for (const agent of agents) {
    if (!running) break;
    await tickAgent(agent);
  }
}

// ── Main ──

async function main() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║   Miniworld Agent Runner (Guardian)  ║");
  console.log("╚══════════════════════════════════════╝");
  console.log(`Package:  ${PACKAGE_ID}`);
  console.log(`Agents:   ${agentConfigs.length}`);
  console.log(`Interval: ${PULSE_INTERVAL_MS}ms`);
  console.log(`Agent address: ${keypair.toSuiAddress()}`);
  console.log(`Walrus publisher: ${WALRUS_PUBLISHER_URL}`);
  console.log(`Walrus aggregator: ${WALRUS_AGGREGATOR_URL}`);
  console.log("");

  // Initialize per-agent state
  for (const agent of agents) {
    console.log(
      `  ${agent.config.name}: agent=${agent.config.agentId.slice(0, 16)}... world=${agent.config.worldId.slice(0, 16)}...`,
    );
    await recoverObservationManifest(agent);

    // Read initial world state
    try {
      const state = await readWorldState(client, agent.config.worldId);
      console.log(
        `    epoch=${state.epoch}, grid=${state.width}x${state.height}`,
      );
      const alive = state.grid.filter((c) => c !== null).length;
      const atRisk = findAtRiskTiles(state);
      console.log(`    alive=${alive}, at risk=${atRisk.length}`);
    } catch (err) {
      console.error(`    Failed to read world state:`, err);
      console.log("    Will attempt defense anyway...");
    }
  }

  console.log("\nStarting guardian loop...\n");

  const intervalId = setInterval(async () => {
    if (!running) {
      clearInterval(intervalId);
      console.log("Agent runner stopped.");
      return;
    }
    await tick();
  }, PULSE_INTERVAL_MS);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
