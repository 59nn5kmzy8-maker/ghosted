(() => {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];

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

  // Tabs: click or arrow keys; the hash opens a tab directly (legal.html#privacy).
  $$('[role="tablist"]').forEach(list => {
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    const show = (tab, focus) => {
      tabs.forEach(t => {
        const on = t === tab;
        t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
      });
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

  $$('.draw').forEach(p => { if (p.getTotalLength) p.style.setProperty('--len', Math.ceil(p.getTotalLength())); });

  const tween = (ms, fn) => {
    const t0 = performance.now();
    const step = t => { const k = Math.min(1, (t - t0) / ms); fn(1 - Math.pow(1 - k, 3)); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };

  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    const el = e.target;
    el.classList.add('in');
    fill(el);
    el.querySelectorAll('[data-count]').forEach(n => {
      const to = +n.dataset.count, suf = n.dataset.suffix || '';
      tween(1200, k => { const v = Math.round(to * k); n.textContent = (v < 0 ? '−' + -v : v) + suf; });
    });
    io.unobserve(el);
  }), { threshold: 0.2 });
  $$('.rv').forEach(el => io.observe(el));

  // Terminal demo on a loop.
  const demo = $('#demo');
  if (demo) {
    const lines = [...demo.querySelectorAll('.l')];
    const ctx = $('#ctx');
    const play = () => {
      lines.forEach(l => l.classList.remove('on'));
      if (ctx) ctx.textContent = '176k';
      lines.forEach((l, i) => setTimeout(() => {
        l.classList.add('on');
        if (ctx && l.dataset.drop) tween(1000, k => { ctx.textContent = Math.round(176 - 158 * k) + 'k'; });
      }, 400 + i * 650));
      setTimeout(play, 400 + lines.length * 650 + 4000);
    };
    play();
  }
})();
