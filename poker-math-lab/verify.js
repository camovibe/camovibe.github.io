/* Node 自检：全部 10 个模块
   - 听牌场景：outs 声明值与独立重算一致、无重复牌
   - 进阶/高阶模块：用独立公式重算答案 */
const E = require('./engine.js');

let fails = 0;
const N = 20000;

function bad(...args) { console.error(...args); fails++; }

/* ---- 模块 1：听牌场景穷举验证 ---- */
for (const kind of Object.keys(E.SCENARIO_GENS)) {
  for (const street of ['flop', 'turn']) {
    for (let i = 0; i < N; i++) {
      let scen;
      try { scen = E.SCENARIO_GENS[kind](E.makeCtx(), street); }
      catch (e) { bad(`THROW ${kind}/${street}: ${e.message}`); break; }
      const all = scen.hero.concat(scen.board);
      const keys = new Set(all.map(c => c.r * 4 + c.s));
      if (keys.size !== all.length) bad(`DUP ${kind}/${street}`, all);
      if (scen.board.length !== (street === 'flop' ? 3 : 4)) bad(`LEN ${kind}/${street}`);
      const rc = E.recount(scen);
      if (rc !== scen.outs) bad(`OUTS MISMATCH ${kind}/${street}: ${scen.outs} vs ${rc}`);
      /* 独立穷举校验：逐张代入剩余牌，数真实听牌 outs（抓交叉污染） */
      const d = E.enumerateDrawOuts(scen.hero, scen.board);
      const want = (kind === 'over' || kind === 'set') ? 0 : scen.outs;
      if (d !== want) bad(`CONTAMINATED ${kind}/${street}: declared=${scen.outs} enumerated=${d}`,
        scen.hero.map(E.cardLabel), scen.board.map(E.cardLabel));
    }
  }
}

/* ---- 模块 1-5 sanity ---- */
for (let i = 0; i < 5000; i++) {
  const q1 = E.genOutsQuestion('all');
  if (q1.answer < 2 || q1.answer > 15) bad('outs q bad', q1);
  const q2 = E.genEquityQuestion();
  if (q2.answer !== q2.outs * (q2.street === 'flop' ? 4 : 2)) bad('equity q bad', q2);
  const q3 = E.genPotOddsQuestion();
  if (Math.abs(E.requiredEquity(q3.P, q3.B) - q3.answer) > 1e-9) bad('potodds bad', q3);
  const q4 = E.genDecisionQuestion();
  const est = q4.scen.outs * (q4.street === 'flop' ? 4 : 2);
  if (q4.answer !== (est > q4.req ? 'CALL' : 'FOLD') || Math.abs(est - q4.req) < 4) bad('decision bad', q4);
  const q5 = E.genNumberSenseQuestion();
  if (typeof q5.answer !== 'number') bad('numbers bad', q5);
}

/* ---- 模块 6：有效 Outs（独立重算） ---- */
for (let i = 0; i < 8000; i++) {
  const q = E.genDirtyOutsQuestion();
  const scen = q.scen;
  const all = scen.hero.concat(scen.board);
  const base = E.recount(scen);
  let clean;
  if (scen.threat.type === 'flush') {
    const s = scen.threat.suit;
    const dirty = scen.needRanks.filter(r => !all.some(c => c.r === r && c.s === s)).length;
    clean = base - dirty;
  } else if (scen.threat.type === 'hold') {
    clean = base - 1;
  } else {
    clean = base;
  }
  if (q.answer !== clean) bad(`dirty bad: ans=${q.answer} base=${base} clean=${clean}`, q.question);
  const keys = new Set(all.map(c => c.r * 4 + c.s));
  if (keys.size !== all.length) bad('dirty dup', all);
}

/* ---- 模块 7：对决锚点 ---- */
for (let i = 0; i < 3000; i++) {
  const q = E.genMatchupQuestion();
  if (q.answer < 18 || q.answer > 82) bad('matchup out of range', q);
}

/* ---- 模块 8：组合计数（独立公式重算） ---- */
const comb2 = n => (n < 2 ? 0 : (n * (n - 1)) / 2);
for (let i = 0; i < 8000; i++) {
  const q = E.genCombosQuestion();
  if (!q.check) { /* free 类固定答案 */
    if (![4, 6, 16].includes(q.answer)) bad('combos free bad', q);
    continue;
  }
  const c = q.check;
  let want;
  if (c.type === 'pairBlock') want = comb2(4 - c.seen);
  else if (c.type === 'nonpairBlock') want = (4 - c.seenA) * (4 - c.seenB);
  else if (c.type === 'range') want = c.rs.total;
  else want = (c.rs.pairPart / c.rs.total) * 100;
  if (Math.abs(q.answer - want) > 1e-9) bad('combos bad', c, q.answer, want);
}

/* ---- 模块 9：EV 与隐含赔率 ---- */
for (let i = 0; i < 8000; i++) {
  const q = E.genEvQuestion();
  if (q.kind === 'ev') {
    const ev = (q.eqPct / 100) * (q.P + q.B) - (1 - q.eqPct / 100) * q.B;
    if (Math.abs(q.answer - Math.round(ev)) > 1e-9) bad('ev bad', q, ev);
  } else {
    const X = q.B / (q.eqPct / 100) - (q.P + q.B);
    if (q.answer !== X || X <= 0) bad('implied bad', q, X);
  }
}

/* ---- 模块 10：防线数学 ---- */
for (let i = 0; i < 8000; i++) {
  const q = E.genDefenseQuestion();
  let want;
  if (q.kind === 'mdf') want = (q.P / (q.P + q.B)) * 100;
  else if (q.kind === 'bluff') want = (q.B / (q.P + q.B)) * 100;
  else want = (q.B / (q.P + 2 * q.B)) * 100;
  if (Math.abs(q.answer - want) > 1e-9) bad('defense bad', q, want);
}

/* ---- 模块 11：范围胜率 ---- */
for (let i = 0; i < 8000; i++) {
  const q = E.genRangeEquityQuestion();
  const want = q.parts.reduce((a, p, j) => a + q.pcts[j] * p[1], 0) / 100;
  if (Math.abs(q.answer - want) > 1e-9) bad('rangeeq bad', q, want);
  const sum = q.pcts.reduce((a, b) => a + b, 0);
  if (sum !== 100) bad('rangeeq pcts != 100', q.pcts);
}

/* ---- 模块 12：半诈唬 EV ---- */
for (let i = 0; i < 8000; i++) {
  const q = E.genSemiBluffQuestion();
  const ev = (q.fold / 100) * q.P + (1 - q.fold / 100) * ((q.eq / 100) * (q.P + q.B) - (1 - q.eq / 100) * q.B);
  if (Math.abs(q.answer - Math.round(ev)) > 1e-9) bad('semibluff bad', q, ev);
}

/* ---- 模块 13：SPR ---- */
for (let i = 0; i < 8000; i++) {
  const q = E.genSprQuestion();
  if (q.spr != null) {
    if (Math.abs(q.stack / q.P - q.spr) > 0.05) bad('spr calc bad', q);
    if (Math.abs(q.answer - q.spr) > 1e-9) bad('spr answer bad', q);
  } else if (![3, 13].includes(q.answer)) bad('spr anchor bad', q);
}

console.log(fails === 0
  ? `ALL PASS (${N * 14} scenarios + 76000 questions, 13 modules)`
  : `FAILS: ${fails}`);
process.exit(fails === 0 ? 0 : 1);
