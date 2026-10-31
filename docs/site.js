(() => {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const ease = k => 1 - Math.pow(1 - k, 4);
  const tween = (ms, fn, done) => {
    const t0 = performance.now();
    const step = t => { const k = Math.max(0, Math.min(1, (t - t0) / ms)); fn(ease(k)); if (k < 1) requestAnimationFrame(step); else if (done) done(); };
    requestAnimationFrame(step);
  };

  // Dashboard stop point: scrolling down, the page stops once with the dashboard exactly in view. The next scroll
  // gesture moves inside it (dashboard-demo.html), and the page continues past its end.
  const dash = $('.dashframe');
  const STOP = () => ($('.top')?.getBoundingClientRect().bottom || 60) + 16;
  let hold = false, holdTimer;
  const release = () => { clearTimeout(holdTimer); holdTimer = setTimeout(() => { hold = false; }, 450); }; // gesture over
  window.__dashTop = () => dash ? dash.getBoundingClientRect().top - STOP() : 0;
  window.__dashStop = dy => {
    if (!dash) return false;
    if (hold) { release(); return true; }
    const gap = window.__dashTop();
    if (dy > 0 && gap > 1 && gap - dy <= 1) { // this step would carry the dashboard past the stop line
      scrollBy({ top: gap, left: 0, behavior: 'instant' });
      hold = true; release();
      dash.classList.add('live');
      return true;
    }
    return false;
  };
  if (dash) {
    dash.style.setProperty("--fit", `calc(100vh - ${Math.round(STOP()) + 24 + 80}px)`); // 80: frame bar and footer
    addEventListener('wheel', e => { if (window.__dashStop(e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY)) e.preventDefault(); }, { passive: false });
  }

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

  // Terminal logs play live: prompts are typed out, output lines appear one by one. Replays each time it's shown.
  const playLog = async log => {
    const lines = [...log.querySelectorAll('.l')], my = (log._run = (log._run || 0) + 1);
    lines.forEach(l => { if (l.dataset.text === undefined) l.dataset.text = l.textContent; l.classList.remove('on'); l.textContent = l.dataset.text; });
    if (still) { lines.forEach(l => l.classList.add('on')); return; }
    const pause = ms => new Promise(r => setTimeout(r, ms));
    await pause(250);
    for (const l of lines) {
      if (log._run !== my) return;
      if (l.classList.contains('u')) {
        const t = l.dataset.text; l.textContent = ''; l.classList.add('on', 'typing');
        for (let i = 1; i <= t.length; i++) { if (log._run !== my) return; l.textContent = t.slice(0, i); await pause(22); }
        l.classList.remove('typing'); await pause(380);
      } else { l.classList.add('on'); await pause(l.classList.contains('d') ? 260 : 520); }
    }
  };

  // Tabs: click or arrow keys; data-hash lists open a tab from the URL (legal.html#privacy).
  $$('[role="tablist"]').forEach(list => {
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    const p = pillFor(list, '[aria-selected="true"]');
    const show = (tab, focus, play = true) => {
      tabs.forEach(t => {
        const on = t === tab;
        t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
      });
      p.move(tab);
      if (play) document.getElementById(tab.getAttribute('aria-controls')).querySelectorAll('.tlog').forEach(playLog);
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
    show(fromHash || tabs[0], false, false);
    // the first tab plays once the tabs scroll into view
    new IntersectionObserver(([e], o) => {
      if (!e.isIntersecting) return;
      o.disconnect();
      const cur = tabs.find(t => t.getAttribute('aria-selected') === 'true');
      document.getElementById(cur.getAttribute('aria-controls')).querySelectorAll('.tlog').forEach(playLog);
    }, { threshold: .3 }).observe(list.parentElement);
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

  // Docs: mark the section being read in the sidebar and the on-this-page list.
  const heads = $$('.doc [id]');
  if (heads.length) {
    const mark = () => {
      let cur = heads[0].id;
      for (const h of heads) if (h.getBoundingClientRect().top < 140) cur = h.id;
      $$('.toc a, .dnav a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + cur));
      const c = $('.crumbs'); if (c) c.textContent = 'ghosted_ / Docs / ' + ($(`.toc a[href="#${cur}"]`)?.textContent || '');
    };
    addEventListener('scroll', mark, { passive: true }); mark();
  }

  // How it works: try-it playground. Mirrors the plugin's follow-up rules; the Haiku judge is simulated.
  const tryform = $('#tryform');
  if (tryform) {
    const q = $('#tryq'), log = $('#trylog'), ctx = $('#tryctx'), steps = $$('#trysteps li');
    const obvious = p => {
      const n = p.split(/\s+/).filter(Boolean).length;
      return n <= 2 || (n <= 8 && /^(ok(ay)?|yes|yep|no|nope|sure|thanks|thank you|great|nice|perfect|continue|go on|go ahead|do it|retry|try again|fix (it|that|this))\b/i.test(p))
        || (n <= 10 && /\b(you (already|just)|what you (saw|read|found|wrote|did)|as (before|above)|above|earlier|previous(ly)?|that (file|function|change|one|error|bug)|those)\b/i.test(p));
    };
    // simulated judge: continuing the auth fix is same, another job in the same app is related, anything else is new
    const aboutAuth = p => /\b(auth|login|logout|token|session|password|sign ?in|expir)/i.test(p);
    const continues = p => /^(also|and|now (fix|test|check)|why|explain|revert|undo|commit|test|check|run|cover|handle)\b|\b(the fix|this fix|you (changed|fixed|added))\b/i.test(p);
    const sameApp = p => aboutAuth(p) || /\b(settings|endpoint|api|page|component|build|test|readme|release notes|changelog)\b/i.test(p);
    let run = 0;
    const wait = ms => new Promise(r => setTimeout(r, still ? 0 : ms));
    const line = async (text, cls, my) => {
      const el = document.createElement('div'); if (cls) el.className = cls; log.append(el);
      if (still || cls !== 'u') { el.textContent = text; return; }
      el.classList.add('caret');
      for (let i = 1; i <= text.length && my === run; i++) { el.textContent = text.slice(0, i); await wait(18); }
      el.classList.remove('caret');
    };
    const mark = (name, state) => { const li = steps.find(x => x.dataset.s === name); if (li) li.classList.add(state); };
    const go = async text => {
      const my = ++run, p = text.trim();
      if (!p) return;
      steps.forEach(li => li.className = ''); log.textContent = ''; ctx.textContent = '176k';
      await line(p, 'u', my); await wait(300);
      if (my !== run) return;
      mark('check', 'on'); await wait(500);
      const forced = /^new:/i.test(p) ? 'new' : /^same:/i.test(p) ? 'same' : null;
      if (forced === 'same' || (!forced && obvious(p))) {
        mark('check', 'hit'); ['judge', 'clear', 'start'].forEach(n => mark(n, 'skip'));
        await line('  passes through · follow-up, no judge needed', 'd', my);
        await wait(400); await line('⏺ Working on it with the full context', '', my);
        return;
      }
      mark('judge', 'on'); await line('  judge: same, related or new? …', 'd', my); await wait(900);
      if (my !== run) return;
      if (!forced && aboutAuth(p) && continues(p)) {
        mark('judge', 'hit'); ['clear', 'start'].forEach(n => mark(n, 'skip'));
        await line('  judge: same (continues the auth fix) · context kept', 'd', my);
        await wait(400); await line('⏺ Continuing with the full context', '', my);
        return;
      }
      const related = !forced && sameApp(p), to = related ? 46 : 18;
      if (!forced) { await line(`  judge: ${related ? 'related (same project)' : 'new (unrelated)'}`, 'd', my); await wait(300); }
      await line(related ? 'ghosted_: this looks like a new task on the same work, so the chat is summarised first.'
        : 'ghosted_: this looks like a new task, so Claude starts on a fresh chat.', 'g', my);
      mark('clear', 'on'); await wait(500);
      await line(related ? '/compact' : '/clear', 'u', my); await line('  ✓ old chat archived  ✓ prompt saved', 'd', my);
      if (still) ctx.textContent = to + 'k'; else tween(900, k => { ctx.textContent = Math.round(176 - (176 - to) * k) + 'k'; });
      await wait(600); mark('start', 'on'); mark('start', 'hit');
      await line('Start the pending task.', 'u', my);
      await line(related ? '  ✓ summary of the auth work kept' : '  ✓ prompt restored with the few facts it needs', 'd', my);
      await wait(400); await line(`⏺ Working on: ${p.replace(/^new:\s*/i, '')}`, '', my);
    };
    tryform.addEventListener('submit', e => { e.preventDefault(); go(q.value); });
    $$('.chips button').forEach(b => b.addEventListener('click', () => { q.value = b.textContent; go(b.textContent); }));
    const shared = new URLSearchParams(location.search).get('try'); // how-it-works.html?try=<prompt> runs it on load
    if (shared) { q.value = shared; go(shared); }
  }

  // Hero card: old chat fades out, context drops, the new task starts. Plays once; Replay plays again.
  const hc = $('#herocard');
  if (hc) {
    const olds = [...hc.querySelectorAll('.cc.old')], news = [...hc.querySelectorAll('.cc.new')];
    const num = $('#hcnum'), bar = $('#hcbar'), again = $('#hcreplay');
    let timers = [];
    const at = (ms, fn) => timers.push(setTimeout(fn, still ? 0 : ms));
    const play = () => {
      timers.forEach(clearTimeout); timers = [];
      olds.forEach(x => x.classList.remove('gone')); news.forEach(x => x.classList.remove('on'));
      num.textContent = '176k'; bar.style.width = '88%'; again.hidden = true;
      at(900, () => news[0].classList.add('on'));
      at(1900, () => { olds.forEach((x, i) => setTimeout(() => x.classList.add('gone'), still ? 0 : i * 110));
        if (still) num.textContent = '18k'; else tween(1300, k => { num.textContent = Math.round(176 - 158 * k) + 'k'; });
        bar.style.width = '9%'; });
      at(2600, () => news[1].classList.add('on'));
      at(3300, () => news[2].classList.add('on'));
      at(4000, () => news[3].classList.add('on'));
      at(4800, () => { again.hidden = false; });
    };
    again.addEventListener('click', play);
    play();
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
