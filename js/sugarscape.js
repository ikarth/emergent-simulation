// sugarscape.js — Sugarscape agents (Epstein & Axtell, Growing Artificial Societies)
//
// Agents move on the field grid, seeking sugar (stored in fields.food).
// Each agent has a vision range, a metabolism rate, and a sugar reserve.
// They die when their reserve hits zero.
//
// Sugar grows back toward a landscape capacity that is set by initSugarLandscape().
// Call tickSugar(fields) every draw frame to handle regrowth.

const SUGAR = {
  visionMin:      1,    // grid cells of look-ahead in cardinal directions
  visionMax:      6,
  metabolismMin:  1,    // sugar consumed per move
  metabolismMax:  4,
  endowmentMin:   5,    // starting sugar reserve
  endowmentMax:   25,
  moveInterval:   16,    // frames between moves (lower = faster agents)
  regrowthRate:   0.0043, // food restored per frame (toward landscape capacity)
  sugarScale:     12,   // multiplier: food field value → sugar units gained
  peakSpread:     0.12, // Gaussian sigma as fraction of canvas shorter dimension
  noiseScale:     0.20, // Perlin noise sampling frequency — lower = larger patches
  noiseThreshold: 0.50, // noise below this value is zeroed out; raises sparseness
  easing:         0.28, // lerp factor per frame toward move target (higher = snappier)
};

// The maximum sugar capacity at each grid cell — set by initSugarLandscape().
// Null until initialized; tickSugar is a no-op while null.
let sugarCapacity = null;
let sugarHue      = 45; // warm amber — overridden by initSugarLandscape

// Initialize the sugar landscape with two Gaussian peaks and seed the food field.
// Call this before spawning agents.
function initSugarLandscape(fields, hue = 45) {
  sugarHue      = hue;
  sugarCapacity = new Float32Array(fields.cols * fields.rows);

  const sigma = Math.min(fields.cols, fields.rows) * SUGAR.peakSpread;
  const peaks = [
    { col: fields.cols * 0.28, row: fields.rows * 0.28 },
    { col: fields.cols * 0.72, row: fields.rows * 0.72 },
  ];
  // Random offset so each call gets a different patch layout
  const nOff = random(1000);

  for (let r = 0; r < fields.rows; r++) {
    for (let c = 0; c < fields.cols; c++) {
      let v = 0;
      for (const p of peaks) {
        const dx = c - p.col, dy = r - p.row;
        v = Math.max(v, Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma)));
      }
      // Perlin noise mask: cells below threshold are zeroed, above get full peak value
      const n = noise(c * SUGAR.noiseScale + nOff, r * SUGAR.noiseScale);
      if (n < SUGAR.noiseThreshold) v = 0;
      const i = fields.idx(c, r);
      sugarCapacity[i] = v;
      fields.food[i]    = Math.max(fields.food[i], v);
      fields.foodHue[i] = hue;
    }
  }
}

// Regrow sugar toward landscape capacity. Call once per draw frame.
function tickSugar(fields) {
  if (!sugarCapacity) return;
  for (let i = 0; i < fields.food.length; i++) {
    if (sugarCapacity[i] > 0 && fields.food[i] < sugarCapacity[i]) {
      fields.food[i] = Math.min(sugarCapacity[i], fields.food[i] + SUGAR.regrowthRate);
      fields.foodHue[i] = sugarHue;
    }
  }
}

// Clear landscape state (call when resetting the presentation).
function clearSugarLandscape() {
  sugarCapacity = null;
}

// --- Agent update and draw ---

function sugarUpdate(agent, fields, agents) {
  // Ease visual position toward logical target every frame
  if (agent.targetX === undefined) { agent.targetX = agent.x; agent.targetY = agent.y; }
  agent.x += (agent.targetX - agent.x) * SUGAR.easing;
  agent.y += (agent.targetY - agent.y) * SUGAR.easing;

  // Pace movement — sugarscape ticks slower than the frame rate
  agent.moveTimer = (agent.moveTimer || 0) + 1;
  if (agent.moveTimer < SUGAR.moveInterval) return;
  agent.moveTimer = 0;

  // Consume metabolism; die if reserve exhausted
  agent.sugar -= agent.metabolism;
  if (agent.sugar <= 0) { agent.alive = false; return; }

  // Find current grid position (use logical target, not smoothed visual position)
  const gc = fields.toGrid(agent.targetX, agent.targetY);

  // Restrict vision to the confined box if one is active
  const cs = fields.cellSize;
  const boxC0 = confinedBox ? Math.floor(confinedBox.x / cs)               : 0;
  const boxR0 = confinedBox ? Math.floor(confinedBox.y / cs)               : 0;
  const boxC1 = confinedBox ? Math.floor((confinedBox.x + confinedBox.w) / cs) : fields.cols - 1;
  const boxR1 = confinedBox ? Math.floor((confinedBox.y + confinedBox.h) / cs) : fields.rows - 1;

  // Look in 4 cardinal directions up to agent.vision cells
  let bestVal = fields.get(fields.food, gc.col, gc.row);
  let bestCol = gc.col, bestRow = gc.row;

  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (let step = 1; step <= agent.vision; step++) {
      const c = gc.col + dc * step;
      const r = gc.row + dr * step;
      if (!fields.inBounds(c, r)) break;
      if (c < boxC0 || c > boxC1 || r < boxR0 || r > boxR1) break; // outside box — stop this direction
      if (fields.get(fields.avoid, c, r) > 0.5) break;
      const v = fields.get(fields.food, c, r);
      if (v > bestVal) { bestVal = v; bestCol = c; bestRow = r; }
    }
  }

  // Set new target; visual position lerps toward it over subsequent frames.
  // Clamp to confined box so easing never slides in the wrong direction.
  const pt = fields.toCanvas(bestCol, bestRow);
  agent.targetX = pt.x;
  agent.targetY = pt.y;
  if (confinedBox) {
    agent.targetX = Math.max(confinedBox.x, Math.min(confinedBox.x + confinedBox.w, agent.targetX));
    agent.targetY = Math.max(confinedBox.y, Math.min(confinedBox.y + confinedBox.h, agent.targetY));
  }

  // Harvest sugar at destination
  const i = fields.idx(bestCol, bestRow);
  agent.sugar += fields.food[i] * SUGAR.sugarScale;
  fields.food[i] = 0;
}

function sugarDraw(agent) {
  // Color reflects fullness: warm amber when rich, cool grey when near death
  const t = Math.max(0, Math.min(1, agent.sugar / SUGAR.endowmentMax));
  noStroke();
  fill(
    lerp(140, 230, t),  // R
    lerp(100, 170, t),  // G
    lerp( 80,  30, t),  // B
    210
  );
  const sz = lerp(4, 8, t);
  ellipse(agent.x, agent.y, sz, sz);
}

registerAgent('sugar', sugarUpdate, sugarDraw);
