// ui.js — timer, slide counter, outline panel

class UI {
  constructor(simState, slideEngine) {
    this.simState    = simState;
    this.slideEngine = slideEngine;
    this.timerEl     = document.getElementById('timer');
    this.counterEl   = document.getElementById('slide-counter');
    this.outlineEl   = document.getElementById('outline-panel');
    this.outlineList = document.getElementById('outline-list');
  }

  // Called every draw() frame to keep the timer current.
  tick() {
    const ms   = millis() - this.simState.startTime;
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    this.timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // Rebuild the dots at the bottom-right showing progress through the deck.
  updateCounter() {
    const total   = this.slideEngine.slides.length;
    const current = this.simState.slideIndex;
    this.counterEl.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const dot = document.createElement('div');
      const slide = this.slideEngine.slides[i];
      dot.className = [
        'counter-dot',
        i === current       ? 'current'       : '',
        slide.actions.section ? 'section-start' : '',
      ].join(' ').trim();
      this.counterEl.appendChild(dot);
    }
  }

  toggleOutline() {
    const hidden = this.outlineEl.classList.toggle('hidden');
    if (!hidden) this.buildOutline();
  }

  buildOutline() {
    this.outlineList.innerHTML = '';
    this.slideEngine.slides.forEach((slide, i) => {
      const div = document.createElement('div');

      if (slide.actions.section) {
        div.className = 'outline-item section';
        div.textContent = slide.actions.section;
      } else {
        div.className = 'outline-item' + (i === this.simState.slideIndex ? ' active' : '');
        div.textContent = `${i + 1}. ${slide.title}`;
        div.addEventListener('click', () => {
          this.slideEngine.goTo(i);
          this.outlineEl.classList.add('hidden');
        });
      }

      this.outlineList.appendChild(div);
    });
  }
}
