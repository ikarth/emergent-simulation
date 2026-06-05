// boids.js — flocking boid agents
// Tune the BOID constants to change behavior. The update function runs
// Reynolds-style steering: separation, alignment, cohesion, plus avoid-field
// steering and food seeking. Each boid can also have a goal position it
// actively seeks (used for spawning it off-screen or sending it away).

const BOID = {
  maxSpeed:        2.5,   // pixels per frame
  minSpeed:        1.0,   // min flight speed — can't hover, must keep moving
  maxForce:        0.12,  // maximum steering force per frame
  perceptionRadius: 80,   // how far a boid can see neighbors (pixels)
  separationDist:   24,   // minimum comfortable distance from neighbors
  avoidLookDist:    28,   // how far ahead to sample the avoid field
  foodSenseRadius: 100,   // how far a boid can smell food (pixels)
  foodConsumeRate: 0.06,  // how much food is eaten per frame of contact
  vectorScale:    250,    // display scale for steering vectors
  vectorPow:      0.5,    // exponent: 1.0 = linear, 0.5 = sqrt (boosts small, compresses large)
};

// Toggled by the boid_rules slide action to isolate individual steering behaviors.
const boidRules = { separation: true, alignment: true, cohesion: true, avoidance: true };

// 'off' | 'flocking' | 'all' — set by toggle_boid_vectors action.
let boidVectorMode = 'off';

function boidUpdate(agent, fields, agents) {
  let ax = 0, ay = 0; // accumulated steering force
  // Per-component contributions stored on agent for vector display.
  let svSepX = 0, svSepY = 0;
  let svAliX = 0, svAliY = 0;
  let svCohX = 0, svCohY = 0;
  let svAvoidX = 0, svAvoidY = 0;
  let svFoodX = 0, svFoodY = 0;
  let svGoalX = 0, svGoalY = 0;

  // --- 1. Flocking (separation, alignment, cohesion) ---
  const neighbors = [];
  for (const other of agents) {
    if (other === agent || !other.alive || other.type !== 'boid') continue;
    const dx = other.x - agent.x;
    const dy = other.y - agent.y;
    if (dx * dx + dy * dy < BOID.perceptionRadius * BOID.perceptionRadius) {
      neighbors.push(other);
    }
  }

  if (neighbors.length > 0) {
    let sepX = 0, sepY = 0, sepCount = 0;
    let aliX = 0, aliY = 0;
    let cohX = 0, cohY = 0;

    for (const n of neighbors) {
      const dx = agent.x - n.x;
      const dy = agent.y - n.y;
      const d = vLen(dx, dy);

      // Separation: push away from very close neighbors
      if (d < BOID.separationDist && d > 0) {
        sepX += dx / d;
        sepY += dy / d;
        sepCount++;
      }

      // Alignment: steer toward average heading
      aliX += n.vx;
      aliY += n.vy;

      // Cohesion: steer toward average position
      cohX += n.x;
      cohY += n.y;
    }

    const n = neighbors.length;
    if (boidRules.separation && sepCount > 0) {
      svSepX = sepX / sepCount * 0.18; svSepY = sepY / sepCount * 0.18;
      ax += svSepX; ay += svSepY;
    }
    if (boidRules.alignment) {
      svAliX = (aliX / n - agent.vx) * 0.04; svAliY = (aliY / n - agent.vy) * 0.04;
      ax += svAliX; ay += svAliY;
    }
    if (boidRules.cohesion) {
      svCohX = (cohX / n - agent.x) * 0.0004; svCohY = (cohY / n - agent.y) * 0.0004;
      ax += svCohX; ay += svCohY;
    }
  }

  // --- 2. Avoid field ---
  // Sample the field ahead and to the sides; steer away from any avoid cells.
  // Off-grid cells count as avoid so the wrap margin can't become a dead zone.
  const isAvoid = (c, r) => !fields.inBounds(c, r) || fields.get(fields.avoid, c, r) > 0;
  const speed = vLen(agent.vx, agent.vy);
  if (boidRules.avoidance && speed > 0.1) {
    // If leaving, ignore avoidance
    if(!agent.offscreen) {   
      const [nx, ny] = vNorm(agent.vx, agent.vy);

      // Inside an avoid zone (or off-canvas): escape through the exit most aligned with heading
      const here = fields.toGrid(agent.x, agent.y);
      if (isAvoid(here.col, here.row)) {
        const [hvx, hvy] = vNorm(agent.vx, agent.vy);
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
        // If completely enclosed, keep current heading rather than fighting toward center
        const [ex, ey] = bestDot > -Infinity ? vNorm(bestX, bestY) : [hvx, hvy];
        svAvoidX = ex * 1.0; svAvoidY = ey * 1.0;
        ax += svAvoidX; ay += svAvoidY;
      } else {
        // Far look-ahead: gentle turn
        const farX = agent.x + nx * BOID.avoidLookDist;
        const farY = agent.y + ny * BOID.avoidLookDist;
        const far = fields.toGrid(farX, farY);
        if (isAvoid(far.col, far.row)) {
          svAvoidX += ny * 0.25; svAvoidY += -nx * 0.25;
          ax += svAvoidX; ay += svAvoidY;
        }

        // Near look-ahead: strong steer-back
        const nearX = agent.x + nx * 12;
        const nearY = agent.y + ny * 12;
        const near = fields.toGrid(nearX, nearY);
        if (isAvoid(near.col, near.row)) {
          svAvoidX += -nx * 0.5; svAvoidY += -ny * 0.5;
          ax += -nx * 0.5; ay += -ny * 0.5;
        }
      }
    }
  }

  // --- 3. Food seeking (only when not chasing a goal) ---
  if (!agent.goal) {
    const senseR = BOID.foodSenseRadius;
    let bestDist2 = senseR * senseR;
    let bestCol = -1, bestRow = -1;
    const gc = fields.toGrid(agent.x, agent.y);
    const scanRadius = Math.ceil(senseR / fields.cellSize);

    for (let r = gc.row - scanRadius; r <= gc.row + scanRadius; r++) {
      for (let c = gc.col - scanRadius; c <= gc.col + scanRadius; c++) {
        if (!fields.inBounds(c, r)) continue;
        if (fields.get(fields.food, c, r) < 0.05) continue;
        const pt = fields.toCanvas(c, r);
        const dx = pt.x - agent.x;
        const dy = pt.y - agent.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDist2) { bestDist2 = d2; bestCol = c; bestRow = r; }
      }
    }

    if (bestCol >= 0) {
      const pt = fields.toCanvas(bestCol, bestRow);
      const dx = pt.x - agent.x;
      const dy = pt.y - agent.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      svFoodX = (dx / d) * BOID.maxForce * 0.7; svFoodY = (dy / d) * BOID.maxForce * 0.7;
      ax += svFoodX; ay += svFoodY;

      // Consume food when very close
      if (d < fields.cellSize) {
        const i = fields.idx(bestCol, bestRow);
        fields.food[i] = Math.max(0, fields.food[i] - BOID.foodConsumeRate);
      }
    }
  }

  // --- 4. Goal seeking ---
  if (agent.goal) {
    const dx = agent.goal.x - agent.x;
    const dy = agent.goal.y - agent.y;
    const d = vLen(dx, dy);
    if (d < 20) {
      // Reached goal
      agent.goal = null;
      if (agent.offscreen) { agent.alive = false; return; } // despawn off-screen boids
    } else {
      svGoalX = (dx / d) * BOID.maxForce * 1.5; svGoalY = (dy / d) * BOID.maxForce * 1.5;
      ax += svGoalX; ay += svGoalY;
    }
  }

  // --- 5. Store steering components, apply force, clamp speed ---
  agent._sv = { sepX: svSepX, sepY: svSepY, aliX: svAliX, aliY: svAliY,
                cohX: svCohX, cohY: svCohY, avoidX: svAvoidX, avoidY: svAvoidY,
                foodX: svFoodX, foodY: svFoodY, goalX: svGoalX, goalY: svGoalY };
  agent.vx += ax;
  agent.vy += ay;
  [agent.vx, agent.vy] = vClamp(agent.vx, agent.vy, BOID.maxSpeed);
  [agent.vx, agent.vy] = vMin(agent.vx, agent.vy, BOID.minSpeed);

  agent.x += agent.vx;
  agent.y += agent.vy;

  // --- 6. Wrap around the canvas (unless leaving intentionally) ---
  if (!agent.offscreen) {
    const margin = 20;
    if (agent.x < -margin) agent.x = width + margin;
    if (agent.x > width + margin) agent.x = -margin;
    if (agent.y < -margin) agent.y = height + margin;
    if (agent.y > height + margin) agent.y = -margin;
  }
}

function boidDraw(agent) {
  const angle = Math.atan2(agent.vy, agent.vx);
  push();
  translate(agent.x, agent.y);
  rotate(angle);
  noStroke();
  fill(60, 110, 200, 170);
  // Simple arrowhead triangle: tip at (10,0), base at (-5, ±4)
  triangle(9, 0, -5, 4, -5, -4);
  triangle(-8, 0, -5, 4, -5, -4);
  pop();

  if (boidVectorMode !== 'off' && agent._sv) {
    // Non-linear display: length = magnitude^vectorPow * vectorScale
    // Small forces get boosted; large forces are compressed.
    const sv = agent._sv;
    const svLine = (vx, vy) => {
      const len = Math.sqrt(vx * vx + vy * vy);
      if (len === 0) return;
      const d = Math.pow(len, BOID.vectorPow) * BOID.vectorScale;
      line(0, 0, vx / len * d, vy / len * d);
    };
    push();
    translate(agent.x, agent.y);
    strokeWeight(1.5);
    noFill();
    stroke(220, 60, 60, 200);  svLine(sv.sepX,   sv.sepY);   // separation: red
    stroke(60, 180, 60, 200);  svLine(sv.aliX,   sv.aliY);   // alignment:  green
    stroke(60, 100, 220, 200); svLine(sv.cohX,   sv.cohY);   // cohesion:   blue
    if (boidVectorMode === 'all') {
      stroke(240, 140, 30, 200);  svLine(sv.avoidX, sv.avoidY); // avoidance: orange
      stroke(200, 60, 200, 200);  svLine(sv.foodX,  sv.foodY);  // food:      magenta
      stroke(60, 200, 200, 200);  svLine(sv.goalX,  sv.goalY);  // goal:      cyan
    }
    pop();
  }
}

registerAgent('boid', boidUpdate, boidDraw);
