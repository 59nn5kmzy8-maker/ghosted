(() => {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const ease = k => 1 - Math.pow(1 - k, 4);
  const tween = (ms, fn, done) => {
    const t0 = performance.now();
    const step = t => { const k = Math.min(1, (t - t0) / ms); fn(ease(k)); if (k < 1) requestAnimationFrame(step); else if (done) done(); };
    requestAnimationFrame(step);
  };

  $$('[data-copy]').forEach(b => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy.replace(/\\n/g, '\n')); b.textContent = 'Copied ✓'; }
    catch { b.textContent = 'Select to copy'; }
    setTimeout(() => { b.textContent = 'Copy'; }, 1600);
  }));

  // Live star count; stays a plain star if the API is unavailable.
  const stars = $('#stars');
  if (stars) fetch('https://api.github.com/repos/giovanbelle/ghosted').then(r => r.json()).then(d => {
    if (Number.isFinite(d.stargazers_count)) stars.textContent = '★ ' + d.stargazers_count;
  }).catch(() => {});

  // Sliding pill behind the active item of a tab row.
  const pillFor = (row, sel) => {
    const pill = document.createElement('span'); pill.className = 'pill'; pill.setAttribute('aria-hidden', 'true');
    row.prepend(pill);
    const move = el => { if (!el) { pill.style.opacity = 0; return; } pill.style.opacity = 1; pill.style.width = el.offsetWidth + 'px'; pill.style.transform = `translateX(${el.offsetLeft}px)`; };
    return { move, current: () => row.querySelector(sel) };
  };
  const nav = $('.tabs');
  if (nav) {
    const p = pillFor(nav, '[aria-current="page"]');
    const home = () => p.move(p.current());
    nav.querySelectorAll('a').forEach(a => a.addEventListener('pointerenter', () => p.move(a)));
    nav.addEventListener('pointerleave', home);
    addEventListener('resize', home); document.fonts && document.fonts.ready.then(home); home();
  }

  // Tabs: click or arrow keys; data-hash lists open a tab from the URL (legal.html#privacy).
  $$('[role="tablist"]').forEach(list => {
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    const p = pillFor(list, '[aria-selected="true"]');
    const show = (tab, focus) => {
      tabs.forEach(t => {
        const on = t === tab;
        t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
      });
      p.move(tab);
      if (focus) tab.focus();
      if (list.dataset.hash) history.replaceState(null, '', '#' + tab.dataset.key);
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => show(t));
      t.addEventListener('keydown', e => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (d) { e.preventDefault(); show(tabs[(i + d + tabs.length) % tabs.length], true); }
      });
    });
    const fromHash = list.dataset.hash && tabs.find(t => t.dataset.key === location.hash.slice(1));
    show(fromHash || tabs[0]);
    addEventListener('resize', () => p.move(p.current()));
    document.fonts && document.fonts.ready.then(() => p.move(p.current()));
  });

  // Calculator: saving = spend × share of sessions with a switch × measured 70%.
  const spend = $('#spend'), share = $('#share');
  if (spend && share) {
    const calc = () => {
      const s = +spend.value, p = +share.value / 100, cut = p * 0.7;
      for (const r of [spend, share]) r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min) * 100) + '%');
      $('#spendOut').textContent = '$' + s.toLocaleString('en-US');
      $('#shareOut').textContent = Math.round(p * 100) + '%';
      $('#saved').textContent = '$' + Math.round(s * cut).toLocaleString('en-US');
      $('#mult').textContent = (1 / (1 - cut)).toFixed(1) + '×';
    };
    spend.addEventListener('input', calc); share.addEventListener('input', calc); calc();
  }

  const fill = root => root.querySelectorAll('.f[data-w]').forEach(f => { f.style.width = f.dataset.w + '%'; });
  if (still) { fill(document); return; }
  document.documentElement.classList.add('js');

  // Border light that follows the pointer.
  $$('.lit').forEach(c => c.addEventListener('pointermove', e => {
    const r = c.getBoundingClientRect();
    c.style.setProperty('--x', (e.clientX - r.left) + 'px');
    c.style.setProperty('--y', (e.clientY - r.top) + 'px');
  }));

  // Buttons lean toward the pointer.
  $$('.btn.primary, .btn.mag').forEach(b => {
    b.addEventListener('pointermove', e => {
      const r = b.getBoundingClientRect();
      b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .18}px, ${(e.clientY - r.top - r.height / 2) * .3}px)`;
    });
    b.addEventListener('pointerleave', () => { b.style.transform = ''; });
  });

  // Count up: the first number in the text runs from 0 to its value.
  const odo = el => {
    const m = el.textContent.match(/^(\D*?)(\d+)(.*)$/s);
    if (!m) return;
    const [, pre, num, post] = m, to = +num;
    tween(1600, k => { el.textContent = pre + Math.round(to * k) + post; });
  };

  // Scramble: text resolves from random glyphs.
  const GLYPHS = '▓▒░/\\|_<>-=+*#%';
  const scramble = el => {
    const final = el.textContent;
    tween(900, k => {
      const n = Math.floor(final.length * k);
      el.textContent = final.slice(0, n) + [...final.slice(n)].map(c => c === ' ' ? ' ' : GLYPHS[Math.random() * GLYPHS.length | 0]).join('');
    }, () => { el.textContent = final; });
  };

  $$('.draw').forEach(p => { if (p.getTotalLength) p.style.setProperty('--len', Math.ceil(p.getTotalLength())); });
  $$('.rv').forEach(el => {
    const sibs = [...el.parentElement.children].filter(x => x.classList.contains('rv'));
    el.style.setProperty('--d', Math.max(0, sibs.indexOf(el)) * 90 + 'ms');
  });
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    const el = e.target;
    el.classList.add('in');
    fill(el);
    el.querySelectorAll('[data-odo]').forEach(odo);
    if (el.matches('.kicker')) scramble(el);
    io.unobserve(el);
  }), { threshold: 0.18 });
  $$('.rv, .kicker').forEach(el => io.observe(el));

  // Hero ghost: particles sampled from the logo drift, dissolve and re-form; the pointer pushes them away.
  const cv = $('#ghost');
  if (cv) {
    const ctx = cv.getContext('2d'), img = new Image();
    let pts = [], W = 0, H = 0, dpr = Math.min(2, devicePixelRatio || 1), mx = -1e4, my = -1e4, t0 = performance.now();
    const build = () => {
      const r = cv.getBoundingClientRect(); W = r.width; H = r.height;
      cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const S = 140, off = document.createElement('canvas'); off.width = off.height = S;
      const o = off.getContext('2d'); o.drawImage(img, 0, 0, S, S);
      let data; try { data = o.getImageData(0, 0, S, S).data; } catch { return; } // tainted on file://
      const scale = Math.min(W, H) * 1.2 / S, ox = (W - S * scale) / 2, oy = (H - S * scale) / 2;
      pts = [];
      for (let y = 0; y < S; y += 2) for (let x = 0; x < S; x += 2) {
        const i = (y * S + x) * 4;
        if (data[i + 3] > 128 && data[i] > 128) {
          const hx = ox + x * scale, hy = oy + y * scale;
          pts.push({ hx, hy, x: hx, y: hy, vx: 0, vy: 0, s: Math.random(), seed: Math.random() * 6.28 });
        }
      }
    };
    img.onload = () => { build(); requestAnimationFrame(frame); };
    img.src = cv.dataset.src;
    addEventListener('resize', build);
    cv.addEventListener('pointermove', e => { const r = cv.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top; });
    cv.addEventListener('pointerleave', () => { mx = my = -1e4; });
    let visible = true;
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(cv);
    function frame(now) {
      requestAnimationFrame(frame);
      if (!visible) return;
      const t = (now - t0) / 1000, cyc = t % 9;
      // 0–5.5s formed, 5.5–7.5s dissolving upward, 7.5–9s re-forming
      const loose = cyc < 5.5 ? 0 : cyc < 7.5 ? (cyc - 5.5) / 2 : Math.max(0, 1 - (cyc - 7.5) / 1.2);
      ctx.clearRect(0, 0, W, H);
      for (const p of pts) {
        const lift = loose * loose * (60 + p.s * 140);
        const tx = p.hx + Math.sin(t * 1.3 + p.seed) * (1.2 + loose * 30 * p.s);
        const ty = p.hy - lift + Math.cos(t * 1.1 + p.seed) * 1.2;
        let ax = (tx - p.x) * .06, ay = (ty - p.y) * .06;
        const dx = p.x - mx, dy = p.y - my, d2 = dx * dx + dy * dy;
        if (d2 < 9000) { const f = (9000 - d2) / 9000 * 3.2; ax += dx / Math.sqrt(d2 + 1) * f; ay += dy / Math.sqrt(d2 + 1) * f; }
        p.vx = (p.vx + ax) * .82; p.vy = (p.vy + ay) * .82; p.x += p.vx; p.y += p.vy;
        const a = (1 - loose * (.4 + p.s * .6)) * (.55 + p.s * .45);
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.fillRect(p.x, p.y, 1.8, 1.8);
      }
    }
  }

  // Terminal demo: the old conversation dissolves when /clear runs, then the new task starts.
  const demo = $('#demo');
  if (demo) {
    const lines = [...demo.querySelectorAll('.l')], ctxEl = $('#ctx'), bar = $('#ctxbar');
    const play = () => {
      lines.forEach(l => l.classList.remove('on', 'gone'));
      if (ctxEl) ctxEl.textContent = '176k'; if (bar) bar.style.width = '88%';
      let t = 300;
      lines.forEach(l => {
        setTimeout(() => {
          l.classList.add('on');
          if (l.dataset.drop) {
            lines.filter(x => x.classList.contains('old')).forEach((x, i) => setTimeout(() => x.classList.add('gone'), i * 90));
            if (ctxEl) tween(1200, k => { ctxEl.textContent = Math.round(176 - 158 * k) + 'k'; });
            if (bar) bar.style.width = '9%';
          }
        }, t);
        t += l.classList.contains('old') ? 160 : 720;
      });
      setTimeout(play, t + 4200);
    };
    new IntersectionObserver(([e], o) => { if (e.isIntersecting) { play(); o.disconnect(); } }).observe(demo);
  }
})();
