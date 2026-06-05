// slide-engine.js — parses slides.md, manages slide state, renders HTML overlay
// Slide format: markdown separated by `---` on its own line.
// Optional action block at the top of any slide: <!-- {"enter": [...], "exit": [...]} -->

class SlideEngine {
  constructor(markdownText, config, fields, simState) {
    this.config = config;
    this.fields = fields;
    this.simState = simState;
    this.slides = this.parse(markdownText);
    this.currentIndex = -1;
    this.contentEl = document.getElementById('slide-content');
  }

  // --- Parsing ---

  parse(text) {
    // Strip YAML frontmatter (Marp adds `--- marp: true ---` at the top)
    let content = text;
    if (content.startsWith('---')) {
      const fmEnd = content.indexOf('\n---', 3);
      if (fmEnd !== -1) content = content.slice(fmEnd + 4);
    }

    return content
      .split(/\n---\n/)
      .map(chunk => chunk.trim())
      .filter(chunk => chunk.length > 0)
      .map(chunk => this.parseSlide(chunk));
  }

  parseSlide(raw) {
    // Extract leading <!-- { ... } --> JSON comment
    const commentMatch = raw.match(/^<!--\s*(\{[\s\S]*?\})\s*-->/);
    let meta = { enter: [], exit: [], section: null, color: 'simulation' };
    let md = raw;

    if (commentMatch) {
      try {
        Object.assign(meta, JSON.parse(commentMatch[1]));
      } catch (e) {
        console.warn('Slide action JSON parse error:', commentMatch[1], e);
      }
      md = raw.slice(commentMatch[0].length).trim();
    }

    return {
      html:    this.renderMd(md),
      actions: meta,
      title:   this.extractTitle(md),
    };
  }

  extractTitle(md) {
    const m = md.match(/^#{1,3}\s+(.+)/m);
    if (m) return m[1].replace(/\*+/g, '').trim();
    return md.split('\n')[0].slice(0, 50).trim();
  }

  // Minimal markdown → HTML.
  // Supports a two-column layout: split the slide text on a line containing
  // only `|||` to produce a flex row with two independent columns.
  renderMd(md) {
    const colSplit = md.split(/\n\|\|\|\n/);
    if (colSplit.length === 2) {
      const left  = this.renderLines(colSplit[0].trim());
      const right = this.renderLines(colSplit[1].trim());
      return `<div class="slide-columns"><div class="slide-col">${left}</div><div class="slide-col">${right}</div></div>`;
    }
    return this.renderLines(md);
  }

  renderLines(md) {
    const lines = md.split(/\r?\n/);
    let html = '';
    let inList = false;
    let inBlockquote = false;

    const closeBlocks = () => {
      if (inList)       { html += '</ul>';         inList = false; }
      if (inBlockquote) { html += '</blockquote>'; inBlockquote = false; }
    };

    for (const line of lines) {
      // Headings
      const hMatch = line.match(/^(#{1,3})\s+(.+)/);
      if (hMatch) {
        closeBlocks();
        const lvl = hMatch[1].length;
        html += `<h${lvl}>${this.inlineFmt(hMatch[2])}</h${lvl}>`;
        continue;
      }

      // Block-level image: ![alt](src) or ![alt](src "layout|Caption text")
      // Layout keywords: right, left, center. Caption is everything after the |.
      // Examples:
      //   ![alt](img.png)                    — centered, no caption
      //   ![alt](img.png "right")            — floated right, no caption
      //   ![alt](img.png "right|My caption") — floated right with caption
      //   ![alt](img.png "My caption")       — centered with caption
      const imgMatch = line.match(/^!\[([^\]]*)\]\(([^\s")]+)(?:\s+"([^"]*)")?\)/);
      if (imgMatch) {
        closeBlocks();
        const [, alt, src, title = ''] = imgMatch;
        const LAYOUTS = new Set(['right', 'left', 'center']);
        const [first, ...rest] = title.split('|');
        const layout  = LAYOUTS.has(first.trim()) ? first.trim() : null;
        const caption = (layout ? rest : [first, ...rest]).join('|').trim();
        const figCls  = layout ? ` class="img-${layout}"` : '';
        const figCap  = caption ? `<figcaption>${this.inlineFmt(caption)}</figcaption>` : '';
        html += `<figure${figCls}><img src="${src}" alt="${alt}">${figCap}</figure>`;
        continue;
      }

      // Citation / blockquote: lines starting with >
      const bqMatch = line.match(/^>\s*(.*)/);
      if (bqMatch) {
        if (inList) { html += '</ul>'; inList = false; }
        if (!inBlockquote) { html += '<blockquote>'; inBlockquote = true; }
        if (bqMatch[1].trim()) html += `<p>${this.inlineFmt(bqMatch[1])}</p>`;
        continue;
      }

      // List items
      const liMatch = line.match(/^[-*]\s+(.+)/);
      if (liMatch) {
        if (inBlockquote) { html += '</blockquote>'; inBlockquote = false; }
        if (!inList) { html += '<ul>'; inList = true; }
        html += `<li>${this.inlineFmt(liMatch[1])}</li>`;
        continue;
      }

      // Blank line closes open blocks
      if (line.trim() === '') {
        closeBlocks();
        continue;
      }

      // Paragraph
      closeBlocks();
      html += `<p>${this.inlineFmt(line)}</p>`;
    }

    closeBlocks();
    return html;
  }

  inlineFmt(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/~~(.+?)~~/g, '<del>$1</del>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
  }

  // --- Navigation ---

  goTo(index) {
    if (index < 0 || index >= this.slides.length) return;

    // Exit current slide
    if (this.currentIndex >= 0) {
      const cur = this.slides[this.currentIndex];
      this.runActions(cur.actions.exit || []);
    }

    // Going backwards: wipe sim state so the target slide's enter runs against a clean slate.
    // This ensures removed agents don't persist when navigating back past the slide that spawned them.
    if (index < this.currentIndex) {
      this._resetSim();
    }

    this.currentIndex = index;
    this.simState.slideIndex = index;

    const slide = this.slides[index];
    const { x, y } = slide.actions.jitter ? this._titleOffset(index) : { x: 0, y: 0 };
    this.contentEl.innerHTML = slide.html;
    this.contentEl.style.transform = `translate(${x}px, ${y}px)`;

    // Wait one frame for the browser to lay out the new HTML, then measure
    // element positions to set up avoid zones for boids.
    requestAnimationFrame(() => {
      this.updateAvoidZones();
      this.runActions(slide.actions.enter || []);
      if (typeof ui !== 'undefined') ui.updateCounter();
      // Pre-capture this slide's pixels in the background so burn_slide_pixels
      // has a ready canvas when the exit action fires later.
      this.captureSlide(index);
    });
  }

  next()    { this.goTo(this.currentIndex + 1); }
  prev()    { this.goTo(this.currentIndex - 1); }

  restart() {
    this._resetSim();
    this.currentIndex = -1;
    this.goTo(0);
  }

  _resetSim() {
    clearAgents();
    clearSugarLandscape();
    boidRules.separation = true; boidRules.alignment = true; boidRules.cohesion = true; boidRules.avoidance = true;
    boidVectorMode = 'off';
    this.fields.food.fill(0);
    this.fields.trail.fill(0);
    this.fields.initBorder(this.config.grid.borderDepth);
    this.simState.borderDropped = false;
    this.simState.showBorder = true;
    this.simState.avoidZones = [];
    this.fields.rebuildAvoid(this.simState);
    // Use the registered action so confinedBox (owned by agents.js) is properly cleared
    if (actionRegistry['hide_box']) actionRegistry['hide_box']();
  }

  // --- Avoid zone computation ---

  updateAvoidZones() {
    const cs = this.config.grid.cellSize;
    this.simState.avoidZones = [];

    const elements = this.contentEl.querySelectorAll('h1, h2, h3, p, ul, li');
    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;

      const col  = Math.max(0, Math.floor(rect.left / cs));
      const row  = Math.max(0, Math.floor(rect.top / cs));
      const cols = Math.min(this.fields.cols - col, Math.ceil(rect.width  / cs) + 1);
      const rows = Math.min(this.fields.rows - row, Math.ceil(rect.height / cs) + 1);

      if (cols > 0 && rows > 0) {
        this.simState.avoidZones.push({ col, row, cols, rows });
      }
    }

    this.fields.rebuildAvoid(this.simState);
  }

  // --- Action dispatch ---

  runActions(actionList) {
    for (const actionStr of actionList) {
      // Format: "action_name" or "action_name:arg1:arg2"
      const [name, ...argStrs] = actionStr.split(':');
      const args = argStrs.map(a => (isNaN(a) ? a : Number(a)));
      if (actionRegistry[name]) {
        actionRegistry[name](...args);
      } else {
        console.warn('Unknown slide action:', name);
      }
    }
  }

  hueForColor(colorName) {
    return (this.config.palette.accentHue || {})[colorName] ?? 210;
  }

  // Deterministic per-slide position jitter — same index always gives the same offset.
  _titleOffset(index) {
    const h = Math.imul(index + 1, 2654435761) >>> 0; // Knuth multiplicative hash
    return {
      x: (h % 61) - 30,          // -30..+30 px
      y: ((h >>> 8) % 41) - 20,  // -20..+20 px
    };
  }

  // Rasterise the current slide overlay with html2canvas and store the result
  // on the slide object so burn_slide_pixels can use it synchronously later.
  async captureSlide(index) {
    if (typeof html2canvas === 'undefined') return;
    const slide = this.slides[index];
    if (!slide) return;
    try {
      slide._capturedCanvas = await html2canvas(
        document.getElementById('slide-overlay'),
        { backgroundColor: null, scale: 1, logging: false }
      );
    } catch (e) {
      console.warn('captureSlide failed:', e);
    }
  }

  // Sample an html2canvas-produced canvas into the food field.
  // Dark, opaque pixels become food; brightness and alpha are both factored in.
  burnPixelsToFood(canvas, fields, hue) {
    const ctx = canvas.getContext('2d');
    const { data, width: imgW } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const cs = fields.cellSize;

    for (let r = 0; r < fields.rows; r++) {
      for (let c = 0; c < fields.cols; c++) {
        const x0 = c * cs, y0 = r * cs;
        const x1 = Math.min(x0 + cs, canvas.width);
        const y1 = Math.min(y0 + cs, canvas.height);
        const area = (x1 - x0) * (y1 - y0);
        if (area <= 0) continue;

        let darkness = 0;
        for (let py = y0; py < y1; py++) {
          for (let px = x0; px < x1; px++) {
            const i = (py * imgW + px) * 4;
            const a   = data[i + 3] / 255;
            const bri = (data[i] + data[i + 1] + data[i + 2]) / (3 * 255);
            darkness += a * (1 - bri);
          }
        }
        darkness /= area;

        if (darkness > 0.05) {
          const idx = fields.idx(c, r);
          fields.food[idx]    = Math.max(fields.food[idx], darkness);
          fields.foodHue[idx] = hue;
        }
      }
    }
  }
}
