// predator.js — predator agents
// Predators pursue and eat other agent types. Which types they hunt is set
// per-agent via the `prey` array (a list of type name strings), so you can
// have predators that only chase boids, or ones that eat everything.
//
// Spawn from a slide action:
//   "spawn_predators:5"              → 5 predators that hunt the default prey list
//   "spawn_predators:3:boid:slime"   → 3 predators hunting boids and slimes

const PREDATOR = {
  maxSpeed:         3.8,
  minSpeed:         0.6,
  maxForce:         0.18,
  perceptionRadius: 160,  // how far a predator can see prey
  eatRadius:         14,  // kill distance
  separationDist:    55,  // predators space out from each other
  defaultPrey:      ['boid'],
};

function predatorUpdate(agent, fields, agents) {
  let ax = 0, ay = 0;

  const preySet = agent.preySet; // Set built at spawn, see spawnPredator()

  // --- 1. Find nearest living prey ---
  let bestDist2 = PREDATOR.perceptionRadius * PREDATOR.perceptionRadius;
  let target = null;

  for (const other of agents) {
    if (!other.alive || !preySet.has(other.type)) continue;
    const dx = other.x - agent.x;
    const dy = other.y - agent.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestDist2) { bestDist2 = d2; target = other; }
  }

  if (target) {
    const dx = target.x - agent.x;
    const dy = target.y - agent.y;
    const d  = Math.sqrt(dx * dx + dy * dy);
    if (d < PREDATOR.eatRadius) {
      target.alive = false; // eat it
    } else {
      // Pursue at full force
      ax += (dx / d) * PREDATOR.maxForce * 1.8;
      ay += (dy / d) * PREDATOR.maxForce * 1.8;
    }
  }

  // --- 2. Separation from other predators ---
  for (const other of agents) {
    if (other === agent || !other.alive || other.type !== 'predator') continue;
    const dx = agent.x - other.x;
    const dy = agent.y - other.y;
    const d  = vLen(dx, dy);
    if (d < PREDATOR.separationDist && d > 0) {
      ax += (dx / d) * 0.12;
      ay += (dy / d) * 0.12;
    }
  }

  // --- 3. Avoid field (walls, slide text) ---
  const isAvoid = (c, r) => !fields.inBounds(c, r) || fields.get(fields.avoid, c, r) > 0;
  const spd = vLen(agent.vx, agent.vy);
  if (spd > 0.1) {
    const [nx, ny] = vNorm(agent.vx, agent.vy);
    const here = fields.toGrid(agent.x, agent.y);
    if (isAvoid(here.col, here.row)) {
      // Already inside avoid zone: escape toward the clear neighbour most aligned with heading
      const [hvx, hvy] = [nx, ny];
      let bestDot = -Infinity, bestX = 0, bestY = 0;
      for (const [dc, dr] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
        const nc = here.col + dc, nr = here.row + dr;
        if (!isAvoid(nc, nr)) {
          const pt = fields.toCanvas(nc, nr);
          const dx = pt.x - agent.x, dy = pt.y - agent.y;
          const [enx, eny] = vNorm(dx, dy);
          const dot = enx * hvx + eny * hvy;
          if (dot > bestDot) { bestDot = dot; bestX = dx; bestY = dy; }
        }
      }
      const [ex, ey] = bestDot > -Infinity ? vNorm(bestX, bestY) : [hvx, hvy];
      ax += ex * 1.0; ay += ey * 1.0;
    } else {
      // Look ahead: perpendicular turn away from upcoming avoid cells
      const lx = agent.x + nx * 32;
      const ly = agent.y + ny * 32;
      const lc = fields.toGrid(lx, ly);
      if (isAvoid(lc.col, lc.row)) {
        ax += ny * 0.3;
        ay -= nx * 0.3;
      }
    }
  }

  // --- 4. Apply, clamp, move ---
  agent.vx += ax;
  agent.vy += ay;
  [agent.vx, agent.vy] = vClamp(agent.vx, agent.vy, PREDATOR.maxSpeed);
  [agent.vx, agent.vy] = vMin(agent.vx, agent.vy, PREDATOR.minSpeed);

  agent.x += agent.vx;
  agent.y += agent.vy;

  const margin = 20;
  if (agent.x < -margin) agent.x = width + margin;
  if (agent.x > width + margin) agent.x = -margin;
  if (agent.y < -margin) agent.y = height + margin;
  if (agent.y > height + margin) agent.y = -margin;
}

function predatorDraw(agent) {
  const angle = Math.atan2(agent.vy, agent.vx);
  push();
  translate(agent.x, agent.y);
  rotate(angle);
  noStroke();
  fill(200, 45, 35, 210);
  // Larger, more angular triangle than a boid
  triangle(14, 0, -7, 7, -7, -7);
  pop();
}

registerAgent('predator', predatorUpdate, predatorDraw);
