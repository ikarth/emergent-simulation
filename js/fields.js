// fields.js — grid field system
// Fields are Float32Array grids indexed by [row * cols + col].
// Values are 0..1 floats. The grid is coarser than the canvas pixel grid,
// giving the simulation a chunky, visible resolution.

class Fields {
  constructor(cols, rows, cellSize, trailScale = 2, imageFoodScale = 2) {
    this.cols = cols;
    this.rows = rows;
    this.cellSize = cellSize;
    const n = cols * rows;

    this.avoid     = new Float32Array(n); // boids steer away from cells > 0
    this.food      = new Float32Array(n); // boids seek; consumed on contact
    this.border    = new Float32Array(n); // the border frame cells
    this.foodHue   = new Float32Array(n); // hue (0..360) per food cell
    // 0 = fuzzy landscape blob, 1 = crisp image tile (high-res), 2 = crisp black tile
    this.foodCrisp = new Uint8Array(n);

    // Trail field at higher resolution — trailScale × main grid in each dimension
    this.trailScale    = trailScale;
    this.trailCellSize = cellSize / trailScale;
    this.trailCols     = cols * trailScale;
    this.trailRows     = rows * trailScale;
    const tn           = this.trailCols * this.trailRows;
    this.trail         = new Float32Array(tn);
    this._trailBuf     = new Float32Array(tn); // double-buffer for diffusion

    // Image food at higher resolution — stores pixel-burn pattern for rendering;
    // main food grid controls agent consumption, this grid controls visual shape.
    this.ifScale    = imageFoodScale;
    this.ifCellSize = cellSize / imageFoodScale;
    this.ifCols     = cols * imageFoodScale;
    this.ifRows     = rows * imageFoodScale;
    this.imageFood  = new Float32Array(this.ifCols * this.ifRows);
  }

  idx(col, row) {
    return row * this.cols + col;
  }

  inBounds(col, row) {
    return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
  }

  get(field, col, row) {
    if (!this.inBounds(col, row)) return 0;
    return field[this.idx(col, row)];
  }

  set(field, col, row, value) {
    if (!this.inBounds(col, row)) return;
    field[this.idx(col, row)] = Math.max(0, Math.min(1, value));
  }

  add(field, col, row, delta) {
    this.set(field, col, row, this.get(field, col, row) + delta);
  }

  fillRect(field, colStart, rowStart, colSpan, rowSpan, value) {
    for (let r = rowStart; r < rowStart + rowSpan; r++) {
      for (let c = colStart; c < colStart + colSpan; c++) {
        this.set(field, c, r, value);
      }
    }
  }

  // Clear food, hue, crisp-type, and image-food pattern together.
  clearFood() {
    this.food.fill(0);
    this.foodHue.fill(0);
    this.foodCrisp.fill(0);
    this.imageFood.fill(0);
  }

  // Multiply every cell by rate (e.g. 0.99) and zero out near-zero values.
  decay(field, rate) {
    for (let i = 0; i < field.length; i++) {
      field[i] *= rate;
      if (field[i] < 0.001) field[i] = 0;
    }
  }

  // Convert canvas pixel position to the nearest grid cell.
  toGrid(x, y) {
    return {
      col: Math.floor(x / this.cellSize),
      row: Math.floor(y / this.cellSize),
    };
  }

  // Convert a grid cell to the pixel position of its center.
  toCanvas(col, row) {
    return {
      x: (col + 0.5) * this.cellSize,
      y: (row + 0.5) * this.cellSize,
    };
  }

  // Image-food coordinate helpers (high-res grid for pixel-burn rendering)
  ifIdx(col, row)      { return row * this.ifCols + col; }
  ifInBounds(col, row) { return col >= 0 && col < this.ifCols && row >= 0 && row < this.ifRows; }
  toIfGrid(x, y) {
    return { col: Math.floor(x / this.ifCellSize), row: Math.floor(y / this.ifCellSize) };
  }

  // Trail-specific coordinate helpers (trail grid is denser than the main grid)
  trailIdx(col, row) { return row * this.trailCols + col; }
  trailInBounds(col, row) { return col >= 0 && col < this.trailCols && row >= 0 && row < this.trailRows; }
  trailGet(col, row) { return this.trailInBounds(col, row) ? this.trail[this.trailIdx(col, row)] : 0; }
  trailAdd(col, row, delta) {
    if (!this.trailInBounds(col, row)) return;
    const i = this.trailIdx(col, row);
    this.trail[i] = Math.max(0, Math.min(1, this.trail[i] + delta));
  }
  toTrailGrid(x, y) {
    return {
      col: Math.floor(x / this.trailCellSize),
      row: Math.floor(y / this.trailCellSize),
    };
  }

  // Blur trail values into neighboring cells before decay.
  // Uses a double-buffer swap — no per-frame allocation.
  diffuseTrail(rate) {
    const src  = this.trail;
    const dst  = this._trailBuf;
    const cols = this.trailCols;
    const rows = this.trailRows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const self = src[r * cols + c];
        if (self === 0) { dst[r * cols + c] = 0; continue; }
        let sum = 0, count = 0;
        if (c > 0)       { sum += src[r * cols + (c - 1)]; count++; }
        if (c < cols - 1){ sum += src[r * cols + (c + 1)]; count++; }
        if (r > 0)       { sum += src[(r - 1) * cols + c]; count++; }
        if (r < rows - 1){ sum += src[(r + 1) * cols + c]; count++; }
        dst[r * cols + c] = self * (1 - rate) + (sum / count) * rate;
      }
    }
    this.trail     = dst;
    this._trailBuf = src;
  }

  // Mark the outermost `depth` cells as border cells.
  initBorder(depth) {
    this.border.fill(0);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (r < depth || r >= this.rows - depth ||
            c < depth || c >= this.cols - depth) {
          this.border[this.idx(c, r)] = 1;
        }
      }
    }
  }

  // Rebuild avoid field from border state + active slide avoid zones.
  rebuildAvoid(simState) {
    this.avoid.fill(0);
    if (simState.showBorder) {
      for (let i = 0; i < this.border.length; i++) {
        if (this.border[i] > 0.5) this.avoid[i] = 1;
      }
    }
    for (const z of simState.avoidZones) {
      this.fillRect(this.avoid, z.col, z.row, z.cols, z.rows, 1);
    }
  }

  // When leaving a slide: scatter food across the canvas using Perlin noise.
  // Random offsets into the noise field give each slide a unique deposit pattern.
  burnToFood(simState, hue) {
    const scale     = 0.10;  // noise frequency — lower = larger blobs, higher = finer grain
    const threshold = 0.52;  // noise cells above this receive food (~48% coverage)
    const ox = Math.random() * 800;
    const oy = Math.random() * 800;

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const n = noise(c * scale + ox, r * scale + oy);
        if (n > threshold) {
          const i = this.idx(c, r);
          // Map noise value above threshold to food intensity 0.2..0.8
          const intensity = (n - threshold) / (1 - threshold);
          this.food[i] = Math.max(this.food[i], 0.2 + intensity * 0.6);
          this.foodHue[i] = hue;
        }
      }
    }
  }

  // Convert all border cells to crisp black food tiles (used by drop_border action).
  burnBorderToFood(hue) {
    for (let i = 0; i < this.border.length; i++) {
      if (this.border[i] > 0.5) {
        this.food[i]      = 1.0; // start fully opaque so they appear solid black
        this.foodHue[i]   = hue;
        this.foodCrisp[i] = 2; // crisp black tile
      }
    }
  }

  // --- Drawing (called from the p5.js draw loop) ---

  drawFood() {
    noStroke();
    const cs = this.cellSize;
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const i = this.idx(col, row);
        const v = this.food[i];
        if (v < 0.01) continue;
        const crisp = this.foodCrisp[i];
        if (crisp === 2) {
          // Border burn: crisp black square
          fill(0, 0, 0, v * 255);
          rect(col * cs, row * cs, cs, cs);
        } else if (crisp === 0) {
          // Landscape food: fuzzy blob (crisp===1 rendered at high-res by drawImageFood)
          const hue = this.foodHue[i];
          const px = (col + 0.5) * cs;
          const py = (row + 0.5) * cs;
          const [red, grn, blu] = hsbToRgb(hue, 30, 60);
          fill(red, grn, blu, v * 130);
          ellipse(px, py, cs * 1.4, cs * 1.4);
        }
      }
    }
  }

  drawTrail() {
    // Batch cells by alpha bucket so we make O(buckets) ctx.fill() calls instead of
    // O(cells) — with trailScale=3 that cuts ~200K p5.js draw calls down to ~32/frame.
    const ctx     = drawingContext;
    const cs      = this.trailCellSize;
    const TAU     = Math.PI * 2;
    const BUCKETS = 16;

    if (!this._drawBuckets) {
      this._drawBuckets = Array.from({ length: BUCKETS }, () => []);
    }
    for (const b of this._drawBuckets) b.length = 0;

    for (let row = 0; row < this.trailRows; row++) {
      for (let col = 0; col < this.trailCols; col++) {
        const v = this.trail[this.trailIdx(col, row)];
        if (v < 0.01) continue;
        const b = this._drawBuckets[Math.min(BUCKETS - 1, Math.floor(v * BUCKETS))];
        b.push(col, row);
      }
    }

    const rad1 = cs * 0.5;  // inner core
    const rad2 = cs * 1.1;  // outer glow

    ctx.save();
    for (let pass = 0; pass < 2; pass++) {
      const rad = pass === 0 ? rad1 : rad2;
      for (let bi = 0; bi < BUCKETS; bi++) {
        const bucket = this._drawBuckets[bi];
        if (bucket.length === 0) continue;
        const v = (bi + 0.5) / BUCKETS;
        ctx.fillStyle = `rgba(120,180,130,${(pass === 0 ? v * 0.55 : v * 0.15).toFixed(3)})`;
        ctx.beginPath();
        for (let k = 0; k < bucket.length; k += 2) {
          const px = (bucket[k]     + 0.5) * cs;
          const py = (bucket[k + 1] + 0.5) * cs;
          ctx.moveTo(px + rad, py);
          ctx.arc(px, py, rad, 0, TAU);
        }
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // Render pixel-burned slide content at high resolution using batched rect paths.
  // imageFood stores the initial darkness pattern; food[] controls opacity as agents eat.
  drawImageFood() {
    const ctx     = drawingContext;
    const cs      = this.ifCellSize;
    const BUCKETS = 16;

    if (!this._ifDrawBuckets) {
      this._ifDrawBuckets = Array.from({ length: BUCKETS }, () => []);
    }
    for (const b of this._ifDrawBuckets) b.length = 0;

    for (let row = 0; row < this.ifRows; row++) {
      for (let col = 0; col < this.ifCols; col++) {
        const ifv = this.imageFood[this.ifIdx(col, row)];
        if (ifv < 0.01) continue;
        const mc = Math.floor(col / this.ifScale);
        const mr = Math.floor(row / this.ifScale);
        if (!this.inBounds(mc, mr)) continue;
        const mv = this.food[this.idx(mc, mr)];
        if (mv < 0.01) continue;
        const v  = ifv * mv;
        if (v < 0.005) continue;
        this._ifDrawBuckets[Math.min(BUCKETS - 1, Math.floor(v * BUCKETS))].push(col, row);
      }
    }

    ctx.save();
    for (let bi = 0; bi < BUCKETS; bi++) {
      const bucket = this._ifDrawBuckets[bi];
      if (bucket.length === 0) continue;
      const v = (bi + 0.5) / BUCKETS;
      ctx.fillStyle = `rgba(30,30,30,${(v * 0.9).toFixed(3)})`;
      ctx.beginPath();
      for (let k = 0; k < bucket.length; k += 2) {
        ctx.rect(bucket[k] * cs, bucket[k + 1] * cs, cs, cs);
      }
      ctx.fill();
    }
    ctx.restore();
  }

  drawBorder() {
    noStroke();
    fill(0, 0, 0, 230);
    const cs = this.cellSize;
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        if (this.border[this.idx(col, row)] > 0.5) {
          // Outer edge cells bleed past the canvas boundary to close any sub-cell gap.
          // Compute bounding box corners so the cell stretches, not shifts.
          const x1 = col === 0             ? -cs         : col * cs;
          const y1 = row === 0             ? -cs         : row * cs;
          const x2 = col === this.cols - 1 ? width  + cs : (col + 1) * cs;
          const y2 = row === this.rows - 1 ? height + cs : (row + 1) * cs;
          rect(x1, y1, x2 - x1, y2 - y1);
        }
      }
    }
  }
}

// Convert HSB (hue 0..360, sat 0..100, bri 0..100) to RGB (0..255 each).
function hsbToRgb(h, s, b) {
  s /= 100; b /= 100;
  const k = (n) => (n + h / 60) % 6;
  const f = (n) => b * (1 - s * Math.max(0, Math.min(k(n), 4 - k(n), 1)));
  return [Math.round(f(5) * 255), Math.round(f(3) * 255), Math.round(f(1) * 255)];
}
