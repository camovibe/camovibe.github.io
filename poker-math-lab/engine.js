/* ============================================================
   Poker Math Lab — 出题引擎（UMD：浏览器 / Node 通用）
   所有听牌场景的 outs 由构造参数决定，并可用 recount() 独立重算验证。
   ============================================================ */
(function (global) {
  'use strict';

  const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANK_LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

  const rankLabel = r => (r <= 10 ? String(r) : RANK_LABEL[r]);
  const cardLabel = c => rankLabel(c.r) + SUITS[c.s];
  const isRedSuit = s => s === 1 || s === 2;

  /* ---- 可注入随机源（测试用） ---- */
  let rng = Math.random;
  function setRng(f) { rng = f; }
  const randInt = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const pick = arr => arr[randInt(0, arr.length - 1)];
  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = randInt(0, i);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ---- 取牌上下文：保证不重复 ---- */
  function makeCtx() { return { usedCards: new Set(), rankCount: new Map() }; }
  function take(ctx, r, s) {
    const key = r * 4 + s;
    if (ctx.usedCards.has(key)) throw new Error('duplicate card ' + key);
    ctx.usedCards.add(key);
    ctx.rankCount.set(r, (ctx.rankCount.get(r) || 0) + 1);
    return { r, s };
  }
  /* 随机取一张：避开禁止 rank 集合与禁止花色集合，且不撞已用的牌 */
  function takeAvoid(ctx, forbidRanks, forbidSuits) {
    const free = [];
    for (const r of RANKS) {
      if (forbidRanks.has(r)) continue;
      for (let s = 0; s < 4; s++) {
        if (forbidSuits.has(s) || ctx.usedCards.has(r * 4 + s)) continue;
        free.push({ r, s });
      }
    }
    if (!free.length) throw new Error('no free card');
    const c = pick(free);
    return take(ctx, c.r, c.s);
  }

  const KIND_INFO = {
    flush:     { name: '同花听牌',   tier: 'basic'  },
    oesd:      { name: '两头顺听',   tier: 'basic'  },
    gut:       { name: '卡顺听牌',   tier: 'basic'  },
    over:      { name: '双高张',     tier: 'basic'  },
    set:       { name: '口袋对买三条', tier: 'basic' },
    flushgut:  { name: '同花 + 卡顺', tier: 'combo' },
    flushoesd: { name: '同花 + 两头顺', tier: 'combo' },
  };

  /* =============== 场景生成器（flop / turn） ===============
     返回 { kind, hero:[2], board:[3|4], street, outs, suit?, needRanks?, explain }
  ============================================================ */

  function maybeTurn(ctx, street, forbidRanks, forbidSuits, scen) {
    if (street === 'turn') scen.board.push(takeAvoid(ctx, forbidRanks, forbidSuits));
    scen.street = street;
    return scen;
  }

  /* 同花听牌：hero 两张同花色，board 恰好 2 张同花色 → 9 */
  function genFlush(ctx, street) {
    const s = randInt(0, 3);
    const rs = shuffle(RANKS);
    const hero = [take(ctx, rs[0], s), take(ctx, rs[1], s)];
    const board = [take(ctx, rs[2], s), take(ctx, rs[3], s), take(ctx, rs[4], (s + randInt(1, 3)) % 4)];
    const scen = {
      kind: 'flush', hero, board, street: 'flop', outs: 9, suit: s,
      explain: '同花听牌：13 张同花色 − 已见 4 张 = 9 outs',
    };
    /* turn 加牌：不能是同花色（否则同花已成） */
    return maybeTurn(ctx, street, new Set(), new Set([s]), scen);
  }

  /* 两头顺听：区间 [x..x+3]，hero 拿 x,x+1（异色），board 拿 x+2,x+3 + 无关牌 → 8 */
  function genOesd(ctx, street) {
    const x = randInt(3, 10); /* x-1 与 x+4 都在 2..14 */
    let sA = randInt(0, 3), sB = randInt(0, 3);
    if (sA === sB) sB = (sB + 1) % 4; /* hero 异色 → 无同花听 */
    const hero = [take(ctx, x, sA), take(ctx, x + 1, sB)];
    const board = [take(ctx, x + 2, randInt(0, 3)), take(ctx, x + 3, randInt(0, 3))];
    const freeR = RANKS.filter(r => r < x - 1 || r > x + 4);
    board.push(take(ctx, pick(freeR), randInt(0, 3)));
    const scen = {
      kind: 'oesd', hero, board, street: 'flop', outs: 8, needRanks: [x - 1, x + 4],
      explain: `两头顺听：${rankLabel(x - 1)} 或 ${rankLabel(x + 4)} 各 4 张 = 8 outs`,
    };
    return maybeTurn(ctx, street, new Set([x - 1, x, x + 1, x + 2, x + 3, x + 4]), new Set(), scen);
  }

  /* 卡顺：{x, x+1, x+3, x+4} 缺 x+2 → 4 */
  function genGut(ctx, street) {
    const x = randInt(2, 10); /* x+4 ≤ 14 */
    const ranks4 = shuffle([x, x + 1, x + 3, x + 4]);
    let sA = randInt(0, 3), sB = randInt(0, 3);
    if (sA === sB) sB = (sB + 1) % 4;
    const hero = [take(ctx, ranks4[0], sA), take(ctx, ranks4[1], sB)];
    const board = [take(ctx, ranks4[2], randInt(0, 3)), take(ctx, ranks4[3], randInt(0, 3))];
    const freeR = RANKS.filter(r => r < x || r > x + 4);
    board.push(take(ctx, pick(freeR), randInt(0, 3)));
    const scen = {
      kind: 'gut', hero, board, street: 'flop', outs: 4, needRanks: [x + 2],
      explain: `卡顺听牌：只有 ${rankLabel(x + 2)} 能成顺 = 4 outs`,
    };
    return maybeTurn(ctx, street, new Set([x, x + 1, x + 2, x + 3, x + 4]), new Set(), scen);
  }

  /* 双高张：hero 两张 J+ 高牌（异色），board 全小且远离 hero rank → 6 */
  function genOver(ctx, street) {
    const highs = shuffle([11, 12, 13, 14]);
    let sA = randInt(0, 3), sB = randInt(0, 3);
    if (sA === sB) sB = (sB + 1) % 4;
    const hero = [take(ctx, highs[0], sA), take(ctx, highs[1], sB)];
    const lo = Math.min(highs[0], highs[1]);
    const lows = shuffle(RANKS.filter(r => r <= lo - 3));
    const board = [take(ctx, lows[0], randInt(0, 3)), take(ctx, lows[1], randInt(0, 3)), take(ctx, lows[2], randInt(0, 3))];
    const scen = {
      kind: 'over', hero, board, street: 'flop', outs: 6,
      explain: `双高张：${rankLabel(highs[0])}、${rankLabel(highs[1])} 各剩 3 张 = 6 outs`,
    };
    return maybeTurn(ctx, street, new Set([highs[0], highs[1]]), new Set(), scen);
  }

  /* 口袋对买三条 → 2 */
  function genSet(ctx, street) {
    const p = pick(RANKS);
    let sA = randInt(0, 3), sB = randInt(0, 3);
    if (sA === sB) sB = (sB + 1) % 4;
    const hero = [take(ctx, p, sA), take(ctx, p, sB)];
    const freeR = RANKS.filter(r => r !== p);
    const rs = shuffle(freeR);
    const board = [take(ctx, rs[0], randInt(0, 3)), take(ctx, rs[1], randInt(0, 3)), take(ctx, rs[2], randInt(0, 3))];
    const scen = {
      kind: 'set', hero, board, street: 'flop', outs: 2,
      explain: `口袋对：剩余 2 张 ${rankLabel(p)} = 2 outs`,
    };
    return maybeTurn(ctx, street, new Set([p]), new Set(), scen);
  }

  /* 同花+卡顺：hero 同花色 {x, x+1}，board {x+3(同花), x+4(异色), 无关}，缺 x+2 → 9+4−1 = 12 */
  function genFlushGut(ctx, street) {
    const x = randInt(2, 10);
    const s = randInt(0, 3);
    const ns = (s + randInt(1, 3)) % 4;
    const hero = [take(ctx, x, s), take(ctx, x + 1, s)];
    const board = [take(ctx, x + 3, s), take(ctx, x + 4, ns)];
    /* 第三张 board 也用同花色（rank 避开顺子区间）→ 已见 4 张同花，同花 outs = 9 */
    const freeR = RANKS.filter(r => r < x - 1 || r > x + 4);
    board.push(take(ctx, pick(freeR), s));
    const scen = {
      kind: 'flushgut', hero, board, street: 'flop', outs: 12, suit: s, needRanks: [x + 2],
      explain: `同花 9 + 卡顺 4 − 重叠（${rankLabel(x + 2)}${SUITS[s]} 已计入同花）= 12 outs`,
    };
    return maybeTurn(ctx, street, new Set([x - 1, x, x + 1, x + 2, x + 3, x + 4]), new Set([s]), scen);
  }

  /* 同花+两头顺：hero 同花色 {x, x+1}，board {x+2(同花), x+3(异色), 无关} → 9+8−2 = 15 */
  function genFlushOesd(ctx, street) {
    const x = randInt(3, 10);
    const s = randInt(0, 3);
    const ns = (s + randInt(1, 3)) % 4;
    const hero = [take(ctx, x, s), take(ctx, x + 1, s)];
    const board = [take(ctx, x + 2, s), take(ctx, x + 3, ns)];
    /* 第三张 board 也用同花色（rank 避开顺子区间）→ 已见 4 张同花，同花 outs = 9 */
    const freeR = RANKS.filter(r => r < x - 1 || r > x + 4);
    board.push(take(ctx, pick(freeR), s));
    const scen = {
      kind: 'flushoesd', hero, board, street: 'flop', outs: 15, suit: s, needRanks: [x - 1, x + 4],
      explain: `同花 9 + 顺 8 − 重叠 2 张（${rankLabel(x - 1)}${SUITS[s]}、${rankLabel(x + 4)}${SUITS[s]}）= 15 outs`,
    };
    return maybeTurn(ctx, street, new Set([x - 1, x, x + 1, x + 2, x + 3, x + 4]), new Set([s]), scen);
  }

  const RAW_GENS = {
    flush: genFlush, oesd: genOesd, gut: genGut, over: genOver, set: genSet,
    flushgut: genFlushGut, flushoesd: genFlushOesd,
  };

  /* =============== 场景纯洁性校验（反向穷举） ===============
     问题背景：生成器只控制目标牌型的构造参数，随机点数/花色可能
     "顺带"形成另一种听牌（例：同花听牌面 9♠A♠Q♦ + 转牌 8♣，
     手持 J♠3♠ 时 8-9-J-Q 缺 T 又成卡顺，真实 outs = 9+3 = 12）。
     校验器把剩余每张牌逐一代入，检查是否成同花/成顺，数出真实
     听牌 outs；与声明值不符的场景一律重掷。 */

  function makesFlush(cards) {
    const cnt = [0, 0, 0, 0];
    for (const c of cards) cnt[c.s]++;
    return cnt.some(n => n >= 5);
  }
  function makesStraight(cards) {
    const set = new Set(cards.map(c => c.r));
    if (set.has(14)) set.add(1); /* A 可作 1（A-2-3-4-5 轮顺） */
    for (let lo = 1; lo <= 10; lo++) {
      let ok = true;
      for (let k = 0; k < 5; k++) if (!set.has(lo + k)) { ok = false; break; }
      if (ok) return true;
    }
    return false;
  }
  /* 返回 -1 表示 hero+board 已成牌（场景无效），否则为真实听牌 outs */
  function enumerateDrawOuts(hero, board) {
    const seen = hero.concat(board);
    if (makesFlush(seen) || makesStraight(seen)) return -1;
    const used = new Set(seen.map(c => c.r * 4 + c.s));
    let n = 0;
    for (let r = 2; r <= 14; r++) {
      for (let s = 0; s < 4; s++) {
        if (used.has(r * 4 + s)) continue;
        const cards = seen.concat([{ r, s }]);
        if (makesFlush(cards) || makesStraight(cards)) n++;
      }
    }
    return n;
  }
  /* over / set 的 outs 来自击中点数而非成牌听型，要求听型 outs 为 0 */
  function scenarioClean(scen) {
    const d = enumerateDrawOuts(scen.hero, scen.board);
    if (d < 0) return false;
    if (scen.kind === 'over' || scen.kind === 'set') return d === 0;
    return d === scen.outs;
  }
  /* 包装：生成 → 反向校验 → 不纯重掷 */
  function wrapClean(gen, kind) {
    return function (_ctx, street) {
      for (let i = 0; i < 300; i++) {
        let scen;
        try { scen = gen(makeCtx(), street); } catch (e) { continue; }
        if (scenarioClean(scen)) return scen;
      }
      throw new Error('clean scenario exhausted: ' + kind);
    };
  }
  const SCENARIO_GENS = {};
  for (const k of Object.keys(RAW_GENS)) SCENARIO_GENS[k] = wrapClean(RAW_GENS[k], k);

  /* =============== 独立重算 outs（验证用） =============== */
  function recount(scen) {
    const all = scen.hero.concat(scen.board);
    const cntRank = r => all.filter(c => c.r === r).length;
    const cntSuit = s => all.filter(c => c.s === s).length;
    switch (scen.kind) {
      case 'flush': return 13 - cntSuit(scen.suit);
      case 'set':   return 4 - cntRank(scen.hero[0].r);
      case 'over':  return scen.hero.reduce((a, c) => a + (4 - cntRank(c.r)), 0);
      case 'oesd':
      case 'gut':
        return scen.needRanks.reduce((a, r) => a + (4 - cntRank(r)), 0);
      case 'flushgut':
      case 'flushoesd': {
        const flushOuts = 13 - cntSuit(scen.suit);
        const straightOuts = scen.needRanks.reduce((a, r) => a + (4 - cntRank(r)), 0);
        const overlap = scen.needRanks.filter(r => !all.some(c => c.r === r && c.s === scen.suit)).length;
        return flushOuts + straightOuts - overlap;
      }
      default: throw new Error('unknown kind ' + scen.kind);
    }
  }

  /* =============== 模块 1：Outs 速算 =============== */
  function genOutsQuestion(tier) {
    const kinds = Object.keys(SCENARIO_GENS).filter(k =>
      tier === 'all' ? true : KIND_INFO[k].tier === tier);
    const kind = pick(kinds);
    const street = pick(['flop', 'turn']);
    const scen = SCENARIO_GENS[kind](makeCtx(), street);
    return {
      module: 'outs', scen,
      question: `${KIND_INFO[kind].name} · ${street === 'flop' ? '翻牌' : '转牌'}圈 — 多少 outs？`,
      answer: scen.outs, tolerance: 0, unit: 'outs',
      explain: scen.explain,
    };
  }

  /* =============== 模块 2：二四法则（outs → 胜率） =============== */
  function exactEquity(outs, street) {
    if (street === 'flop') {
      const o = outs;
      return (1 - ((47 - o) / 47) * ((46 - o) / 46)) * 100;
    }
    return (outs / 46) * 100;
  }

  function genEquityQuestion() {
    const weighted = [2, 3, 4, 4, 5, 6, 6, 7, 8, 8, 9, 9, 10, 11, 12, 13, 14, 15];
    const outs = pick(weighted);
    const street = pick(['flop', 'turn']);
    const est = outs * (street === 'flop' ? 4 : 2);
    const exact = exactEquity(outs, street);
    return {
      module: 'equity', outs, street,
      question: `${outs} outs · ${street === 'flop' ? '翻牌圈（还有 2 张牌）' : '转牌圈（还有 1 张牌）'} — 胜率约多少 %？`,
      answer: est, tolerance: 0, unit: '%',
      explain: `${outs} × ${street === 'flop' ? 4 : 2} = ${est}%（精确值 ${exact.toFixed(1)}%，法则用 50 张近似分母）`,
    };
  }

  /* =============== 模块 3：底池赔率 =============== */
  const POT_ANCHORS = [
    { r: 0.25, label: '1/4 底池' }, { r: 1 / 3, label: '1/3 底池' },
    { r: 0.5, label: '1/2 底池' }, { r: 2 / 3, label: '2/3 底池' },
    { r: 0.75, label: '3/4 底池' }, { r: 1, label: '1 倍底池' },
    { r: 1.5, label: '1.5 倍底池' }, { r: 2, label: '2 倍底池' },
  ];
  function requiredEquity(P, B) { return (B / (P + 2 * B)) * 100; }

  function genPotOddsQuestion() {
    const a = pick(POT_ANCHORS);
    const P = randInt(4, 40) * 25;
    const B = Math.max(5, Math.round((P * a.r) / 5) * 5);
    const req = requiredEquity(P, B);
    return {
      module: 'potodds', P, B,
      question: `底池 ${P}，对手下注 ${B}（约${a.label}）— 跟注所需胜率？`,
      answer: req, tolerance: 0.6, unit: '%',
      explain: `所需胜率 = 跟注 ÷（底池 + 2×下注）= ${B} ÷ ${P + 2 * B} = ${req.toFixed(1)}%（锚点：${a.label} → ${requiredEquity(100, Math.round(100 * a.r)).toFixed(1)}%）`,
    };
  }

  /* =============== 模块 4：综合决策（CALL / FOLD） =============== */
  function genDecisionQuestion() {
    for (let attempt = 0; attempt < 60; attempt++) {
      const kinds = Object.keys(SCENARIO_GENS);
      const kind = pick(kinds);
      const street = pick(['flop', 'turn']);
      const scen = SCENARIO_GENS[kind](makeCtx(), street);
      const est = scen.outs * (street === 'flop' ? 4 : 2);
      const a = pick(POT_ANCHORS);
      const P = randInt(4, 40) * 25;
      const B = Math.max(5, Math.round((P * a.r) / 5) * 5);
      const req = requiredEquity(P, B);
      if (Math.abs(est - req) < 4) continue; /* 边缘题不出，保证判断清晰 */
      const call = est > req;
      return {
        module: 'decision', scen, P, B, street, est, req,
        question: `底池 ${P}，对手下注 ${B} · ${street === 'flop' ? '翻牌' : '转牌'}圈 — 纯赔率角度，跟注还是弃牌？`,
        answer: call ? 'CALL' : 'FOLD', tolerance: 0, unit: '',
        explain: `${KIND_INFO[kind].name} = ${scen.outs} outs → 胜率 ≈ ${scen.outs}×${street === 'flop' ? 4 : 2} = ${est}%；所需胜率 = ${B}÷${P + 2 * B} = ${req.toFixed(1)}%。${est} ${call ? '>' : '<'} ${req.toFixed(1)} → ${call ? 'CALL（赔率合适）' : 'FOLD（赔率不够）'}`,
      };
    }
    return genDecisionQuestion();
  }

  /* =============== 模块 5：数字敏感度 =============== */
  const ODDS_TABLE = [
    { odds: '5 : 1', pct: 16.7 }, { odds: '4 : 1', pct: 20 }, { odds: '3 : 1', pct: 25 },
    { odds: '2 : 1', pct: 33.3 }, { odds: '3 : 2', pct: 40 }, { odds: '1 : 1', pct: 50 },
  ];
  const FRAC_TABLE = [
    { f: '1/2', pct: 50 }, { f: '1/3', pct: 33.3 }, { f: '2/3', pct: 66.7 },
    { f: '1/4', pct: 25 }, { f: '3/4', pct: 75 }, { f: '1/5', pct: 20 },
    { f: '2/5', pct: 40 }, { f: '3/5', pct: 60 }, { f: '4/5', pct: 80 },
    { f: '1/6', pct: 16.7 }, { f: '5/6', pct: 83.3 }, { f: '3/8', pct: 37.5 },
    { f: '5/8', pct: 62.5 }, { f: '7/8', pct: 87.5 }, { f: '1/8', pct: 12.5 },
  ];
  function genNumberSenseQuestion() {
    const t = pick(['odds', 'frac', 'mult']);
    if (t === 'odds') {
      const o = pick(ODDS_TABLE);
      return {
        module: 'numbers',
        question: `底池赔率 ${o.odds}（赢 ${o.odds.split(':')[0].trim()} 份，投入 ${o.odds.split(':')[1].trim()} 份）— 保本所需胜率？`,
        answer: o.pct, tolerance: 0.6, unit: '%',
        explain: `赔率 a:b → 所需胜率 = b ÷ (a+b) = ${o.pct}%`,
      };
    }
    if (t === 'frac') {
      const f = pick(FRAC_TABLE);
      return {
        module: 'numbers',
        question: `分数速转：${f.f} = 多少 %？`,
        answer: f.pct, tolerance: 0.6, unit: '%',
        explain: `${f.f} = ${f.pct}%（1/3≈33.3、1/4=25、1/5=20、1/6≈16.7、1/8=12.5 这五个锚点背熟，其余靠组合）`,
      };
    }
    const n = randInt(2, 21);
    const m = pick([2, 4]);
    return {
      module: 'numbers',
      question: `快算：${n} × ${m} = ？`,
      answer: n * m, tolerance: 0, unit: '',
      explain: `${n} × ${m} = ${n * m}（×4 = 翻倍再翻倍：${n}→${n * 2}→${n * 4}）`,
    };
  }

  /* =============== 模块 6：有效 Outs（脏牌修正） =============== */
  function genDirtyOutsQuestion() {
    /* 同样过反向校验：生成的底场景必须纯洁（outs 与穷举一致） */
    for (let attempt = 0; attempt < 300; attempt++) {
      const q = genDirtyOutsRaw();
      if (scenarioClean(q.scen)) return q;
    }
    throw new Error('dirty scenario exhausted');
  }
  function genDirtyOutsRaw() {
    const t = pick(['oesdFlush', 'gutFlush', 'overHold', 'setHold']);
    const ctx = makeCtx();
    if (t === 'oesdFlush' || t === 'gutFlush') {
      const s = randInt(0, 3);
      const nonS = [0, 1, 2, 3].filter(x => x !== s);
      let sA = pick(nonS), sB = pick(nonS);
      if (sA === sB) sB = nonS[(nonS.indexOf(sA) + 1) % nonS.length];
      let hero, board, needRanks, total, baseName;
      if (t === 'oesdFlush') {
        const x = randInt(3, 10);
        hero = [take(ctx, x, sA), take(ctx, x + 1, sB)];
        board = [take(ctx, x + 2, s), take(ctx, x + 3, s)];
        const freeR = RANKS.filter(r => r < x - 1 || r > x + 4);
        board.push(take(ctx, pick(freeR), pick(nonS)));
        needRanks = [x - 1, x + 4]; total = 8; baseName = '两头顺听';
      } else {
        const x = randInt(2, 10);
        const ranks4 = shuffle([x, x + 1, x + 3, x + 4]);
        hero = [take(ctx, ranks4[0], sA), take(ctx, ranks4[1], sB)];
        board = [take(ctx, ranks4[2], s), take(ctx, ranks4[3], s)];
        const freeR = RANKS.filter(r => r < x || r > x + 4);
        board.push(take(ctx, pick(freeR), pick(nonS)));
        needRanks = [x + 2]; total = 4; baseName = '卡顺听牌';
      }
      const dirty = needRanks.length; /* 每个需要 rank 的同花色那张都被污染 */
      const clean = total - dirty;
      const scen = { kind: t === 'oesdFlush' ? 'oesd' : 'gut', hero, board, street: 'flop', outs: total, needRanks, threat: { type: 'flush', suit: s } };
      return {
        module: 'dirty', scen,
        question: `${baseName} · 但牌面有两张 ${SUITS[s]}，对手很可能在追同花——你的干净 outs 还剩多少？`,
        answer: clean, tolerance: 0, unit: 'outs',
        explain: `${total} 张顺子 outs 里，${needRanks.map(r => rankLabel(r) + SUITS[s]).join('、')} 会让对手成同花 → ${total} − ${dirty} = ${clean}（脏牌要打对折甚至不算）`,
      };
    }
    if (t === 'overHold') {
      const scen = genOver(ctx, 'flop');
      const blocked = pick([true, false]);
      if (blocked) {
        const hr = pick(scen.hero).r;
        scen.threat = { type: 'hold' };
        return {
          module: 'dirty', scen,
          question: `双高张 · 对手范围锁定含一张 ${rankLabel(hr)}——你的有效 outs？`,
          answer: 5, tolerance: 0, unit: 'outs',
          explain: `两张高牌各 3 outs = 6，但 ${rankLabel(hr)} 被对手占了一张 → 2 + 3 = 5`,
        };
      }
      scen.threat = { type: 'none' };
      return {
        module: 'dirty', scen,
        question: `双高张 · 对手是中小对子风格，不占你的高牌——outs 用打折吗？是多少？`,
        answer: 6, tolerance: 0, unit: 'outs',
        explain: `不撞高牌就不打折：3 + 3 = 6（修正的前提是对手范围真的占用你的 outs）`,
      };
    }
    /* setHold */
    const scen = genSet(ctx, 'flop');
    const blocked = pick([true, false]);
    const p = scen.hero[0].r;
    if (blocked) {
      scen.threat = { type: 'hold' };
      return {
        module: 'dirty', scen,
        question: `口袋对买三条 · 对手范围锁定含一张 ${rankLabel(p)}——你的有效 outs？`,
        answer: 1, tolerance: 0, unit: 'outs',
        explain: `本来剩 2 张 ${rankLabel(p)}，对手占了一张 → 只剩 1（买三条变买"绝张"）`,
      };
    }
    scen.threat = { type: 'none' };
    return {
      module: 'dirty', scen,
      question: `口袋对买三条 · 对手不占你的对子牌——outs 是多少？`,
      answer: 2, tolerance: 0, unit: 'outs',
      explain: `不打折：剩余 2 张 ${rankLabel(p)} = 2 outs`,
    };
  }

  /* =============== 模块 7：对决胜率锚点 =============== */
  const MATCHUPS = [
    { a: 'AA', b: 'KK', lead: 81, spot: 'preflop', note: '高对 vs 低对' },
    { a: 'QQ', b: 'AKo', lead: 57, spot: 'preflop', note: '对子 vs 两高张（经典抛硬币）' },
    { a: 'QQ', b: 'AKs', lead: 54, spot: 'preflop', note: '对子 vs 同花两高' },
    { a: 'QQ', b: 'K7o', lead: 71, spot: 'preflop', note: '对子 vs 一高一废' },
    { a: 'AKo', b: '72o', lead: 65, spot: 'preflop', note: '两高 vs 两低' },
    { a: 'AKo', b: 'AQo', lead: 74, spot: 'preflop', note: '主导 vs 被主导' },
    { a: 'AA', b: '7♠6♠', lead: 78, spot: 'preflop', note: '高对 vs 同花连张' },
    { a: '同花听', b: '顶对', lead: 36, spot: 'flop', note: 'flop 9 outs ≈ 36%' },
    { a: '两头顺听', b: '顶对', lead: 32, spot: 'flop', note: 'flop 8 outs ≈ 32%' },
    { a: '15 outs 组合听', b: '顶对', lead: 54, spot: 'flop', note: '组合听 flop 反而领先' },
  ];
  function genMatchupQuestion() {
    const m = pick(MATCHUPS);
    const askLead = pick([true, false]);
    const pct = askLead ? m.lead : 100 - m.lead;
    const who = askLead ? m.a : m.b;
    return {
      module: 'matchups',
      question: `${m.spot === 'preflop' ? '翻前全下' : '翻牌圈'}：${m.a} vs ${m.b} —— ${who} 的胜率约多少 %？`,
      answer: pct, tolerance: 2, unit: '%',
      explain: `${m.note}：${m.a} ≈ ${m.lead}% / ${m.b} ≈ ${100 - m.lead}%（这类对阵没有公式，靠的是锚点记忆）`,
    };
  }

  /* =============== 模块 8：组合计数与 Blocker =============== */
  function comb2(n) { return n < 2 ? 0 : (n * (n - 1)) / 2; }
  const RANGE_SETS = [
    { label: '{AA, AK}', total: 22, pairPart: 6 },
    { label: '{AA, KK}', total: 12, pairPart: 12 },
    { label: '{AA, KK, AK}', total: 38, pairPart: 12 },
    { label: '{AA, KK, QQ}', total: 18, pairPart: 18 },
    { label: '{AA, AK, AQ}', total: 38, pairPart: 6 },
    { label: '{QQ+, AK}', total: 34, pairPart: 18 },
    { label: '{AA, AKs}', total: 10, pairPart: 6 },
  ];
  function genCombosQuestion() {
    const t = pick(['pairFree', 'nonpairFree', 'suitedFree', 'pairBlock', 'nonpairBlock', 'rangeCount', 'rangePct']);
    const highs = shuffle([14, 13, 12, 11]);
    if (t === 'pairFree') {
      const r = highs[0];
      return { module: 'combos', question: `不限花色：${rankLabel(r)}${rankLabel(r)} 一共有几种组合？`, answer: 6, tolerance: 0, unit: '种', explain: `对子组合 = C(4,2) = 4×3÷2 = 6` };
    }
    if (t === 'nonpairFree') {
      return { module: 'combos', question: `不限花色：${rankLabel(highs[0])}${rankLabel(highs[1])} 一共有几种组合？`, answer: 16, tolerance: 0, unit: '种', explain: `非对子组合 = 4 × 4 = 16` };
    }
    if (t === 'suitedFree') {
      return { module: 'combos', question: `${rankLabel(highs[0])}${rankLabel(highs[1])}s（同花）有几种组合？`, answer: 4, tolerance: 0, unit: '种', explain: `同花组合 = 4 种花色各一 = 4` };
    }
    const ctx = makeCtx();
    if (t === 'pairBlock') {
      const r = highs[0];
      const nSeen = pick([1, 2]);
      let hero;
      if (nSeen === 1) {
        const s1 = randInt(0, 3), r2 = highs[1];
        hero = [take(ctx, r, s1), take(ctx, r2, randInt(0, 3))];
      } else {
        let s1 = randInt(0, 3), s2 = randInt(0, 3);
        if (s1 === s2) s2 = (s2 + 1) % 4;
        hero = [take(ctx, r, s1), take(ctx, r, s2)];
      }
      const ans = comb2(4 - nSeen);
      return {
        module: 'combos', scen: { hero, board: [] }, check: { type: 'pairBlock', seen: nSeen },
        question: `你手持 ${cardLabel(hero[0])} ${cardLabel(hero[1])} —— 对手的 ${rankLabel(r)}${rankLabel(r)} 还剩几种组合？`,
        answer: ans, tolerance: 0, unit: '种',
        explain: `你占了 ${nSeen} 张 ${rankLabel(r)}，剩 ${4 - nSeen} 张 → C(${4 - nSeen},2) = ${ans}（blocker：你的牌压缩对手范围）`,
      };
    }
    if (t === 'nonpairBlock') {
      const A = highs[0], B = highs[1];
      const seenA = pick([0, 1]), seenB = seenA ? pick([0, 1]) : 1;
      const hero = [];
      if (seenA) hero.push(take(ctx, A, randInt(0, 3)));
      if (seenB) hero.push(take(ctx, B, randInt(0, 3)));
      if (hero.length === 1) hero.push(take(ctx, highs[2], randInt(0, 3)));
      const ans = (4 - seenA) * (4 - seenB);
      return {
        module: 'combos', scen: { hero, board: [] }, check: { type: 'nonpairBlock', seenA, seenB },
        question: `你手持 ${cardLabel(hero[0])} ${cardLabel(hero[1])} —— 对手的 ${rankLabel(A)}${rankLabel(B)}（不限花色）还剩几种组合？`,
        answer: ans, tolerance: 0, unit: '种',
        explain: `剩 ${4 - seenA} 张 ${rankLabel(A)} × ${4 - seenB} 张 ${rankLabel(B)} = ${ans}`,
      };
    }
    const rs = pick(RANGE_SETS);
    if (t === 'rangeCount') {
      return {
        module: 'combos', check: { type: 'range', rs },
        question: `对手范围 ${rs.label}（无任何 blocker）—— 一共多少种组合？`,
        answer: rs.total, tolerance: 0, unit: '种',
        explain: `对子每个 6 种、非对子 16 种、同花 4 种，逐项相加 = ${rs.total}`,
      };
    }
    const pct = (rs.pairPart / rs.total) * 100;
    return {
      module: 'combos', check: { type: 'rangePct', rs },
      question: `对手范围 ${rs.label} —— 其中对子组合占整个范围的多少 %？`,
      answer: pct, tolerance: 0.6, unit: '%',
      explain: `对子 ${rs.pairPart} 种 ÷ 总 ${rs.total} 种 = ${pct.toFixed(1)}%（读牌：这个范围有多"怕"翻牌）`,
    };
  }

  /* =============== 模块 9：EV 与隐含赔率 =============== */
  const IMPLIED_PRESETS = [[10, 20], [10, 50], [15, 30], [15, 60], [20, 50], [20, 100], [25, 50], [25, 100]];
  function genEvQuestion() {
    const t = pick(['ev', 'implied']);
    if (t === 'ev') {
      const eqPct = pick([20, 25, 30, 33, 36, 40, 50]);
      const P = pick([100, 200, 300, 400, 500]);
      const B = pick([50, 100, 150, 200]);
      const ev = (eqPct / 100) * (P + B) - (1 - eqPct / 100) * B;
      return {
        module: 'ev', P, B, eqPct, kind: 'ev',
        question: `底池 ${P}，对手全下 ${B}，你的胜率 ${eqPct}% —— 跟注的 EV 是多少？`,
        answer: Math.round(ev), tolerance: 1, unit: '',
        explain: `EV = 胜率×赢额 − 败率×跟注 = ${eqPct}%×${P + B} − ${100 - eqPct}%×${B} = ${ev >= 0 ? '+' : ''}${ev.toFixed(0)}`,
      };
    }
    for (let i = 0; i < 40; i++) {
      const [eqPct, B] = pick(IMPLIED_PRESETS);
      const need = B / (eqPct / 100);
      const X = pick([50, 100, 150, 200]);
      const P = need - B - X;
      if (P < 50) continue;
      return {
        module: 'ev', P, B, eqPct, kind: 'implied',
        question: `底池 ${P}，对手下注 ${B}，你听牌胜率约 ${eqPct}% —— 直接赔率不够。保本需要在后面几条街从对手那里再赢多少？`,
        answer: X, tolerance: 0, unit: '',
        explain: `保本需总赢 跟注÷胜率 = ${B}÷${eqPct}% = ${need}；当前可赢（底池+对手注）= ${P + B}；隐含缺口 = ${need} − ${P + B} = ${X}`,
      };
    }
    return genEvQuestion();
  }

  /* =============== 模块 10：防线数学（MDF 与诈唬） =============== */
  const DEF_ANCHORS = [1 / 3, 0.5, 0.75, 1, 1.5, 2];
  function genDefenseQuestion() {
    const t = pick(['mdf', 'bluff', 'polar']);
    const r = pick(DEF_ANCHORS);
    const P = randInt(2, 20) * 50;
    const B = Math.max(25, Math.round(P * r / 25) * 25);
    if (t === 'mdf') {
      const ans = (P / (P + B)) * 100;
      return {
        module: 'defense', P, B, kind: 'mdf',
        question: `底池 ${P}，对手下注 ${B} —— 你的最低防守频率（MDF）是多少 %？`,
        answer: ans, tolerance: 0.6, unit: '%',
        explain: `MDF = 底池 ÷（底池+下注）= ${P}÷${P + B} = ${ans.toFixed(1)}%（防线：低于此频率，对手任何两张牌诈唬都赚）`,
      };
    }
    if (t === 'bluff') {
      const ans = (B / (P + B)) * 100;
      return {
        module: 'defense', P, B, kind: 'bluff',
        question: `你下注 ${B} 入 ${P} 底池（纯诈唬）—— 需要对手弃牌率至少多少 % 才保本？`,
        answer: ans, tolerance: 0.6, unit: '%',
        explain: `诈唬保本点 = 下注 ÷（底池+下注）= ${B}÷${P + B} = ${ans.toFixed(1)}%（与 MDF 互补，两者相加 = 100%）`,
      };
    }
    const ans = (B / (P + 2 * B)) * 100;
    return {
      module: 'defense', P, B, kind: 'polar',
      question: `河牌你下注 ${B} 入 ${P} 底池（极化范围：不是坚果就是空气）—— 诈唬应占你下注范围的多少 %？`,
      answer: ans, tolerance: 0.6, unit: '%',
      explain: `极化诈唬比 = 下注 ÷（底池+2×下注）= ${B}÷${P + 2 * B} = ${ans.toFixed(1)}%（让对手抓诈正好无差异）`,
    };
  }

  /* =============== 模块 11：范围胜率（equity vs range） =============== */
  const RANGE_EQ = {
    toppair:  { label: '顶对好踢脚', vs: [['更强成牌', 10], ['更弱成牌', 78], ['听牌', 64], ['空气', 95]] },
    overpair: { label: '超对',       vs: [['暗三/两对', 9], ['顶对', 82], ['听牌', 64], ['空气', 96]] },
  };
  function genRangeEquityQuestion() {
    const H = RANGE_EQ[pick(Object.keys(RANGE_EQ))];
    const nParts = pick([2, 3]);
    const parts = shuffle(H.vs).slice(0, nParts);
    /* 比例：5 的倍数，和为 100 */
    let rem = 100;
    const pcts = [];
    for (let i = 0; i < nParts - 1; i++) {
      const v = randInt(1, rem / 5 - (nParts - 1 - i)) * 5;
      pcts.push(v); rem -= v;
    }
    pcts.push(rem);
    const sp = shuffle(pcts);
    let total = 0;
    const desc = parts.map((p, i) => { total += sp[i] * p[1]; return `${sp[i]}% ${p[0]}`; });
    const ans = total / 100;
    return {
      module: 'rangeeq', parts, pcts: sp,
      question: `翻牌圈你拿${H.label}。对手范围估计：${desc.join('、')} —— 你的范围胜率约多少 %？`,
      answer: ans, tolerance: 1, unit: '%',
      explain: parts.map((p, i) => `${sp[i]}%×${p[1]}%`).join(' + ') + ` = ${ans.toFixed(1)}%（胜率 × 占比，逐项加权）`,
    };
  }

  /* =============== 模块 12：半诈唬 EV（双引擎） =============== */
  function genSemiBluffQuestion() {
    const P = pick([100, 150, 200]);
    const B = pick([50, 100, 150, 200]);
    const fold = pick([30, 40, 50, 60, 70]);
    const eq = pick([20, 25, 32, 36]);
    const ev = (fold / 100) * P + (1 - fold / 100) * ((eq / 100) * (P + B) - (1 - eq / 100) * B);
    return {
      module: 'semibluff', P, B, fold, eq,
      question: `底池 ${P}，你持听牌半诈唬全下 ${B}（被跟注时胜率 ${eq}%）。对手约 ${fold}% 弃牌 —— 这次全下的 EV？`,
      answer: Math.round(ev), tolerance: 2, unit: '',
      explain: `EV = 弃牌收益 + 被跟注收益 = ${fold}%×${P} + ${100 - fold}%×(${eq}%×${P + B} − ${100 - eq}%×${B}) = ${ev >= 0 ? '+' : ''}${ev.toFixed(0)}（双引擎：fold equity + pot equity，单一引擎不够时靠另一个补）`,
    };
  }

  /* =============== 模块 13：SPR 与承诺线 =============== */
  function genSprQuestion() {
    const t = pick(['calc', 'calc', 'anchorLow', 'anchorHigh']);
    if (t === 'calc') {
      const P = pick([50, 100, 150, 200, 300]);
      const spr = pick([1.5, 2, 2.5, 3, 4, 5, 6, 8, 9, 11, 13, 15, 20]);
      const stack = Math.round(P * spr);
      return {
        module: 'spr', P, stack, spr,
        question: `有效筹码 ${stack}，底池 ${P} —— SPR 是多少？（一位小数）`,
        answer: spr, tolerance: 0.15, unit: '',
        explain: `SPR = 有效筹码 ÷ 底池 = ${stack}÷${P} = ${spr}（≤3：顶对即可打光；4~6：谨慎；≥13：只有坚果级牌力值得打光）`,
      };
    }
    if (t === 'anchorLow') {
      return {
        module: 'spr',
        question: `锚点题：SPR 低于多少时，顶对及以上牌力可以直接打光？`,
        answer: 3, tolerance: 0.5, unit: '',
        explain: `SPR ≤ 3 是顶对的承诺线：底池相对筹码足够大，打光不吃亏`,
      };
    }
    return {
      module: 'spr',
      question: `锚点题：SPR 高于多少时，只有坚果级牌力才值得打光？`,
      answer: 13, tolerance: 1, unit: '',
      explain: `SPR ≥ 13 是深筹码区：顶对打光等于用小学牌力赌全部身家，隐含赔率/反向隐含赔率主宰一切`,
    };
  }

  const api = {
    RANKS, SUITS, KIND_INFO, POT_ANCHORS,
    rankLabel, cardLabel, isRedSuit,
    makeCtx, setRng,
    SCENARIO_GENS, recount,
    enumerateDrawOuts, scenarioClean,
    genOutsQuestion, genEquityQuestion, genPotOddsQuestion,
    genDecisionQuestion, genNumberSenseQuestion,
    genDirtyOutsQuestion, genMatchupQuestion, genCombosQuestion,
    genEvQuestion, genDefenseQuestion,
    genRangeEquityQuestion, genSemiBluffQuestion, genSprQuestion,
    exactEquity, requiredEquity,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.PokerEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
