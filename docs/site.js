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

  // Hero ghost: the logo drawn as a dot matrix, once.
  const cv = $('#ghost');
  if (cv) {
    const img = new Image();
    const draw = () => {
      const ctx = cv.getContext('2d'), r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = r.width * dpr; cv.height = r.height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const S = 96, off = document.createElement('canvas'); off.width = off.height = S;
      const o = off.getContext('2d'); o.drawImage(img, 0, 0, S, S);
      let data; try { data = o.getImageData(0, 0, S, S).data; } catch { return; }
      const step = r.width / S * 1.05, ox = (r.width - S * step) / 2, oy = (r.height - S * step) / 2;
      ctx.clearRect(0, 0, r.width, r.height);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4, v = data[i] / 255;
        if (v < .4) continue;
        ctx.fillStyle = `rgba(255,255,255,${.25 + v * .75})`;
        ctx.beginPath(); ctx.arc(ox + x * step, oy + y * step, step * .32, 0, 6.283); ctx.fill();
      }
    };
    img.onload = draw; img.src = cv.dataset.src;
    addEventListener('resize', draw);
  }

  const fill = root => root.querySelectorAll('.f[data-w]').forEach(f => { f.style.width = f.dataset.w + '%'; });
  if (still) { fill(document); return; }
  document.documentElement.classList.add('js');

  // Count up: the first number in the text runs from 0 to its value.
  const odo = el => {
    const m = el.textContent.match(/^(\D*?)(\d+)(.*)$/s);
    if (!m) return;
    const [, pre, num, post] = m, to = +num;
    tween(1600, k => { el.textContent = pre + Math.round(to * k) + post; });
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
    io.unobserve(el);
  }), { threshold: 0.18 });
  $$('.rv').forEach(el => io.observe(el));

  // Terminal demo: plays once when it comes into view; Replay plays it again.
  const demo = $('#demo');
  if (demo) {
    const lines = [...demo.querySelectorAll('.l')], ctxEl = $('#ctx'), bar = $('#ctxbar'), again = $('#replay');
    let timers = [];
    const play = () => {
      timers.forEach(clearTimeout); timers = [];
      lines.forEach(l => l.classList.remove('on', 'gone'));
      if (ctxEl) ctxEl.textContent = '176k'; if (bar) bar.style.width = '88%';
      if (again) again.hidden = true;
      let t = 300;
      lines.forEach(l => {
        timers.push(setTimeout(() => {
          l.classList.add('on');
          if (l.dataset.drop) {
            lines.filter(x => x.classList.contains('old')).forEach(x => x.classList.add('gone'));
            if (ctxEl) tween(1200, k => { ctxEl.textContent = Math.round(176 - 158 * k) + 'k'; });
            if (bar) bar.style.width = '9%';
          }
        }, t));
        t += l.classList.contains('old') ? 140 : 650;
      });
      timers.push(setTimeout(() => { if (again) again.hidden = false; }, t + 400));
    };
    if (again) again.addEventListener('click', play);
    new IntersectionObserver(([e], o) => { if (e.isIntersecting) { play(); o.disconnect(); } }, { threshold: .5 }).observe(demo);
  }
})();
