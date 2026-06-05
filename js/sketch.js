// sketch.js — p5.js coordinator
// This file owns the simulation state and the main draw loop.
// It loads config + slides, wires up the subsystems, and registers the
// named actions that slide action blocks can trigger.

let config;
let rawSlideLines; // loaded by preload() as array of lines

let fields;
let slideEngine;
let ui;

// Central state object shared between the slide engine and simulation.
// Slide engine writes to it; agent code reads from it via `fields`.
const simState = {
  avoidZones: [],   // [{col, row, cols, rows}] — updated each slide change
  slideIndex: 0,
  paused: false,
  showBorder: true,
  borderDropped: false,
  startTime: 0,     // set in setup(), used by UI timer
};

// --- p5.js lifecycle ---

function preload() {
  config        = loadJSON('config.json');
  rawSlideLines = loadStrings('slides.md');
}

function setup() {
  const cnv = createCanvas(windowWidth, windowHeight);
  cnv.style('position', 'fixed');
  cnv.style('top', '0');
  cnv.style('left', '0');
  cnv.style('z-index', '0');

  simState.startTime = millis();

  const cs   = config.grid.cellSize;
  const cols = Math.floor(width  / cs);
  const rows = Math.floor(height / cs);

  fields = new Fields(cols, rows, cs, config.grid.trailScale ?? 2, config.grid.imageFoodScale ?? 2);
  fields.initBorder(config.grid.borderDepth);
  fields.rebuildAvoid(simState);

  registerActions();

  slideEngine = new SlideEngine(rawSlideLines.join('\n'), config, fields, simState);
  ui          = new UI(simState, slideEngine);

  slideEngine.goTo(0);
}

function draw() {
  background(245, 245, 240);

  // Trail: diffuse into neighbors first, then decay — gives spreading blob appearance
  fields.diffuseTrail(config.grid.trailDiffuse ?? 0.25);
  fields.decay(fields.trail, config.grid.trailDecay ?? 0.97);

  if (!simState.paused) {
    tickSugar(fields);
    updateAgents(fields);
  }

  // Render layers bottom to top
  if (confinedBox) {
    const b = confinedBox;
    // Everything clipped to box interior — agents and vectors included
    drawingContext.save();
    drawingContext.beginPath();
    drawingContext.rect(b.x, b.y, b.w, b.h);
    drawingContext.clip();
    fields.drawFood();
    fields.drawImageFood();
    fields.drawTrail();
    drawAgents();
    drawingContext.restore();
    // Masking frame: background-color bands around the box
    const mw = 10;
    noStroke();
    fill(245, 245, 240);
    rect(b.x - mw, b.y - mw, b.w + 2 * mw, mw);  // top
    rect(b.x - mw, b.y + b.h, b.w + 2 * mw, mw); // bottom
    rect(b.x - mw, b.y,       mw,            b.h); // left
    rect(b.x + b.w, b.y,      mw,            b.h); // right
    // Box border line on top
    noFill();
    stroke(0, 0, 0, 210);
    strokeWeight(1.5);
    rect(b.x, b.y, b.w, b.h);
  } else {
    fields.drawFood();
    fields.drawImageFood();
    fields.drawTrail();
    drawAgents();
  }
  if (simState.showBorder) fields.drawBorder();

  ui.tick();
}

function keyPressed() {
  // Map arrow key codes to the string names used in config.hotkeys
  let k = key;
  if (keyCode === LEFT_ARROW)  k = 'ArrowLeft';
  if (keyCode === RIGHT_ARROW) k = 'ArrowRight';

  const h = config.hotkeys;
  if      (h.next.includes(k))          { slideEngine.next();  return false; }
  else if (h.prev.includes(k))          { slideEngine.prev();  return false; }
  else if (h.restart.includes(k))       { slideEngine.restart(); return false; }
  else if (h.toggleSim.includes(k))     { simState.paused = !simState.paused; return false; }
  else if (h.toggleOutline.includes(k)) { ui.toggleOutline();  return false; }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  const cs   = config.grid.cellSize;
  const cols = Math.floor(width  / cs);
  const rows = Math.floor(height / cs);
  fields = new Fields(cols, rows, cs, config.grid.trailScale ?? 2, config.grid.imageFoodScale ?? 2);
  fields.initBorder(config.grid.borderDepth);
  fields.rebuildAvoid(simState);
  // Re-measure text positions for the current slide
  if (slideEngine) slideEngine.updateAvoidZones();
}

// --- Action handlers ---
// These are called by name from slide action blocks, e.g. "enter": ["spawn_boids:20"]

function registerActions() {
  registerAction('spawn_boids', (count = 10) => {
    const b = confinedBox;
    for (let i = 0; i < count; i++) {
      spawnAgent('boid',
        b ? random(b.x, b.x + b.w) : random(width),
        b ? random(b.y, b.y + b.h) : random(height),
        { vx: random(-2, 2), vy: random(-2, 2), goal: null, offscreen: false });
    }
  });

  registerAction('boids_leave', () => {
    agents
      .filter(a => a.type === 'boid')
      .forEach(a => {
        // Send each boid to a random off-screen point
        a.goal = {
          x: random() < 0.5 ? -60 : width + 60,
          y: random(height),
        };
        a.offscreen = true;
      });
  });

  registerAction('spawn_slimes', (count = 10) => {
    for (let i = 0; i < count; i++) {
      spawnAgent('slime', random(width), random(height), {
        angle: random(TWO_PI),
      });
    }
  });

  registerAction('drop_border', () => {
    if (simState.borderDropped) return;
    simState.borderDropped = true;
    simState.showBorder = false;
    const hue = slideEngine
      ? slideEngine.hueForColor(slideEngine.slides[simState.slideIndex]?.actions?.color)
      : 210;
    fields.burnBorderToFood(hue);
    fields.border.fill(0);
    fields.rebuildAvoid(simState);
  });

  registerAction('toggle_border_avoidance', () => {
    simState.showBorder = !simState.showBorder;
    fields.rebuildAvoid(simState);
  });

  // Confine agents to a box on the right side. Args are canvas fractions (0..1).
  // Default: a tall box occupying the right ~35% of the canvas.
  registerAction('show_box', (xFrac = 0.55, yFrac = 0.15, wFrac = 0.35, hFrac = 0.70) => {
    confinedBox = {
      x: width  * xFrac,
      y: height * yFrac,
      w: width  * wFrac,
      h: height * hFrac,
    };
  });

  registerAction('hide_box', () => { confinedBox = null; });

  registerAction('clear_agents', (type = null) => {
    clearAgents(type || null);
  });

  registerAction('spawn_predators', (count = 3, ...preyTypes) => {
    const prey = preyTypes.length ? preyTypes : [...PREDATOR.defaultPrey];
    for (let i = 0; i < count; i++) {
      spawnAgent('predator', random(width), random(height), {
        vx:      random(-2, 2),
        vy:      random(-2, 2),
        prey,
        preySet: new Set(prey), // pre-built Set for O(1) lookup in update
      });
    }
  });

  registerAction('remove_boids', () => {
    clearAgents('boid');
  });

  registerAction('remove_predators', () => {
    clearAgents('predator');
  });

  registerAction('remove_slimes', () => {
    clearAgents('slime');
  });

  registerAction('remove_slime_trails', () => {
    fields.trail.fill(0);
  });

  registerAction('remove_sugar_agents', () => {
    clearAgents('sugar');
  });

  registerAction('remove_sugar', () => {
    clearAgents('sugar');
    clearSugarLandscape();
    fields.clearFood();
  });

  // Burn the current slide's captured pixels into the food field.
  // Use in a slide's "exit" action block; the capture is pre-built on slide enter.
  registerAction('burn_slide_pixels', () => {
    const idx   = simState.slideIndex;
    const slide = slideEngine?.slides[idx];
    if (!slide?._capturedCanvas) {
      console.warn('burn_slide_pixels: no capture ready for slide', idx);
      return;
    }
    const hue = slideEngine.hueForColor(slide.actions?.color);
    slideEngine.burnPixelsToFood(slide._capturedCanvas, fields, hue);
  });

  // Scatter food across the canvas using Perlin noise (hue from current slide color).
  registerAction('burn_to_food', () => {
    const hue = slideEngine
      ? slideEngine.hueForColor(slideEngine.slides[simState.slideIndex]?.actions?.color)
      : 210;
    fields.burnToFood(simState, hue);
  });

  // Stops regrowth and clears the food field; agents die naturally as they run out.
  registerAction('clear_food', () => {
    clearSugarLandscape();
    fields.clearFood();
  });

  registerAction('toggle_boid_vectors', (mode = 'all') => {
    boidVectorMode = boidVectorMode === mode ? 'off' : mode;
  });

  registerAction('boid_rules', (...rules) => {
    const all = rules.length === 0;
    boidRules.separation = all || rules.includes('separation');
    boidRules.alignment  = all || rules.includes('alignment');
    boidRules.cohesion   = all || rules.includes('cohesion');
    boidRules.avoidance  = all || rules.includes('avoidance');
  });

  registerAction('spawn_sugar', (count = 50) => {
    const hue = slideEngine
      ? slideEngine.hueForColor(slideEngine.slides[simState.slideIndex]?.actions?.color)
      : 45;
    initSugarLandscape(fields, hue);
    for (let i = 0; i < count; i++) {
      const col = Math.floor(random(fields.cols));
      const row = Math.floor(random(fields.rows));
      const pt  = fields.toCanvas(col, row);
      spawnAgent('sugar', pt.x, pt.y, {
        vision:     Math.floor(random(SUGAR.visionMin, SUGAR.visionMax + 1)),
        metabolism: random(SUGAR.metabolismMin, SUGAR.metabolismMax),
        sugar:      random(SUGAR.endowmentMin, SUGAR.endowmentMax),
        moveTimer:  0 + Math.floor(random(0, SUGAR.moveInterval / 4)),
        noBoxWrap:  true, // easing agents must not be teleported by box wrap
      });
    }
  });
}
