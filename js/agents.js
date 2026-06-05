// agents.js — shared agent infrastructure
// All agent types (boids, slimes, etc.) register here.
// Each agent is a plain object; types differ only in their update/draw functions.

const agentTypes = {};   // { typeName: { update, draw } }
const agents = [];       // flat array of all live agent objects
const actionRegistry = {}; // { actionName: fn } — registered by sketch.js

// When non-null, agents wrap within this box instead of the full canvas.
// Set by the show_box / hide_box actions in sketch.js.
let confinedBox = null; // { x, y, w, h } in canvas pixels

// Register a new agent type with its update and draw functions.
// Call this from your agent file (e.g. boids.js, slime.js).
function registerAgent(name, updateFn, drawFn) {
  agentTypes[name] = { update: updateFn, draw: drawFn };
}

// Register a named action that slide actions can trigger.
function registerAction(name, fn) {
  actionRegistry[name] = fn;
}

// Create a new agent of the given type and add it to the pool.
// Pass any type-specific state as properties in `extras`.
function spawnAgent(type, x, y, extras = {}) {
  const agent = { type, x, y, vx: 0, vy: 0, alive: true, ...extras };
  agents.push(agent);
  return agent;
}

// Remove all agents of the given type (or all agents if type is null).
function clearAgents(type = null) {
  if (type === null) {
    agents.forEach(a => { a.alive = false; });
  } else {
    agents.forEach(a => { if (a.type === type) a.alive = false; });
  }
}

// Run one update tick for all living agents, then remove dead ones.
function updateAgents(fields) {
  for (const agent of agents) {
    if (agent.alive && agentTypes[agent.type]) {
      agentTypes[agent.type].update(agent, fields, agents);
    }
    // Box confinement: wrap position within the box.
    // Agents with noBoxWrap skip this — they manage their own bounds (e.g. sugar easing).
    if (agent.alive && confinedBox && !agent.offscreen && !agent.noBoxWrap) {
      const b = confinedBox;
      agent.x = b.x + ((agent.x - b.x) % b.w + b.w) % b.w;
      agent.y = b.y + ((agent.y - b.y) % b.h + b.h) % b.h;
      if (agent.targetX !== undefined) {
        agent.targetX = b.x + ((agent.targetX - b.x) % b.w + b.w) % b.w;
        agent.targetY = b.y + ((agent.targetY - b.y) % b.h + b.h) % b.h;
      }
    }
  }
  // Sweep dead agents (iterate backwards to avoid index shift)
  for (let i = agents.length - 1; i >= 0; i--) {
    if (!agents[i].alive) agents.splice(i, 1);
  }
}

// Draw all living agents.
function drawAgents() {
  for (const agent of agents) {
    if (agent.alive && agentTypes[agent.type]) {
      agentTypes[agent.type].draw(agent);
    }
  }
}

// --- Vector math helpers (available to agent update functions) ---

function vLen(vx, vy) {
  return Math.sqrt(vx * vx + vy * vy);
}

function vNorm(vx, vy) {
  const l = vLen(vx, vy) || 1;
  return [vx / l, vy / l];
}

// Scale a vector down to maxLen if it exceeds it; leave it alone otherwise.
function vClamp(vx, vy, maxLen) {
  const l = vLen(vx, vy);
  if (l <= maxLen || l === 0) return [vx, vy];
  return [vx / l * maxLen, vy / l * maxLen];
}

// Scale a vector up to minLen if it falls short; leave it alone otherwise.
// Zero vectors are returned unchanged (no direction to scale).
function vMin(vx, vy, minLen) {
  const l = vLen(vx, vy);
  if (l >= minLen || l === 0) return [vx, vy];
  return [vx / l * minLen, vy / l * minLen];
}
