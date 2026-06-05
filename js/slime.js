// slime.js — slime mold agents
// Slimes move by sensing the trail field ahead of them and turning toward
// the strongest signal. They leave trail behind as they go, which attracts
// other slimes — producing the characteristic network-forming behavior.

const SLIME = {
  speed:          1.7,  // pixels per frame
  turnSpeed:      0.35, // max radians to turn per frame
  senseAngle:     0.5,  // radians offset for left/right sensors
  senseDist:      18,   // pixels ahead that sensors sample
  trailDeposit:   0.5,  // how much trail left per frame
  randomTurnChance: 0.05, // probability of a random turn each frame
};

function slimeUpdate(agent, fields, agents) {
  // --- Sense trail field at three angles ---
  const frontVal = senseTrailAt(agent, fields, 0);
  const leftVal  = senseTrailAt(agent, fields, -SLIME.senseAngle);
  const rightVal = senseTrailAt(agent, fields,  SLIME.senseAngle);

  // Also check avoid field ahead — turn away from avoid cells
  const frontAvoid = senseAvoidAt(agent, fields, 0);

  if (frontAvoid > 0) {
    // Blocked: pick a random direction to try
    agent.angle += (Math.random() - 0.5) * Math.PI;
  } else if (frontVal >= leftVal && frontVal >= rightVal) {
    // Continue straight, maybe a small random jitter
    if (Math.random() < SLIME.randomTurnChance) {
      agent.angle += (Math.random() - 0.5) * SLIME.turnSpeed;
    }
  } else if (leftVal > rightVal) {
    agent.angle -= SLIME.turnSpeed * Math.random();
  } else if (rightVal > leftVal) {
    agent.angle += SLIME.turnSpeed * Math.random();
  } else {
    agent.angle += (Math.random() - 0.5) * SLIME.turnSpeed;
  }

  // --- Move ---
  agent.vx = Math.cos(agent.angle) * SLIME.speed;
  agent.vy = Math.sin(agent.angle) * SLIME.speed;
  agent.x += agent.vx;
  agent.y += agent.vy;

  // Wrap around canvas
  if (agent.x < 0) agent.x = width;
  if (agent.x > width) agent.x = 0;
  if (agent.y < 0) agent.y = height;
  if (agent.y > height) agent.y = 0;

  // --- Deposit trail (on the high-res trail grid) ---
  const {col: tc, row: tr} = fields.toTrailGrid(agent.x, agent.y);
  fields.trailAdd(tc, tr, SLIME.trailDeposit);

  // --- Consume food if on a food cell (food is on the main grid) ---
  const {col, row} = fields.toGrid(agent.x, agent.y);
  if (fields.get(fields.food, col, row) > 0.05) {
    const i = fields.idx(col, row);
    fields.food[i] = Math.max(0, fields.food[i] - 0.04);
  }
}

function senseTrailAt(agent, fields, angleOffset) {
  const a = agent.angle + angleOffset;
  const sx = agent.x + Math.cos(a) * SLIME.senseDist;
  const sy = agent.y + Math.sin(a) * SLIME.senseDist;
  const {col, row} = fields.toTrailGrid(sx, sy);
  return fields.trailGet(col, row);
}

function senseAvoidAt(agent, fields, angleOffset) {
  const a = agent.angle + angleOffset;
  const sx = agent.x + Math.cos(a) * SLIME.senseDist;
  const sy = agent.y + Math.sin(a) * SLIME.senseDist;
  const {col, row} = fields.toGrid(sx, sy);
  return fields.get(fields.avoid, col, row);
}

function slimeDraw(agent) {
  noStroke();
  fill(100, 180, 110, 200);
  ellipse(agent.x, agent.y, 5, 5);
}

registerAgent('slime', slimeUpdate, slimeDraw);
