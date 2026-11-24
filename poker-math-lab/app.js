/* Poker Math Lab — UI 逻辑（关卡制：大厅选关 · 通关解锁 · 段位滚动窗口） */
(function () {
  'use strict';
  const E = window.PokerEngine;

  const MODULES = [
    { id: 'outs',     num: '01', name: 'Outs 速算',  par: 5,  tier: 0 },
    { id: 'equity',   num: '02', name: '二四法则',   par: 3,  tier: 0 },
    { id: 'potodds',  num: '03', name: '底池赔率',   par: 6,  tier: 0 },
    { id: 'numbers',  num: '04', name: '数字敏感',   par: 4,  tier: 0 },
    { id: 'decision', num: '05', name: '综合决策',   par: 9,  tier: 0 },
    { id: 'dirty',    num: '06', name: '有效 Outs',  par: 8,  tier: 1 },
    { id: 'matchups', num: '07', name: '对决锚点',   par: 4,  tier: 1 },
    { id: 'combos',   num: '08', name: '组合计数',   par: 8,  tier: 1 },
    { id: 'ev',       num: '09', name: 'EV 与隐含',  par: 12, tier: 1 },
    { id: 'defense',  num: '10', name: '防线数学',   par: 6,  tier: 2 },
    { id: 'rangeeq',  num: '11', name: '范围胜率',   par: 10, tier: 2 },
    { id: 'semibluff',num: '12', name: '半诈唬 EV',  par: 12, tier: 2 },
    { id: 'spr',      num: '13', name: 'SPR 承诺',   par: 5,  tier: 2 },
  ];
  const OUTS_TIERS = [
    { id: 'all',   label: '全部' },
    { id: 'basic', label: '基础听牌' },
    { id: 'combo', label: '组合听牌' },
  ];
  const TIER_LABELS = ['基础层 · BASIC', '修正层 · CORRECTION', '博弈层 · GAME THEORY'];
  const ROUND_SIZE = 20;
  const WRONGS_CAP = 50;
  const PASS_ACC = 90;   /* 通关线：单组 20 题正确率 ≥ 90% 且均时 ≤ 目标 → 解锁下一关 */
  const RECENT_WIN = 40; /* 段位窗口：最近 40 题同标准 → 升段 */

  /* ---------- 段位体系 ----------
     达标线改为「最近 40 题」滚动窗口：正确率 ≥ 90% · 均时 ≤ 目标用时。
     早期错题不再永久拖后腿——段位衡量的是你现在的水平，不是你的黑历史。 */
  const TIER_GROUPS = {
    base:       ['outs', 'equity', 'potodds', 'numbers'],
    decision:   ['decision'],
    correction: ['dirty', 'matchups', 'combos', 'ev'],
    game:       ['defense', 'rangeeq', 'semibluff', 'spr'],
  };
  const LEVELS = [
    { name: 'Lv0 · 感觉派',     pct: '与约 60% 玩家同级', desc: '凭牌力绝对值和情绪决策，不计算' },
    { name: 'Lv1 · 数字觉醒',   pct: '超过约 70% 玩家',   desc: 'outs / 二四法则 / 底池赔率成本能（01-04 达标）' },
    { name: 'Lv2 · 赔率决策',   pct: '超过约 80% 玩家',   desc: '每次跟注都过一遍胜率 vs 赔率（05 达标）' },
    { name: 'Lv3 · 现实修正',   pct: '超过约 90% 玩家',   desc: '脏 outs、组合计数、EV——现场几乎没人做（06-09 达标）' },
    { name: 'Lv4 · 博弈结构',   pct: '超过约 95% 玩家',   desc: 'MDF / 半诈唬 EV / 范围胜率，业余池天花板（10-13 达标）' },
    { name: 'Lv5 · 概率派大师', pct: '业余池约前 1~3%',   desc: '05 综合决策累计 100+ 题 · 正确率 ≥95% · 均时 ≤6s' },
  ];
  function windowStat(id) {
    const r = state.stats.recent[id];
    if (!r || !r.length) return { n: 0, acc: 0, avg: Infinity };
    let ok = 0, ms = 0;
    for (const x of r) { if (x.ok) ok++; ms += x.ms; }
    return { n: r.length, acc: (ok / r.length) * 100, avg: ms / r.length / 1000 };
  }
  function modQualified(id) {
    const m = MODULES.find(x => x.id === id);
    const w = windowStat(id);
    if (w.n < RECENT_WIN) return false;
    return (w.acc / 100) >= 0.9 && w.avg <= m.par;
  }
  const groupDone = ids => ids.every(modQualified);
  function computeLevel() {
    let lv = 0;
    if (groupDone(TIER_GROUPS.base)) lv = 1;
    if (lv === 1 && groupDone(TIER_GROUPS.decision)) lv = 2;
    if (lv === 2 && groupDone(TIER_GROUPS.correction)) lv = 3;
    if (lv === 3 && groupDone(TIER_GROUPS.game)) lv = 4;
    if (lv === 4) {
      const st = state.stats.modules.decision;
      if (st.n >= 100 && st.ok / st.n >= 0.95 && st.ms / st.n / 1000 <= 6) lv = 5;
    }
    return lv;
  }

  /* ---------- 关卡解锁（通关 = 单组合格） ---------- */
  const isPassed = id => !!state.stats.passed[id];
  const isUnlocked = i => i === 0 || isPassed(MODULES[i - 1].id) || modQualified(MODULES[i - 1].id);

  function renderProgress() {
    const lv = computeLevel();
    $('lvl-badge').textContent = LEVELS[lv].name.split(' · ')[0];
    $('lvl-current').innerHTML =
      `<div class="lv">${LEVELS[lv].name}</div>` +
      `<div class="pct">${LEVELS[lv].pct}</div>` +
      `<div class="lvdesc">${LEVELS[lv].desc}</div>`;
    $('lvl-ladder').innerHTML = LEVELS.map((L, i) => {
      const cls = i < lv ? 'done' : (i === lv ? 'now' : '');
      const mark = i < lv ? '✓ ' : (i === lv ? '▸ ' : '');
      return `<div class="lvl-row ${cls}"><span class="lvn">${mark}${L.name}</span><span class="lvp">${L.pct}</span></div>`;
    }).join('');
    $('mod-progress').innerHTML = MODULES.map((m, i) => {
      const w = windowStat(m.id);
      const acc = w.n ? Math.round(w.acc) + '%' : '—';
      const avg = w.n ? w.avg.toFixed(1) + 's' : '—';
      const ok = modQualified(m.id);
      const status = ok ? '<span class="st-ok">已达标</span>'
        : (!isUnlocked(i) ? '<span class="st-no">🔒 锁定</span>'
        : (w.n ? '<span class="st-ing">窗口 ' + w.n + '/' + RECENT_WIN + '</span>' : '<span class="st-no">未开始</span>'));
      return `<div class="mod-row">` +
        `<span class="dim">${m.num}</span><span class="nm">${m.name}</span>` +
        `<span>${w.n}</span><span>${acc}</span><span>${avg}</span>` +
        `<span class="par dim">≤${m.par}s</span><span>${status}</span></div>`;
    }).join('');
  }

  /* ---------- 统计持久化 ---------- */
  const LS_KEY = 'pokerMathLab.v1';
  function blankStats() {
    const o = {};
    for (const m of MODULES) o[m.id] = { n: 0, ok: 0, ms: 0, streak: 0, best: 0 };
    return o;
  }
  function blankRecent() {
    const o = {};
    for (const m of MODULES) o[m.id] = [];
    return o;
  }
  function loadStats() {
    try {
      const s = JSON.parse(localStorage.getItem(LS_KEY));
      if (s && s.modules) {
        if (!Array.isArray(s.wrongs)) s.wrongs = [];
        if (!s.passed || typeof s.passed !== 'object') s.passed = {};
        if (!s.recent || typeof s.recent !== 'object') s.recent = {};
        for (const m of MODULES) {
          if (!s.modules[m.id]) s.modules[m.id] = { n: 0, ok: 0, ms: 0, streak: 0, best: 0 };
          if (!Array.isArray(s.recent[m.id])) s.recent[m.id] = [];
        }
        return s;
      }
    } catch (e) { /* ignore */ }
    return { modules: blankStats(), wrongs: [], passed: {}, recent: blankRecent() };
  }
  function saveStats() { localStorage.setItem(LS_KEY, JSON.stringify(state.stats)); }

  const state = {
    screen: 'lobby', /* lobby | quiz */
    module: 'outs',
    outsTier: 'all',
    q: null,
    input: '',
    answered: false,
    start: 0,
    timerId: null,
    stats: loadStats(),
    session: {},   /* 本次打开以来的练习（不持久化），按模块计 */
    round: { n: 0, ok: 0, ms: 0 }, /* 当前这一组 20 题 */
    replay: null,  /* { queue:[entry], idx } */
  };
  for (const m of MODULES) state.session[m.id] = { n: 0, ok: 0, ms: 0 };
  /* 迁移：历史只有聚合数据。题数 ≤ 窗口时，最近窗口 = 全部历史，
     可按比例回填（对错顺序不可考，但窗口判定只依赖计数与均时，等价） */
  (function seedRecent() {
    let changed = false;
    for (const m of MODULES) {
      const st = state.stats.modules[m.id];
      const r = state.stats.recent[m.id];
      if (!r.length && st.n > 0 && st.n <= RECENT_WIN) {
        const avg = st.ms / st.n;
        for (let i = 0; i < st.n; i++) r.push({ ok: i < st.ok, ms: avg });
        changed = true;
      }
    }
    if (changed) saveStats();
  })();

  /* ---------- DOM ---------- */
  const $ = id => document.getElementById(id);
  const els = {
    modules: $('modules'), subnav: $('subnav'),
    boardZone: $('board-zone'), boardLabel: $('board-label'), boardCards: $('board-cards'),
    heroZone: $('hero-zone'), heroCards: $('hero-cards'),
    potLine: $('pot-line'),
    question: $('question'), inputArea: $('input-area'), feedback: $('feedback'),
    fTime: $('f-time'), fStreak: $('f-streak'), fAcc: $('f-acc'), fAvg: $('f-avg'), fRound: $('f-round'),
    headStats: $('head-stats'), replayBtn: $('replay-btn'), homeBtn: $('home-btn'),
    overlay: $('round-overlay'), roundTitle: $('round-title'), roundGrid: $('round-grid'),
  };

  /* ---------- 出题 ---------- */
  function genFor(mod) {
    switch (mod) {
      case 'outs':     return E.genOutsQuestion(state.outsTier);
      case 'equity':   return E.genEquityQuestion();
      case 'potodds':  return E.genPotOddsQuestion();
      case 'decision': return E.genDecisionQuestion();
      case 'numbers':  return E.genNumberSenseQuestion();
      case 'dirty':    return E.genDirtyOutsQuestion();
      case 'matchups': return E.genMatchupQuestion();
      case 'combos':   return E.genCombosQuestion();
      case 'ev':       return E.genEvQuestion();
      case 'defense':  return E.genDefenseQuestion();
      case 'rangeeq':  return E.genRangeEquityQuestion();
      case 'semibluff':return E.genSemiBluffQuestion();
      case 'spr':      return E.genSprQuestion();
    }
  }

  function nextQuestion() {
    if (state.replay) {
      if (state.replay.idx >= state.replay.queue.length) {
        state.replay = null; /* 回放队列消化完毕，回到无限流 */
      } else {
        state.q = state.replay.queue[state.replay.idx].q;
      }
    }
    if (!state.replay) state.q = genFor(state.module);
    state.input = '';
    state.answered = false;
    state.start = performance.now();
    renderQuestion();
    startTimer();
  }

  /* ---------- 错题本 ---------- */
  function addWrong(q, your) {
    const w = state.stats.wrongs;
    const i = w.findIndex(x => x.q.question === q.question);
    if (i >= 0) w.splice(i, 1); /* 同一题只留最新记录 */
    w.push({ mod: q.module, q, your, ts: Date.now() });
    while (w.length > WRONGS_CAP) w.shift();
  }
  function removeWrong(entry) {
    const w = state.stats.wrongs;
    const i = w.indexOf(entry);
    if (i >= 0) w.splice(i, 1);
  }
  function startReplay() {
    if (!state.stats.wrongs.length) return;
    state.replay = { queue: state.stats.wrongs.slice(), idx: 0 };
    setScreen('quiz');
    renderNav(); renderSubnav();
    nextQuestion();
  }
  function renderReplayBtn() {
    const n = state.stats.wrongs.length;
    els.replayBtn.style.display = n ? '' : 'none';
    els.replayBtn.textContent = `错题回放 · ${n}`;
  }

  /* ---------- 大厅 / 关卡 ---------- */
  function setScreen(s) {
    state.screen = s;
    const lobby = s === 'lobby';
    if (lobby) stopTimer();
    $('lobby').style.display = lobby ? '' : 'none';
    $('stage').style.display = lobby ? 'none' : '';
    els.modules.style.display = lobby ? 'none' : '';
    els.subnav.style.display = lobby ? 'none' : '';
    els.homeBtn.style.display = lobby ? 'none' : '';
    if (lobby) renderLobby();
  }
  function startModule(id) {
    state.module = id;
    state.replay = null;
    state.round = { n: 0, ok: 0, ms: 0 };
    setScreen('quiz');
    renderNav(); renderSubnav();
    nextQuestion();
  }
  function backToLobby() {
    state.replay = null;
    hideRoundSummary();
    setScreen('lobby');
    updateStatsBar();
  }

  function renderLobby() {
    const lv = computeLevel();
    $('lobby-lv').textContent = `${LEVELS[lv].name} · ${LEVELS[lv].pct}`;
    const host = $('lobby-tiers');
    host.innerHTML = '';
    for (let t = 0; t < TIER_LABELS.length; t++) {
      const label = document.createElement('div');
      label.className = 'tier-label';
      label.textContent = TIER_LABELS[t];
      host.appendChild(label);
      const grid = document.createElement('div');
      grid.className = 'lv-grid';
      MODULES.forEach((m, i) => {
        if (m.tier !== t) return;
        const unlocked = isUnlocked(i);
        const passed = isPassed(m.id);
        const qualified = modQualified(m.id);
        const st = state.stats.modules[m.id];
        const w = windowStat(m.id);
        const status = passed
          ? '<span class="lv-status pass">✓ 已通关</span>'
          : (unlocked ? '<span class="lv-status open">▸ 可挑战</span>' : '<span class="lv-status lock">🔒 未解锁</span>');
        const winTxt = qualified
          ? '段位达标 ✓'
          : (w.n ? `段位窗口 ${w.n}/${RECENT_WIN} · ${Math.round(w.acc)}% · ${w.avg.toFixed(1)}s` : `段位窗口 0/${RECENT_WIN}`);
        const b = document.createElement('button');
        b.className = 'lv-card t' + m.tier + (unlocked ? '' : ' locked');
        b.innerHTML =
          `<div class="lv-top"><span class="lv-num">${m.num} /</span>${status}</div>` +
          `<div class="lv-name">${m.name}</div>` +
          `<div class="lv-meta">` +
            `<span>目标 ≤${m.par}s</span><span>已练 ${st.n}</span>` +
            `<span style="color:${qualified ? 'var(--pass)' : 'var(--faint)'}">${winTxt}</span>` +
          `</div>` +
          (unlocked ? '' : `<div class="lv-req">先通关上一关：${MODULES[i - 1].num} ${MODULES[i - 1].name}（20 题 · ≥${PASS_ACC}% · ≤${MODULES[i - 1].par}s）</div>`);
        if (unlocked) b.addEventListener('click', () => startModule(m.id));
        grid.appendChild(b);
      });
      host.appendChild(grid);
    }
  }

  /* ---------- 渲染 ---------- */
  function cardEl(c, hero, idx) {
    const d = document.createElement('div');
    d.className = 'card' + (E.isRedSuit(c.s) ? ' red' : '') + (hero ? ' hero-card' : '');
    d.style.animationDelay = (idx * 70) + 'ms';
    d.innerHTML = `<span class="r">${E.rankLabel(c.r)}</span><span class="s">${E.SUITS[c.s]}</span>`;
    return d;
  }

  function renderQuestion() {
    const q = state.q;
    const scen = q.scen;

    if (scen) {
      els.heroZone.style.display = '';
      els.heroCards.innerHTML = '';
      scen.hero.forEach((c, i) => els.heroCards.appendChild(cardEl(c, true, i)));
      if (scen.board && scen.board.length) {
        els.boardZone.style.display = '';
        els.boardLabel.textContent = '牌面 · ' + (scen.street === 'flop' ? 'FLOP' : 'TURN');
        els.boardCards.innerHTML = '';
        scen.board.forEach((c, i) => els.boardCards.appendChild(cardEl(c, false, i)));
      } else {
        els.boardZone.style.display = 'none';
      }
    } else {
      els.boardZone.style.display = 'none';
      els.heroZone.style.display = 'none';
    }

    if (q.P != null) {
      els.potLine.style.display = '';
      els.potLine.innerHTML =
        `<span>底池<b>${q.P}</b></span><span class="sig">对手下注<b>${q.B}</b></span>` +
        (q.module === 'decision'
          ? `<span>你的听牌<b style="color:var(--faint);font-size:13px">（自己数 outs）</b></span>`
          : '');
    } else {
      els.potLine.style.display = 'none';
    }

    els.question.textContent = q.question;
    const mod = MODULES.find(m => m.id === q.module);
    const sub = document.createElement('span');
    sub.className = 'qsub';
    sub.textContent = state.replay
      ? `错题回放 ${state.replay.idx + 1}/${state.replay.queue.length} · ${mod.num} ${mod.name} · 目标 ≤ ${mod.par}s（点关卡地图可退出回放）`
      : `${mod.num} ${mod.name} · 目标用时 ≤ ${mod.par}s · 本组 ${state.round.n}/${ROUND_SIZE}`;
    els.question.appendChild(sub);

    els.feedback.className = '';
    els.feedback.innerHTML = '';
    if (q.module === 'decision') renderDecisionInput();
    else renderNumericInput(q.unit);

    updateStatsBar();
  }

  function renderNumericInput(q) {
    els.inputArea.innerHTML = '';
    const disp = document.createElement('div');
    disp.className = 'answer-display';
    disp.id = 'answer-display';
    const pad = document.createElement('div');
    pad.className = 'keypad';
    const keys = ['1','2','3','4','5','6','7','8','9','⌫','0','✓'];
    for (const k of keys) {
      const b = document.createElement('button');
      b.className = 'key' + (k === '✓' ? ' go' : (k === '⌫' ? ' fn' : ''));
      b.textContent = k;
      b.addEventListener('click', () => pressKey(k));
      pad.appendChild(b);
    }
    els.inputArea.appendChild(disp);
    els.inputArea.appendChild(pad);
    paintAnswerDisplay(q.unit);
  }

  function paintAnswerDisplay(unit) {
    const disp = $('answer-display');
    if (!disp) return;
    const val = state.input;
    disp.innerHTML =
      (val ? `<span>${val}</span>` : `<span class="placeholder">?</span>`) +
      (unit ? `<span class="unit">${unit}</span>` : '') +
      `<span class="caret"></span>`;
  }

  function renderDecisionInput() {
    els.inputArea.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'decide-row';
    const call = document.createElement('button');
    call.className = 'decide-btn decide-call';
    call.innerHTML = 'CALL<small>跟注 · 按 C</small>';
    call.addEventListener('click', () => answerDecision('CALL'));
    const fold = document.createElement('button');
    fold.className = 'decide-btn decide-fold';
    fold.innerHTML = 'FOLD<small>弃牌 · 按 F</small>';
    fold.addEventListener('click', () => answerDecision('FOLD'));
    row.appendChild(call);
    row.appendChild(fold);
    els.inputArea.appendChild(row);
  }

  /* ---------- 输入与判定 ---------- */
  function pressKey(k) {
    if (state.answered) { if (k === '✓') advance(); return; }
    if (k === '⌫') state.input = state.input.slice(0, -1);
    else if (k === '✓') { submitNumeric(); return; }
    else if (state.input.length < 6) state.input += k;
    paintAnswerDisplay(state.q.unit);
  }

  function submitNumeric() {
    if (state.answered || state.input === '') return;
    const v = parseFloat(state.input);
    if (isNaN(v)) return;
    const q = state.q;
    const ok = Math.abs(v - q.answer) <= (q.tolerance || 0) + 1e-9;
    finish(ok, `你的答案 ${v}${q.unit} · 正确 ${Number(q.answer.toFixed(1))}${q.unit}`, state.input);
  }

  function answerDecision(choice) {
    if (state.answered) return;
    finish(choice === state.q.answer, `你的选择 ${choice} · 正确 ${state.q.answer}`, choice);
  }

  function finish(ok, verdictLine, your) {
    state.answered = true;
    stopTimer();
    const ms = performance.now() - state.start;
    const mod = state.q.module;
    const st = state.stats.modules[mod];
    st.n++; st.ms += ms;
    if (ok) { st.ok++; st.streak++; st.best = Math.max(st.best, st.streak); }
    else st.streak = 0;

    const se = state.session[mod];
    se.n++; se.ms += ms; if (ok) se.ok++;
    if (!state.replay) {
      state.round.n++; state.round.ms += ms; if (ok) state.round.ok++;
      /* 段位滚动窗口：最近 40 题 */
      const r = state.stats.recent[mod];
      r.push({ ok, ms });
      while (r.length > RECENT_WIN) r.shift();
    }

    /* 错题本：普通模式答错入库；回放模式答对销账、再错排到队尾 */
    const replayEntry = state.replay ? state.replay.queue[state.replay.idx] : null;
    if (!ok && !state.replay) addWrong(state.q, your);
    if (ok && replayEntry) removeWrong(replayEntry);
    saveStats();
    if (state.replay) {
      state.replay.idx++;
      if (!ok && replayEntry) state.replay.queue.push(replayEntry);
    }

    const fb = els.feedback;
    fb.className = 'show ' + (ok ? 'pass' : 'fail');
    fb.innerHTML =
      `<span class="verdict">${ok ? 'PASS' : 'MISS'} · ${(ms / 1000).toFixed(1)}s</span>` +
      `<div>${verdictLine}</div>` +
      `<div>${state.q.explain}</div>` +
      `<div class="next-hint">${ok ? '即将自动下一题…' : (state.replay ? '已排到错题队尾 · Enter 继续' : '已存入错题本 · Enter 下一题')}</div>`;

    updateStatsBar();
    renderReplayBtn();

    const roundHit = !state.replay && state.round.n === ROUND_SIZE;
    if (roundHit) {
      showRoundSummary(mod);
    } else if (ok) {
      setTimeout(() => { if (state.answered) advance(); }, 1300);
    }
  }

  /* 统一的前进入口：回放队首 / 普通下一题 */
  function advance() { nextQuestion(); }

  /* ---------- 组小结（通关判定与解锁） ---------- */
  function showRoundSummary(mod) {
    const m = MODULES.find(x => x.id === mod);
    const idx = MODULES.findIndex(x => x.id === mod);
    const next = MODULES[idx + 1] || null;
    const r = state.round;
    const w = windowStat(mod);

    const rAcc = r.n ? (r.ok / r.n) * 100 : 0;
    const rAvg = r.n ? r.ms / r.n / 1000 : Infinity;
    const roundPassed = r.n >= ROUND_SIZE && rAcc >= PASS_ACC && rAvg <= m.par;

    let verdict, unlock;
    if (roundPassed) {
      state.stats.passed[mod] = true;
      saveStats();
      verdict = `<b style="color:var(--pass)">✓ 通关</b>`;
      unlock = next
        ? `<b style="color:var(--pass)">已解锁 ${next.num} ${next.name}</b>`
        : `<b style="color:var(--pass)">全部关卡已通关</b>`;
    } else {
      const reasons = [];
      if (rAcc < PASS_ACC) reasons.push(`正确率 ${Math.round(rAcc)}% < ${PASS_ACC}%`);
      if (rAvg > m.par) reasons.push(`均时 ${rAvg.toFixed(1)}s > ${m.par}s`);
      verdict = `<b style="color:var(--fail)">✗ 未通关</b>`;
      unlock = `<b style="color:var(--warn)">${reasons.join(' · ')}</b>`;
    }

    const seRound = Math.ceil(state.session[mod].n / ROUND_SIZE);
    els.roundTitle.textContent = `${m.num} ${m.name} · 第 ${seRound} 组完成`;
    els.roundGrid.innerHTML =
      `<div><span>本组正确率</span><b>${r.n ? Math.round(rAcc) + '%' : '—'}（需 ≥${PASS_ACC}%）</b></div>` +
      `<div><span>本组均时</span><b>${r.n ? rAvg.toFixed(1) + 's' : '—'}（需 ≤${m.par}s）</b></div>` +
      `<div><span>段位窗口</span><b>${w.n}/${RECENT_WIN} · ${w.n ? Math.round(w.acc) + '%' : '—'} · ${w.n ? w.avg.toFixed(1) + 's' : '—'}</b></div>` +
      `<div><span>段位判定</span><b style="color:${modQualified(mod) ? 'var(--pass)' : 'var(--faint)'}">${modQualified(mod) ? '✓ 已达标' : '未达标'}</b></div>` +
      `<div><span>本组判定</span>${verdict}</div>` +
      `<div><span>关卡进度</span>${unlock}</div>`;
    els.overlay.classList.add('open');

    /* 进入下一组 */
    state.round = { n: 0, ok: 0, ms: 0 };
    renderNav(); /* 解锁状态可能变化 */
  }
  function hideRoundSummary() { els.overlay.classList.remove('open'); }

  /* ---------- 计时 ---------- */
  function startTimer() {
    stopTimer();
    state.timerId = setInterval(() => {
      const s = (performance.now() - state.start) / 1000;
      els.fTime.textContent = s.toFixed(1) + 's';
      const mod = MODULES.find(m => m.id === state.q.module);
      els.fTime.style.color = s > mod.par ? 'var(--warn)' : '';
    }, 100);
  }
  function stopTimer() { if (state.timerId) { clearInterval(state.timerId); state.timerId = null; } }

  /* ---------- 统计栏 ---------- */
  function fmtAcc(st) { return st.n ? Math.round((st.ok / st.n) * 100) + '%' : '—'; }
  function fmtAvg(st) { return st.n ? (st.ms / st.n / 1000).toFixed(1) + 's' : '—'; }
  function updateStatsBar() {
    const st = state.stats.modules[state.module];
    els.fStreak.textContent = st.streak;
    els.fAcc.textContent = fmtAcc(st);
    els.fAvg.textContent = fmtAvg(st);
    els.fRound.textContent = state.round.n + '/' + ROUND_SIZE;
    let tn = 0, tok = 0, tms = 0, best = 0;
    for (const m of MODULES) {
      const s = state.stats.modules[m.id];
      tn += s.n; tok += s.ok; tms += s.ms; best = Math.max(best, s.best);
    }
    els.headStats.innerHTML =
      `<span>总题数<b>${tn}</b></span>` +
      `<span>总正确率<b>${tn ? Math.round((tok / tn) * 100) + '%' : '—'}</b></span>` +
      `<span>总均时<b>${tn ? (tms / tn / 1000).toFixed(1) + 's' : '—'}</b></span>` +
      `<span class="stk">最佳连击<b>${best}</b></span>`;
    const lvEl = $('lvl-badge');
    if (lvEl) lvEl.textContent = LEVELS[computeLevel()].name.split(' · ')[0];
  }

  /* ---------- 导航 ---------- */
  function renderNav() {
    els.modules.innerHTML = '';
    MODULES.forEach((m, i) => {
      const unlocked = isUnlocked(i);
      const b = document.createElement('button');
      b.className = 'mod-btn t' + m.tier + (m.id === state.module ? ' active' : '') + (unlocked ? '' : ' locked');
      b.innerHTML = `<span class="num">${unlocked ? m.num + ' /' : '🔒'}</span><span class="nm">${m.name}${isPassed(m.id) ? ' ✓' : ''}</span>`;
      if (unlocked) {
        b.addEventListener('click', () => {
          state.module = m.id;
          state.replay = null; /* 切模块即退出回放 */
          state.round = { n: 0, ok: 0, ms: 0 };
          renderNav(); renderSubnav(); nextQuestion();
        });
      }
      els.modules.appendChild(b);
    });
  }
  function renderSubnav() {
    els.subnav.innerHTML = '';
    if (state.module !== 'outs') return;
    for (const t of OUTS_TIERS) {
      const b = document.createElement('button');
      b.className = 'chip' + (t.id === state.outsTier ? ' active' : '');
      b.textContent = t.label;
      b.addEventListener('click', () => { state.outsTier = t.id; state.replay = null; state.round = { n: 0, ok: 0, ms: 0 }; renderSubnav(); nextQuestion(); });
      els.subnav.appendChild(b);
    }
  }

  /* ---------- 速查表 ---------- */
  const cheat = $('cheat');
  $('cheat-toggle').addEventListener('click', () => cheat.classList.toggle('open'));
  $('cheat-close').addEventListener('click', () => cheat.classList.remove('open'));

  /* ---------- 错题回放 / 统计重置 / 小结 / 进度 / 大厅 ---------- */
  els.replayBtn.addEventListener('click', startReplay);
  els.homeBtn.addEventListener('click', backToLobby);
  $('round-home').addEventListener('click', backToLobby);
  $('reset-stats').addEventListener('click', () => {
    state.stats = { modules: blankStats(), wrongs: [], passed: {}, recent: blankRecent() };
    state.replay = null;
    state.round = { n: 0, ok: 0, ms: 0 };
    saveStats();
    updateStatsBar();
    renderReplayBtn();
    renderNav();
    if (state.screen === 'lobby') renderLobby();
  });
  $('round-continue').addEventListener('click', () => { hideRoundSummary(); nextQuestion(); });
  $('progress-btn').addEventListener('click', () => { renderProgress(); $('progress-overlay').classList.add('open'); });
  $('progress-close').addEventListener('click', () => $('progress-overlay').classList.remove('open'));

  /* ---------- PWA ---------- */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* 非安全上下文（如局域网 http）时静默降级 */ });
  }

  /* ---------- 键盘 ---------- */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      cheat.classList.remove('open');
      $('progress-overlay').classList.remove('open');
      return;
    }
    if (state.screen === 'lobby') return;
    if (els.overlay.classList.contains('open')) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hideRoundSummary(); nextQuestion(); }
      return;
    }
    if (state.answered) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); advance(); }
      return;
    }
    if (state.q && state.q.module === 'decision') {
      if (e.key === 'c' || e.key === 'C') answerDecision('CALL');
      if (e.key === 'f' || e.key === 'F') answerDecision('FOLD');
      return;
    }
    if (/^[0-9]$/.test(e.key)) pressKey(e.key);
    else if (e.key === 'Backspace') pressKey('⌫');
    else if (e.key === 'Enter') pressKey('✓');
  });

  /* ---------- 启动：进大厅，不直接出题 ---------- */
  renderNav();
  renderSubnav();
  renderReplayBtn();
  updateStatsBar();
  setScreen('lobby');
})();
