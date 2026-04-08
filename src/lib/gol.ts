// Game of Life neighbor counting — MUST match Move contract's gol_count_neighbors exactly
// Uses toroidal wrapping: (x + dx + w - 1) % w where dx goes 0,1,2 (representing -1,0,+1)
export function countNeighbors(
  grid: (any | null)[],
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

export type CellPrediction = 'safe' | 'at-risk' | 'doomed' | 'birth' | 'dead' | 'raider';

// Compute prediction for every cell in the grid
export function predictGrid(
  grid: (any | null)[],
  width: number,
  height: number,
): CellPrediction[] {
  const predictions: CellPrediction[] = [];
  for (let i = 0; i < grid.length; i++) {
    const x = i % width;
    const y = Math.floor(i / width);
    const neighbors = countNeighbors(grid, x, y, width, height);
    const alive = grid[i] !== null;
    const isRaider = alive && grid[i]?.tileType === 2;

    if (isRaider) {
      predictions.push('raider');
    } else if (alive) {
      if (neighbors === 2 || neighbors === 3) {
        predictions.push('safe');      // Will survive
      } else if (neighbors === 1 || neighbors === 4) {
        predictions.push('at-risk');   // Will die (border case)
      } else {
        predictions.push('doomed');    // Will definitely die (0 or 5+ neighbors)
      }
    } else {
      if (neighbors === 3) {
        predictions.push('birth');     // Will be born
      } else {
        predictions.push('dead');      // Stays dead
      }
    }
  }
  return predictions;
}
