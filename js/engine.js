// Deepfall game engine. Content (numbers, text, skills, enemies, events, story) lives in data/*.json.
"use strict";
let D, C, HEROES, HSK, ESK, ENEMIES, ENC, EV, STORY, HERO_IDS, MODDED = false;

// ================= utils =================
const R = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const RR = v => Array.isArray(v) ? R(v[0], v[1]) : (v || 0);
const pick = a => a[Math.floor(Math.random() * a.length)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt = (s, o) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => o[k] != null ? o[k] : m);
function spr(file, emoji, color, size, cls = '') {
  return `<div class="spr ${cls}" style="--c:${color};width:${size}px;height:${size}px"><img src="${assetSrc(file)}" alt="" onload="this.parentNode.classList.add('has')" onerror="this.remove()"><span style="font-size:${Math.round(size * .5)}px">${emoji}</span></div>`;
}
function ico(file, emoji) { return `<span class="ico"><img src="${assetSrc(file)}" alt="" onload="this.parentNode.classList.add('has')" onerror="this.remove()"><span>${emoji}</span></span>` }
const IC = { gold: () => ico('icon_gold', '🪙'), cry: () => ico('icon_crystal', '💎'), soul: () => ico('icon_soul', '👻'), ration: () => ico('icon_ration', '🍞'), potion: () => ico('icon_potion', '🧪'), feather: () => ico('icon_feather', '🪶') };
function bg(file, fallback) { return `background-image:linear-gradient(rgba(10,8,6,.35),rgba(10,8,6,.75)),url(${assetSrc(file)}),${fallback}` }
const BG = {
  lobby: () => bg('bg_lobby', 'radial-gradient(ellipse at 50% 110%,#5a3416 0%,#1c130d 55%,#0b0907 100%)'),
  dun: () => bg('bg_dungeon_1', 'linear-gradient(#16201a,#0c110d)'),
  boss: () => bg('bg_boss_1', 'radial-gradient(ellipse at 50% 30%,#1c2a3a,#07090c)'),
  title: () => bg('bg_title', 'radial-gradient(ellipse at 50% 80%,#3a2410 0%,#0b0907 70%)')
};
const stars = n => '★'.repeat(n);
const nl = s => String(s || '');

// ================= state =================
const KEY = 'deepfall_save_v1';
let S = null, B = null;
const ui = { tab: 'home', jtab: 'story', prep: null };
function fresh() {
  const st = C.start;
  return { v: 1, started: false, gold: st.gold, crystals: st.crystals, souls: st.souls, inv: { rations: st.rations, potions: st.potions, feathers: 0 }, heroes: {}, pity: 0, firstTen: true,
    runCount: 0, deepest: 0, know: {}, journals: [], talks: [], lobbyEvent: null, rumor: false, recentDead: [], lastParty: [], run: null };
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)) } catch (e) {} }
function load() { try { const s = localStorage.getItem(KEY); if (s) return JSON.parse(s) } catch (e) {} return null }
function addHero(id) { S.heroes[id] = { lv: 1, rank: 0, dead: false, aff: 0, last: S.runCount, hid: false, prog: 0, talk: [] } }
function K(t) { return S.know[t] || (S.know[t] = { seen: 0, kills: 0, rev: false }) }
function knowLv(t) { const k = S.know[t]; if (!k) return 0; if (k.kills >= C.dungeon.knowWeakKills) return 2; return k.seen >= 1 ? 1 : 0 }
function heroStats(id) {
  const h = S.heroes[id], d = HEROES[id], hc = C.hero;
  const m = (1 + hc.lvBonus * (h.lv - 1)) * (1 + C.gacha.rankBonus * h.rank) * (h.aff >= hc.affBonusAt ? 1 + hc.affBonus : 1);
  return { maxHp: Math.round(d.hp * m), atk: Math.round(d.atk * m), def: Math.round(d.def * (1 + hc.defLvBonus * (h.lv - 1))) };
}
const alive = id => S.heroes[id] && !S.heroes[id].dead && HEROES[id];
const owned = () => HERO_IDS.filter(id => S.heroes[id]);
const reviveCost = id => C.death.reviveSouls[HEROES[id].star] || 1;

// ================= modal =================
function modal(html) { const m = document.getElementById('modal'); m.innerHTML = `<div class="mbox">${html}</div>`; m.classList.add('on') }
function closeModal() { const m = document.getElementById('modal'); m.classList.remove('on'); m.innerHTML = '' }
let _cb = [];
function cb(fn) { _cb.push(fn); return `G.cb(${_cb.length - 1})` }
function choiceModal(title, text, choices) {
  _cb = [];
  modal(`<h2>${title}</h2><div class="story">${text}</div><div class="ch">${choices.map(c => `<button class="${c.cls || ''}" ${c.dis ? 'disabled' : ''} onclick="${cb(c.fn)}">${c.label}</button>`).join('')}</div>`);
}
function storyModal(pages, done, title = '') {
  let i = 0; const show = () => choiceModal(title, pages[i], [{ label: i < pages.length - 1 ? 'ต่อไป ▸' : 'ตกลง', cls: 'pri', fn: () => { i++; if (i < pages.length) show(); else { closeModal(); done && done() } } }]); show();
}
function toast(t) { setTimeout(() => choiceModal('', t, [{ label: 'ตกลง', fn: closeModal }]), 50) }

// ================= render root =================
function render() {
  const app = document.getElementById('app');
  if (!S.started) { app.innerHTML = titleScreen(); return }
  if (B) { app.innerHTML = battleScreen(); flushFx(); return }
  if (S.run) { app.innerHTML = mapScreen(); return }
  app.innerHTML = lobbyScreen();
}
function modBar() { return MODDED ? `<div class="modbar"><span>🧪 โหมดทดลอง: ใช้ข้อมูลจาก Editor</span><a href="editor.html">เปิด Editor</a></div>` : '' }
function resBar() {
  return `${modBar()}<div class="bar"><span class="res">${IC.cry()} ${S.crystals}</span><span class="res">${IC.gold()} ${S.gold}</span><span class="res">${IC.soul()} ${S.souls}</span><span class="res">${IC.ration()} ${S.inv.rations}</span><span class="res">${IC.potion()} ${S.inv.potions}</span>${S.inv.feathers ? `<span class="res">${IC.feather()} ${S.inv.feathers}</span>` : ''}</div>`;
}

// ================= title =================
function titleScreen() {
  return `<div class="screen" style="${BG.title()};justify-content:center;align-items:center;text-align:center;padding:24px">${modBar()}
  <div class="pix mut" style="letter-spacing:3px">ห้วงลึกของผู้เลือก</div><h1>DEEPFALL</h1>
  <p class="mut" style="max-width:300px">เกมกาชาที่กลายเป็นโลกจริง<br>ทุกการเลือกมีราคา</p>
  <button class="pri" style="font-size:17px;padding:12px 28px;margin-top:20px" onclick="G.start()">เริ่มเกม</button></div>`;
}

// ================= lobby =================
const TABS = [['home', '🏮', 'ล็อบบี้'], ['summon', '💎', 'อัญเชิญ'], ['heroes', '🛡️', 'วีรบุรุษ'], ['altar', '🪦', 'แท่นวิญญาณ'], ['shop', '🎒', 'ร้าน'], ['journal', '📖', 'บันทึก']];
function lobbyScreen() {
  let body = '';
  if (ui.prep) body = prepView();
  else body = { home: homeView, summon: summonView, heroes: heroesView, altar: altarView, shop: shopView, journal: journalView }[ui.tab]();
  return `<div class="screen" style="${BG.lobby()}">${resBar()}<div class="body">${body}</div>
  ${ui.prep ? '' : `<div class="nav">${TABS.map(t => `<button class="${ui.tab === t[0] ? 'on' : ''}" onclick="G.tab('${t[0]}')"><b>${t[1]}</b>${t[2]}</button>`).join('')}</div>`}</div>`;
}
function homeView() {
  const ev = S.lobbyEvent ? eventCard(S.lobbyEvent) : '';
  const deadN = owned().filter(id => S.heroes[id].dead).length;
  return `<div style="text-align:center;margin:6px 0 14px"><div class="pix" style="font-size:24px;color:var(--lamp2)">${STORY.townName}</div><div class="mut">${STORY.townSub}</div></div>
  ${ev}
  <div class="card"><h3>ห้วงลึก — ${STORY.dungeonName}</h3><div class="mut">ชั้นลึกสุดที่ไปถึง: ${S.deepest || '-'} / ${C.dungeon.bossFloor} · ออกสำรวจไปแล้ว ${S.runCount} ครั้ง</div>
  <p style="font-size:13px;margin:8px 0">ยิ่งลึกยิ่งอันตราย วีรบุรุษที่ล้มอาจไม่กลับมาอีก ของที่เก็บได้จะเป็นของคุณเมื่อกลับถึงเมืองเท่านั้น</p>
  <button class="pri" style="width:100%;font-size:16px" onclick="G.prep()">⬇ เตรียมออกสำรวจ</button></div>
  ${deadN ? `<div class="card mut">🪦 มีวีรบุรุษ ${deadN} คนรอการชุบชีวิตที่แท่นวิญญาณ</div>` : ''}`;
}
function eventCard(ev) {
  const h = ev.id ? HEROES[ev.id] : null, L = EV.lobby, lc = C.lobby; if (ev.id && !h) return '';
  const nm = { name: h ? h.name : '' }; let t = '', x = '', btn = '';
  if (ev.type === 'talk') { t = `${h.name} อยากคุยด้วย`; x = `"${h.talk[ev.lvl]}"`; btn = `<button class="pri" onclick="G.ev('ok')">ฟัง</button>` }
  if (ev.type === 'neglect') { t = L.neglect.title; x = fmt(L.neglect.text, nm); btn = `<button class="pri" onclick="G.ev('a')" ${S.gold < lc.neglectCost ? 'disabled' : ''}>ชวนคุยและเลี้ยงข้าว (-${lc.neglectCost} ทอง)</button><button onclick="G.ev('b')">ปล่อยไว้</button>` }
  if (ev.type === 'merchant') { t = L.merchant.title; x = L.merchant.text; btn = `<button onclick="G.ev('a')" ${S.gold < lc.featherPrice ? 'disabled' : ''}>${IC.feather()} ขนนกฟีนิกซ์ (ชุบชีวิตฟรี) — ${lc.featherPrice} ทอง</button><button onclick="G.ev('b')" ${S.gold < lc.crystalPackPrice ? 'disabled' : ''}>${IC.cry()} คริสตัล ${lc.crystalPack} — ${lc.crystalPackPrice} ทอง</button><button onclick="G.ev('x')">ไม่ซื้อ</button>` }
  if (ev.type === 'rumor') { t = L.rumor.title; x = L.rumor.text; btn = `<button class="pri" onclick="G.ev('ok')">จดไว้ (รอบหน้ามีห้องลับ ✨)</button>` }
  if (ev.type === 'gift') { t = L.gift.title; x = L.gift.text; btn = `<button class="pri" onclick="G.ev('ok')">รับไว้ (+${lc.giftRations} เสบียง)</button>` }
  if (ev.type === 'memorial') { t = L.memorial.title; x = fmt(L.memorial.text, nm); btn = `<button class="pri" onclick="G.ev('ok')">ร่วมไว้อาลัย (+1 เศษวิญญาณ)</button>` }
  return `<div class="card" style="border-color:var(--lamp)"><div class="row" style="align-items:flex-start">${h ? spr(h.file + '_portrait', h.emoji, h.color, 56) : '<div style="font-size:34px">✦</div>'}<div style="flex:1"><h3>${t}</h3><div style="font-size:14px;line-height:1.6;white-space:pre-line">${x}</div></div></div><div style="display:flex;flex-direction:column;gap:6px;margin-top:10px">${btn}</div></div>`;
}
function rollLobbyEvent() {
  for (const id of owned()) { const h = S.heroes[id]; if (h.dead) continue; for (const l of [3, 6]) if (h.aff >= l && !h.talk.includes(l) && HEROES[id].talk && HEROES[id].talk[l]) return { type: 'talk', id, lvl: l } }
  if (Math.random() < C.lobby.noEventChance) return null;
  const opts = [{ type: 'merchant' }, { type: 'rumor' }, { type: 'gift' }];
  const neg = owned().filter(id => alive(id) && S.runCount - S.heroes[id].last >= C.lobby.neglectRuns);
  if (neg.length) opts.push({ type: 'neglect', id: pick(neg) }, { type: 'neglect', id: pick(neg) });
  const rd = S.recentDead.filter(id => HEROES[id]);
  if (rd.length) opts.push({ type: 'memorial', id: pick(rd) }, { type: 'memorial', id: pick(rd) });
  return pick(opts);
}
function resolveEvent(c) {
  const ev = S.lobbyEvent; if (!ev) return; const h = ev.id && S.heroes[ev.id], lc = C.lobby;
  if (ev.type === 'talk') { h.talk.push(ev.lvl); S.talks.push({ id: ev.id, lvl: ev.lvl }); if (ev.lvl === 6) toast(`${HEROES[ev.id].name} ผูกพันกับคุณมากขึ้น (ค่าสถานะ +${Math.round(C.hero.affBonus * 100)}%)`) }
  if (ev.type === 'neglect') { if (c === 'a' && S.gold >= lc.neglectCost) { S.gold -= lc.neglectCost; h.aff += 2; h.last = S.runCount; toast(fmt(EV.lobby.neglect.thanks, { name: HEROES[ev.id].name })) } else h.aff = Math.max(0, h.aff - 1) }
  if (ev.type === 'merchant') { if (c === 'a' && S.gold >= lc.featherPrice) { S.gold -= lc.featherPrice; S.inv.feathers++ } if (c === 'b' && S.gold >= lc.crystalPackPrice) { S.gold -= lc.crystalPackPrice; S.crystals += lc.crystalPack } }
  if (ev.type === 'rumor') S.rumor = true;
  if (ev.type === 'gift') S.inv.rations += lc.giftRations;
  if (ev.type === 'memorial') { S.souls++; S.recentDead = S.recentDead.filter(x => x !== ev.id) }
  S.lobbyEvent = null; save(); render();
}

// ----- summon -----
function summonView() {
  const g = C.gacha;
  return `<div class="card" style="text-align:center"><div class="pix" style="font-size:22px;color:var(--lamp2)">แท่นอัญเชิญ</div>
  <p class="mut">การันตี ${g.pityStar}★ ขึ้นไปภายใน ${g.pity - S.pity} ครั้ง${S.firstTen ? ` · 10 ครั้งแรกการันตี ${g.firstTenMinStar}★` : ''}</p>
  <div class="row" style="justify-content:center"><button onclick="G.pull(1)" ${S.crystals < g.cost1 ? 'disabled' : ''}>อัญเชิญ 1 ครั้ง<br>${IC.cry()} ${g.cost1}</button>
  <button class="pri" onclick="G.pull(10)" ${S.crystals < g.cost10 ? 'disabled' : ''}>อัญเชิญ 10 ครั้ง<br>${IC.cry()} ${g.cost10}</button></div></div>
  <div class="card"><h3>อัตราการออก</h3>${[5, 4, 3, 2, 1].map(s => `<div class="row" style="justify-content:space-between"><span class="stars">${stars(s)}</span><span>${g.rates[s] || 0}%</span><span class="mut">${HERO_IDS.filter(i => HEROES[i].star === s).map(i => HEROES[i].name).join(', ')}</span></div>`).join('')}
  <p class="mut" style="margin-bottom:0">ได้ตัวซ้ำ: ค่าพลัง +${Math.round(g.rankBonus * 100)}% (สูงสุด +${g.maxRank}) · ได้ตัวที่ตายไปแล้วซ้ำ: เธอจะกลับมามีชีวิต</p></div>`;
}
function rollStar() {
  const rates = C.gacha.rates, tot = [1, 2, 3, 4, 5].reduce((a, s) => a + (rates[s] || 0), 0);
  let r = Math.random() * tot;
  for (const s of [5, 4, 3, 2, 1]) { r -= rates[s] || 0; if (r < 0) return s } return 1;
}
function doPull(n) {
  const g = C.gacha, cost = n === 10 ? g.cost10 : g.cost1; if (S.crystals < cost) return; S.crystals -= cost;
  const res = []; let gotMin = false;
  for (let i = 0; i < n; i++) {
    S.pity++; let st = rollStar();
    if (S.pity >= g.pity && st < g.pityStar) st = g.pityStar;
    if (n === 10 && S.firstTen && i === 9 && !gotMin && st < g.firstTenMinStar) st = g.firstTenMinStar;
    let pool = HERO_IDS.filter(x => HEROES[x].star === st);
    while (!pool.length && st > 1) { st--; pool = HERO_IDS.filter(x => HEROES[x].star === st) }
    if (st >= g.firstTenMinStar) gotMin = true; if (st >= g.pityStar) S.pity = 0;
    const id = pick(pool); let note = 'ใหม่!';
    if (!S.heroes[id]) addHero(id);
    else { const h = S.heroes[id]; if (h.dead) { h.dead = false; note = 'ฟื้นคืนชีพ!'; S.recentDead = S.recentDead.filter(x => x !== id) } else if (h.rank < g.maxRank) { h.rank++; note = `พลัง +${Math.round(g.rankBonus * 100)}%` } else { S.souls += g.dupeMaxSouls; note = `+${g.dupeMaxSouls} วิญญาณ` } }
    res.push({ id, note });
  }
  if (n === 10) S.firstTen = false;
  save(); render(); _cb = [];
  modal(`<h2>ผลการอัญเชิญ</h2><div class="pull">${res.map((r, i) => { const h = HEROES[r.id]; return `<div style="animation-delay:${i * .12}s">${spr(h.file + '_portrait', h.emoji, h.color, 56, 'r' + h.star)}<div class="stars">${stars(h.star)}</div><div>${h.name}</div><div class="mut" style="font-size:10px">${r.note}</div></div>` }).join('')}</div><div class="ch"><button class="pri" onclick="G.close()">ตกลง</button></div>`);
}

// ----- heroes -----
function heroesView() {
  return `<div class="grid">${owned().sort((a, b) => HEROES[b].star - HEROES[a].star).map(id => heroCard(id, `G.hero('${id}')`)).join('')}</div><p class="mut">แตะวีรบุรุษเพื่อดูสกิลและฝึกเลเวล</p>`;
}
function heroCard(id, onclick, extra = '') {
  const d = HEROES[id], h = S.heroes[id];
  return `<div class="hcard ${h.dead ? 'dead' : ''} ${extra}" onclick="${onclick}">${spr(d.file, d.emoji, d.color, 60)}<div class="nm">${h.dead ? '🪦 ' : ''}${d.name}</div><div class="stars">${stars(d.star)}${h.rank ? ` +${h.rank}` : ''}</div><div class="mut" style="font-size:11px">Lv.${h.lv} · ${d.role}</div></div>`;
}
function skLine(k, hidden) { const s = HSK[k]; if (!s) return ''; return `<div class="sk ${hidden ? 'hid' : ''}"><b>${hidden ? '✦ ' : ''}${s.name}</b> ${s.cd ? `<span class="mut">(${hidden ? 'สกิลซ่อน · ' : ''}คูลดาวน์ ${s.cd})</span>` : ''}<br><span class="mut">${s.desc}</span></div>` }
function heroDetail(id) {
  const d = HEROES[id], h = S.heroes[id], st = heroStats(id), cost = C.hero.trainCostPerLv * h.lv, maxLv = C.hero.maxLv;
  const sk = d.skills.map(k => skLine(k)).join('');
  let hid = '';
  if (d.hidden) hid = h.hid ? skLine(d.hidden, true) : `<div class="sk hid"><b>✦ ???</b> <span class="mut">(สกิลซ่อน)</span><br><span class="mut">เบาะแส: ${d.hint || '???'}${d.unlock && d.unlock.type === 'treasure' ? ` (${h.prog}/${d.unlock.n})` : ''}</span></div>`;
  _cb = [];
  modal(`<div class="row" style="align-items:flex-start">${spr(d.file + '_portrait', d.emoji, d.color, 80)}<div><h2 style="margin:0">${d.name}</h2><div class="mut">${d.title}</div><div class="stars">${stars(d.star)}${h.rank ? ` +${h.rank}` : ''}</div></div></div>
  ${h.dead ? '<p style="color:var(--red)">🪦 เสียชีวิตแล้ว — ชุบชีวิตได้ที่แท่นวิญญาณ</p>' : ''}
  <p>Lv.${h.lv} · HP ${st.maxHp} · ATK ${st.atk} · DEF ${st.def}<br><span class="mut">ความผูกพัน ${h.aff} ${h.aff >= C.hero.affBonusAt ? '(โบนัส)' : ''} · ${d.role}</span></p>
  ${sk}${hid}${skLine('defend')}
  <div class="ch">${h.dead ? '' : `<button class="pri" onclick="${cb(() => { if (S.gold >= cost && h.lv < maxLv) { S.gold -= cost; h.lv++; save(); render(); heroDetail(id) } })}" ${S.gold < cost || h.lv >= maxLv ? 'disabled' : ''}>ฝึก → Lv.${h.lv + 1} (${IC.gold()} ${cost})</button>`}<button onclick="G.close()">ปิด</button></div>`);
}

// ----- altar -----
function altarView() {
  const dead = owned().filter(id => S.heroes[id].dead);
  return `<div class="card"><h3>แท่นวิญญาณ</h3><p class="mut" style="margin:0">ใช้เศษวิญญาณดึงวีรบุรุษกลับจากห้วงลึก วิญญาณที่กลับมาจะอ่อนลง ${C.death.reviveLvLoss} เลเวล ส่วนขนนกฟีนิกซ์ชุบได้โดยไม่เสียอะไร<br>มี ${IC.soul()} ${S.souls} · ${IC.feather()} ${S.inv.feathers}</p></div>
  ${dead.length ? dead.map(id => { const d = HEROES[id], c = reviveCost(id); return `<div class="card row">${spr(d.file + '_portrait', d.emoji, d.color, 52)}<div style="flex:1"><b>${d.name}</b> <span class="stars">${stars(d.star)}</span><div class="mut">Lv.${S.heroes[id].lv}</div></div><div style="display:flex;flex-direction:column;gap:4px"><button onclick="G.revive('${id}','soul')" ${S.souls < c ? 'disabled' : ''}>${IC.soul()} ${c}</button><button onclick="G.revive('${id}','feather')" ${S.inv.feathers < 1 ? 'disabled' : ''}>${IC.feather()} 1</button></div></div>` }).join('') : '<p class="mut" style="text-align:center">ยังไม่มีใครต้องการการชุบชีวิต... ขอให้เป็นแบบนี้ไปนานๆ</p>'}`;
}
function revive(id, how) {
  const h = S.heroes[id], c = reviveCost(id);
  if (how === 'soul') { if (S.souls < c) return; S.souls -= c; h.lv = Math.max(1, h.lv - C.death.reviveLvLoss) } else { if (S.inv.feathers < 1) return; S.inv.feathers-- }
  h.dead = false; S.recentDead = S.recentDead.filter(x => x !== id); save(); render(); toast(`${HEROES[id].name} กลับมาจากห้วงลึกแล้ว`);
}

// ----- shop -----
function shopView() {
  const p = C.shop;
  const it = [['ration', IC.ration(), 'เสบียง ×5', 'ใช้ 1 ชิ้นทุกครั้งที่เดินไปห้องใหม่ ถ้าหมด ทีมจะหิวและเสีย HP', p.ration5], ['potion', IC.potion(), 'ยาฟื้นฟู', `ฟื้น HP ${Math.round(C.dungeon.potionHeal * 100)}% ใช้ในการต่อสู้หรือบนแผนที่`, p.potion], ['soul', IC.soul(), 'เศษวิญญาณ', 'ใช้ชุบชีวิตวีรบุรุษ', p.soul]];
  return it.map(i => `<div class="card row"><div style="font-size:24px">${i[1]}</div><div style="flex:1"><b>${i[2]}</b><div class="mut">${i[3]}</div></div><button onclick="G.buy('${i[0]}')" ${S.gold < i[4] ? 'disabled' : ''}>${IC.gold()} ${i[4]}</button></div>`).join('');
}
function buy(k) { const c = { ration: C.shop.ration5, potion: C.shop.potion, soul: C.shop.soul }[k]; if (S.gold < c) return; S.gold -= c; if (k === 'ration') S.inv.rations += 5; if (k === 'potion') S.inv.potions++; if (k === 'soul') S.souls++; save(); render() }

// ----- journal -----
function journalView() {
  const t = ui.jtab; let x = '';
  const J = STORY.journals;
  if (t === 'story') {
    x = `<div class="card"><h3>บทนำ — ผู้เลือก</h3><div class="story" style="font-size:14px">${STORY.intro.join('\n\n')}</div></div>` +
      S.journals.slice().sort().filter(n => J[n]).map(n => `<div class="card"><h3>${J[n].t}</h3><div class="story" style="font-size:14px">${J[n].x}</div></div>`).join('') +
      (S.journals.length < dataKeys(J).length ? `<p class="mut" style="text-align:center">บันทึกที่เหลือรออยู่ในห้วงลึก...</p>` : '');
  } else if (t === 'talk') {
    x = S.talks.filter(v => HEROES[v.id]).length ? S.talks.filter(v => HEROES[v.id]).map(v => { const h = HEROES[v.id]; return `<div class="card row" style="align-items:flex-start">${spr(h.file + '_portrait', h.emoji, h.color, 44)}<div style="flex:1"><b>${h.name}</b><div style="font-size:14px">"${h.talk[v.lvl]}"</div></div></div>` }).join('') : '<p class="mut" style="text-align:center">พาวีรบุรุษออกสำรวจด้วยกันบ่อยๆ แล้วพวกเขาจะเริ่มเปิดใจ</p>';
  } else if (t === 'beast') {
    const ks = dataKeys(ENEMIES).filter(k => S.know[k]), need = C.dungeon.knowWeakKills;
    x = ks.length ? ks.map(k => { const e = ENEMIES[k], kn = S.know[k], lv = knowLv(k); return `<div class="card row">${spr(e.file, e.emoji, e.color, 48)}<div style="flex:1"><b>${e.name}</b><div class="mut">เจอ ${kn.seen} ครั้ง · ปราบ ${kn.kills} ตัว</div><div style="font-size:12px">${e.boss ? (kn.rev ? 'รู้แล้ว: เลือดเหลือครึ่งจะเข้าเฟส 2 ระฆังครั้งที่สองตามด้วยคำพิพากษา ต้องมีโล่' : 'ยังไม่รู้ว่ามันซ่อนอะไรไว้...') : lv >= 2 ? `✔ รู้จุดอ่อน: ทีมทำดาเมจเพิ่ม ${Math.round(C.dungeon.knowWeakBonus * 100)}%` : lv >= 1 ? `เห็นตัวเลขท่าโจมตีแล้ว · ปราบอีก ${need - kn.kills} ตัวเพื่อรู้จุดอ่อน` : 'ยังไม่รู้อะไรเลย'}</div></div></div>` }).join('') : '<p class="mut" style="text-align:center">ยังไม่เคยเจอศัตรู</p>';
  } else {
    x = `<div class="card"><h3>วิธีเล่น</h3><div style="font-size:13px;line-height:1.7">• ศัตรูจะบอกล่วงหน้าว่าเทิร์นนี้จะทำอะไรใส่ใคร ใช้โล่และยั่วยุรับมือ<br>• ครั้งแรกที่เจอศัตรู จะไม่เห็นตัวเลขดาเมจ เจอซ้ำจึงเห็น ปราบครบ ${C.dungeon.knowWeakKills} ตัวจะรู้จุดอ่อน<br>• โล่หายเมื่อจบเทิร์น · ตำแหน่ง 1–2 คือแถวหน้า ศัตรูส่วนใหญ่ชอบตีแถวหน้า<br>• วีรบุรุษที่ล้มมีโอกาส ${Math.round(C.death.surviveChance * 100)}% ที่จะรอด ที่เหลือจะตาย ต้องชุบที่แท่นวิญญาณ<br>• ของที่เก็บได้จะเป็นของคุณเมื่อกลับถึงเมืองเท่านั้น ทีมล้มหมด = เสียทั้งหมด</div></div>
    <div class="card"><h3>เครื่องมือสร้างเกม</h3><p class="mut">แก้ค่าพลัง ตัวละคร ศัตรู เหตุการณ์ เนื้อเรื่อง และลองใส่ภาพ</p><a href="editor.html"><button class="pri">เปิด Editor</button></a></div>
    <div class="card"><h3>ข้อมูลเซฟ</h3><p class="mut">เซฟอยู่ในเบราว์เซอร์ของเครื่องนี้</p><button class="dan" onclick="G.reset()">ลบเซฟและเริ่มใหม่</button></div>`;
  }
  return `<div class="tabs2">${[['story', 'เรื่องราว'], ['talk', 'บทสนทนา'], ['beast', 'ศัตรู'], ['help', 'อื่นๆ']].map(a => `<button class="${t === a[0] ? 'on' : ''}" onclick="G.jtab('${a[0]}')">${a[1]}</button>`).join('')}</div>${x}`;
}

// ----- prep -----
function prepView() {
  const sel = ui.prep, av = owned().filter(alive).sort((a, b) => HEROES[b].star - HEROES[a].star);
  const slots = [0, 1, 2, 3].map(i => { const id = sel[i]; const lab = i < 2 ? 'แถวหน้า' : 'แถวหลัง'; if (!id) return `<div class="hcard" style="opacity:.5"><div style="height:60px;display:grid;place-items:center;font-size:24px">＋</div><div class="mut" style="font-size:11px">${i + 1} · ${lab}</div></div>`; const d = HEROES[id]; return `<div class="hcard sel" onclick="G.psel('${id}')">${spr(d.file, d.emoji, d.color, 48)}<div class="nm" style="font-size:12px">${d.name}</div><div class="mut" style="font-size:11px">${i + 1} · ${lab}</div></div>` }).join('');
  return `<div class="row" style="justify-content:space-between;margin-bottom:8px"><b style="font-size:17px">เตรียมทีม</b><button onclick="G.prepX()">✕ ยกเลิก</button></div>
  <div class="grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:10px">${slots}</div>
  <p class="mut" style="margin:4px 0 8px">แตะเพื่อเลือก/เอาออก ลำดับที่เลือกคือตำแหน่ง</p>
  <div class="grid">${av.map(id => heroCard(id, `G.psel('${id}')`, sel.includes(id) ? 'sel' : '')).join('')}</div>
  <div class="card" style="margin-top:12px"><h3>เสบียงที่จะพาไป</h3><div class="row" style="justify-content:space-between"><span>${IC.ration()} เสบียง ${S.inv.rations}</span><button onclick="G.buy('ration')" ${S.gold < C.shop.ration5 ? 'disabled' : ''}>+5 (${IC.gold()}${C.shop.ration5})</button></div>
  <div class="row" style="justify-content:space-between;margin-top:6px"><span>${IC.potion()} ยา ${S.inv.potions}</span><button onclick="G.buy('potion')" ${S.gold < C.shop.potion ? 'disabled' : ''}>+1 (${IC.gold()}${C.shop.potion})</button></div>
  <p class="mut" style="margin-bottom:0">แนะนำเสบียงอย่างน้อย 6 ต่อชั้น · ${S.rumor ? '✨ ข่าวลือ: รอบนี้มีห้องลับ' : ''}</p></div>
  <button class="pri" style="width:100%;font-size:17px;padding:12px" onclick="G.go()" ${sel.length ? '' : 'disabled'}>⬇ ลงสู่ห้วงลึก</button>`;
}

// ================= run / map =================
const ROOM = { battle: ['room_battle', '⚔️', 'ต่อสู้'], elite: ['room_elite', '👹', 'ศัตรูเก่ง'], treasure: ['room_treasure', '💰', 'สมบัติ'], rest: ['room_rest', '🔥', 'ห้องพัก'], event: ['room_event', '❓', 'เหตุการณ์'], merchant: ['room_merchant', '🎒', 'พ่อค้า'], stairs: ['room_stairs', '🪜', 'บันไดลง'], boss: ['room_boss', '🔔', 'บอส'], secret: ['room_treasure', '✨', 'ห้องลับ'] };
function rollType(f) {
  const w = Object.entries(C.dungeon.roomWeights).map(([t, v]) => [t, t === 'elite' && f < C.dungeon.eliteFromFloor ? 0 : v]);
  let r = Math.random() * w.reduce((a, b) => a + b[1], 0); for (const [t, v] of w) { r -= v; if (r < 0) return t } return 'battle';
}
function genFloor(f) {
  const boss = f === C.dungeon.bossFloor, L = boss ? C.dungeon.bossLayers : C.dungeon.layers, layers = [];
  for (let l = 0; l < L; l++) { const n = l === 0 ? 2 : R(2, 3), row = []; for (let i = 0; i < n; i++) row.push({ t: l === 0 ? 'battle' : rollType(f), x: (i + 1) / (n + 1) * 100, links: [], done: false }); layers.push(row) }
  if (boss) layers[L - 1][0].t = 'rest';
  layers.push([{ t: boss ? 'boss' : 'stairs', x: 50, links: [], done: false }]);
  for (let l = 0; l < layers.length - 1; l++) {
    const A = layers[l], N = layers[l + 1];
    A.forEach(a => { let j = 0, best = 1e9; N.forEach((b, k) => { const d = Math.abs(a.x - b.x); if (d < best) { best = d; j = k } }); a.links.push(j); if (Math.random() < .45) { const k = j + (Math.random() < .5 ? -1 : 1); if (N[k]) a.links.push(k) } });
    N.forEach((b, k) => { if (!A.some(a => a.links.includes(k))) { let j = 0, best = 1e9; A.forEach((a, i) => { const d = Math.abs(a.x - b.x); if (d < best) { best = d; j = i } }); A[j].links.push(k) } });
    A.forEach(a => { a.links = [...new Set(a.links)].sort() });
  }
  if (S.run && S.run.secretFloor === f && L > 1) { const l = R(1, L - 1); pick(layers[l]).t = 'secret' }
  return { layers };
}
function startRun() {
  const party = ui.prep.slice(); if (!party.length) return;
  S.runCount++; S.lastParty = party; S.recentDead = [];
  const hp = {}; party.forEach(id => { hp[id] = heroStats(id).maxHp; S.heroes[id].last = S.runCount });
  const bf = C.dungeon.bossFloor;
  S.run = { floor: 1, party, hp, loot: { gold: 0, crystals: 0, souls: 0 }, pos: { l: -1, i: 0 }, secretFloor: S.rumor ? R(Math.min(2, bf - 1), Math.max(2, bf - 1)) : 0, map: null };
  B = null; S.rumor = false; S.run.map = genFloor(1); S.deepest = Math.max(S.deepest, 1);
  ui.prep = null; save(); render();
}
function mapScreen() {
  const r = S.run, m = r.map, H = m.layers.length * 78 + 20, isBoss = r.floor === C.dungeon.bossFloor;
  const avail = availNodes();
  let lines = '';
  m.layers.forEach((row, l) => row.forEach((n, i) => n.links.forEach(j => { const b = m.layers[l + 1][j]; lines += `<line x1="${n.x}" y1="${l * 78 + 45}" x2="${b.x}" y2="${(l + 1) * 78 + 45}" stroke="${n.done && r.pos.l === l && r.pos.i === i ? '#f0a040' : '#4a3c30'}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-dasharray="4 4"/>` })));
  const nodes = m.layers.map((row, l) => row.map((n, i) => { const rm = ROOM[n.t], cur = r.pos.l === l && r.pos.i === i, av = avail.some(a => a[0] === l && a[1] === i);
    return `<button class="node ${n.done ? 'done' : ''} ${cur ? 'cur' : ''} ${av ? 'av' : ''}" style="left:${n.x}%;top:${l * 78 + 45}px" ${av ? `onclick="G.enter(${l},${i})"` : ''} title="${rm[2]}">${spr(rm[0], rm[1], 'transparent', 34)}</button>` }).join('')).join('');
  const party = r.party.map(id => { const d = HEROES[id], mx = heroStats(id).maxHp, hp = r.hp[id]; return `<div>${d.name}<div class="hpb"><i style="width:${hp / mx * 100}%"></i></div>${hp}/${mx}</div>` }).join('');
  return `<div class="screen" style="${isBoss ? BG.boss() : BG.dun()}">${modBar()}
  <div class="bar"><b class="pix" style="color:var(--lamp2)">ชั้น ${r.floor} · ${isBoss ? STORY.bossRoomName : STORY.dungeonName}</b><span class="res">${IC.ration()} ${S.inv.rations}</span><span class="res">${IC.potion()} ${S.inv.potions}</span><span class="mut">ของที่เก็บ: ${IC.gold()}${r.loot.gold} ${IC.cry()}${r.loot.crystals} ${IC.soul()}${r.loot.souls}</span></div>
  <div style="padding:8px"><div class="mini">${party}</div>${r.hungry ? `<div style="color:var(--red);font-size:12px;margin-top:6px;text-align:center">🍞 เสบียงหมด! ทุกก้าวทำให้ทีมเสีย HP ${Math.round(C.dungeon.starvePct * 100)}%</div>` : ''}</div>
  <div class="body"><div class="map" style="height:${H}px"><svg viewBox="0 0 100 ${H}" preserveAspectRatio="none">${lines}</svg>${nodes}</div>
  <p class="mut" style="text-align:center;font-size:12px">เลือกห้องที่เรืองแสง · เดินแต่ละห้องใช้เสบียง 1</p></div>
  <div class="acts row" style="justify-content:space-between"><button onclick="G.mapPotion()" ${S.inv.potions ? '' : 'disabled'}>${IC.potion()} ใช้ยา</button><button class="dan" onclick="G.retreat()">ถอยกลับเมือง</button></div></div>`;
}
function availNodes() {
  const r = S.run, m = r.map; if (r.pos.l < 0) return m.layers[0].map((n, i) => [0, i]);
  const cur = m.layers[r.pos.l][r.pos.i]; if (!cur.done) return [[r.pos.l, r.pos.i]];
  if (r.pos.l >= m.layers.length - 1) return [];
  return cur.links.map(j => [r.pos.l + 1, j]);
}
function hurtParty(pct) { S.run.party.forEach(id => { const mx = heroStats(id).maxHp; S.run.hp[id] = Math.max(1, S.run.hp[id] - Math.round(mx * pct)) }) }
function healParty(pct) { S.run.party.forEach(id => { const mx = heroStats(id).maxHp; S.run.hp[id] = Math.min(mx, S.run.hp[id] + Math.round(mx * pct)) }) }
function partyAff(n) { S.run.party.forEach(id => { S.heroes[id].aff = Math.max(0, S.heroes[id].aff + n) }) }
function enterNode(l, i) {
  const r = S.run, n = r.map.layers[l][i];
  const moving = !(r.pos.l === l && r.pos.i === i);
  if (moving) {
    r.pos = { l, i };
    if (S.inv.rations > 0) { S.inv.rations--; r.hungry = false } else { hurtParty(C.dungeon.starvePct); r.hungry = true }
  }
  if (!['battle', 'elite', 'boss'].includes(n.t)) n.done = true;
  save();
  const done = () => { n.done = true; save(); render() };
  const RM = EV.rooms;
  switch (n.t) {
    case 'battle': startBattle('battle'); break;
    case 'elite': startBattle('elite'); break;
    case 'boss': storyModal([STORY.boss.intro], () => startBattle('boss'), STORY.boss.title); break;
    case 'treasure': case 'secret': {
      const big = n.t === 'secret', f = r.floor, rw = big ? C.rewards.secret : C.rewards.treasure;
      const g = RR(rw.gold) * f, c = RR(rw.crystals); const s = big ? (rw.souls || 0) : (Math.random() < rw.soulChance ? 1 : 0); let extra = '';
      r.loot.gold += g; r.loot.crystals += c; r.loot.souls += s;
      if (!big && Math.random() < rw.potionChance) { S.inv.potions++; extra += `<br>${IC.potion()} ยา 1 ขวด` }
      if (!big && Math.random() < rw.rationChance) { S.inv.rations += 2; extra += `<br>${IC.ration()} เสบียง 2` }
      let unl = '';
      r.party.forEach(id => { const d = HEROES[id], h = S.heroes[id]; if (d.hidden && !h.hid && d.unlock && d.unlock.type === 'treasure') { h.prog++; if (h.prog >= d.unlock.n) { h.hid = true; unl += `<br><br>✦ <b>${d.name}ปลดล็อกสกิลซ่อน "${HSK[d.hidden].name}"!</b> "${d.unlockLine || ''}"` } } });
      const rm = big ? RM.secret : RM.treasure;
      choiceModal(rm.title, `${rm.text}<br><br>${IC.gold()} ${g} · ${IC.cry()} ${c}${s ? ` · ${IC.soul()} ${s}` : ''}${extra}${unl}`, [{ label: 'เก็บของ', cls: 'pri', fn: () => { closeModal(); done() } }]); break;
    }
    case 'rest':
      choiceModal(RM.rest.title, RM.rest.text, [
        { label: `นอนพัก (ทั้งทีมฟื้น HP ${Math.round(C.dungeon.restHeal * 100)}%)`, cls: 'pri', fn: () => { healParty(C.dungeon.restHeal); closeModal(); done() } },
        { label: `เล่าเรื่องรอบกองไฟ (ความผูกพัน +1 ทั้งทีม, ฟื้น ${Math.round(C.dungeon.restTalkHeal * 100)}%)`, fn: () => { healParty(C.dungeon.restTalkHeal); partyAff(1); closeModal(); done() } }]); break;
    case 'merchant': merchantModal(done); break;
    case 'event': dungeonEvent(done); break;
    case 'stairs': stairsModal(); break;
  }
}
function merchantModal(done) {
  const p = C.merchant;
  choiceModal(EV.rooms.merchant.title, `${EV.rooms.merchant.text} (ใช้ทองที่มีอยู่ในเมือง ${S.gold})`, [
    { label: `${IC.potion()} ยา 1 ขวด — ${p.potion} ทอง`, dis: S.gold < p.potion, fn: () => { S.gold -= p.potion; S.inv.potions++; merchantModal(done) } },
    { label: `${IC.ration()} เสบียง ×3 — ${p.ration3} ทอง`, dis: S.gold < p.ration3, fn: () => { S.gold -= p.ration3; S.inv.rations += 3; merchantModal(done) } },
    { label: 'ไปต่อ', cls: 'pri', fn: () => { closeModal(); done() } }]);
}
function runEventFx(fx) {
  const r = S.run, front = r.party[0];
  (fx || []).forEach(f => {
    switch (f.t) {
      case 'loot': r.loot.gold += f.gold || 0; r.loot.crystals += f.crystals || 0; r.loot.souls += f.souls || 0; break;
      case 'aff': partyAff(f.v); break;
      case 'hurt': hurtParty(f.p); break;
      case 'heal': healParty(f.p); break;
      case 'hurtFront': { const mx = heroStats(front).maxHp; r.hp[front] = Math.max(1, r.hp[front] - Math.round(mx * f.p)); break }
      case 'rations': S.inv.rations = Math.max(0, S.inv.rations + f.v); break;
      case 'potions': S.inv.potions = Math.max(0, S.inv.potions + f.v); break;
      case 'feathers': S.inv.feathers = Math.max(0, S.inv.feathers + f.v); break;
    }
  });
}
function dungeonEvent(done) {
  const r = S.run, ctx = { front: HEROES[r.party[0]].name };
  const evs = EV.dungeon.filter(e => e.w > 0);
  let x = Math.random() * evs.reduce((a, e) => a + e.w, 0), ev = evs[0]; for (const e of evs) { x -= e.w; if (x < 0) { ev = e; break } }
  const res = t => choiceModal('', fmt(t, ctx), [{ label: 'ไปต่อ', cls: 'pri', fn: () => { closeModal(); done() } }]);
  const ok = c => { const w = c.if; if (!w) return true; if (w.hero && !r.party.includes(w.hero)) return 'hide'; if (w.potions && S.inv.potions < w.potions) return false; if (w.rations && S.inv.rations < w.rations) return false; return true };
  const choices = ev.choices.filter(c => ok(c) !== 'hide').map(c => ({ label: fmt(c.label, ctx), dis: !ok(c), fn: () => {
    if (c.chance != null) { const o = Math.random() < c.chance ? c.win : c.lose; runEventFx(o.fx); res(o.text) }
    else { runEventFx(c.fx); res(c.text) }
  } }));
  choiceModal(ev.title, fmt(ev.text, ctx), choices);
}
function stairsModal() {
  const r = S.run, f = r.floor, J = STORY.journals, bf = C.dungeon.bossFloor;
  const next = () => choiceModal(`บันไดสู่ชั้น ${f + 1}`, f + 1 === bf ? STORY.stairs.toBoss : STORY.stairs.normal, [
    { label: `⬇ ลงไปชั้น ${f + 1}`, cls: 'pri', fn: () => { closeModal(); r.floor++; S.deepest = Math.max(S.deepest, r.floor); r.pos = { l: -1, i: 0 }; r.map = genFloor(r.floor); save(); render() } },
    { label: '⬆ กลับเมือง (เก็บของทั้งหมด)', fn: () => { closeModal(); endRun(true, STORY.stairs.return) } }]);
  if (!S.journals.includes(f) && J[f]) { S.journals.push(f); r.loot.crystals += C.dungeon.journalCrystals; save(); storyModal([J[f].x + `\n\n(+${C.dungeon.journalCrystals} คริสตัล จากกระเป๋าที่ทิ้งไว้)`], next, '📜 ' + J[f].t) } else next();
}
function endRun(kept, msg) {
  const r = S.run;
  if (kept) { S.gold += r.loot.gold; S.crystals += r.loot.crystals; S.souls += r.loot.souls }
  r.party.forEach(id => { S.heroes[id].aff++; S.heroes[id].last = S.runCount });
  const sum = kept ? `ได้รับ: ${IC.gold()} ${r.loot.gold} · ${IC.cry()} ${r.loot.crystals} · ${IC.soul()} ${r.loot.souls}` : 'ของที่เก็บมาสูญหายทั้งหมด';
  S.run = null; B = null; S.lobbyEvent = rollLobbyEvent(); ui.tab = 'home'; save(); render();
  choiceModal('กลับสู่เมือง', `${msg}\n\n${sum}`, [{ label: 'ตกลง', cls: 'pri', fn: closeModal }]);
}
function killHero(id) { S.heroes[id].dead = true; S.run.party = S.run.party.filter(x => x !== id); delete S.run.hp[id]; S.recentDead.push(id) }

// ================= battle =================
let UID = 0;
function mkHeroU(id) { const st = heroStats(id), d = HEROES[id]; return { uid: ++UID, side: 'h', id, name: d.name, file: d.file, emoji: d.emoji, color: d.color, maxHp: st.maxHp, hp: S.run.hp[id], atk: st.atk, def: st.def, st: {}, cd: {}, sh: 0, alive: true, skills: [...d.skills, ...(d.hidden && S.heroes[id].hid ? [d.hidden] : [])].filter(k => HSK[k]) } }
function mkEnemy(type, f) { const d = ENEMIES[type], dc = C.dungeon, sc = d.boss ? 1 : 1 + dc.enemyScalePerFloor * (f - 1); return { uid: ++UID, side: 'e', type, name: d.name, file: d.file, emoji: d.emoji, color: d.color, maxHp: Math.round(d.hp * sc), hp: Math.round(d.hp * sc), atk: Math.round(d.atk * sc), def: Math.round(d.def * (1 + dc.enemyDefScalePerFloor * (f - 1))), st: {}, sh: 0, alive: true, turn: 0, intent: null, boss: !!d.boss } }
function encFor(table, f) { let k = f; while (k > 0 && !table[k]) k--; if (!table[k]) { const ks = dataKeys(table).map(Number).sort((a, b) => a - b); k = ks[0] } return table[k] }
function startBattle(kind) {
  const f = S.run.floor; let grp, ef = f;
  if (kind === 'boss') { grp = ENC.boss; ef = ENC.bossEnemyFloor || f } else if (kind === 'elite') grp = pick(encFor(ENC.elite, f)); else grp = pick(encFor(ENC.normal, f));
  grp = grp.filter(t => ENEMIES[t]);
  B = { kind, run: S.run, pos: { ...S.run.pos }, round: 1, phase: 'player', act: -1, sel: null, log: [], fell: false, fxq: [], busy: false,
    heroes: S.run.party.map(mkHeroU), enemies: grp.map(t => mkEnemy(t, ef)) };
  B.enemies.forEach(e => K(e.type));
  log(B, kind === 'boss' ? `${ENEMIES[grp[0]].name}ยกอาวุธขึ้น!` : kind === 'elite' ? 'ศัตรูที่แข็งแกร่งขวางทางอยู่!' : 'ศัตรูปรากฏตัว!');
  newRound();
}
const aliveE = b => b.enemies.filter(e => e.alive);
const aliveH = b => b.heroes.filter(h => h.alive);
function log(b, t) { if (!t) return; b.log.push(t); if (b.log.length > 30) b.log.shift() }
function addSt(t, k, turns, val) { const o = t.st[k]; if (o && typeof o === 'object') { o.t = Math.max(o.t, turns); if (val) o.v = Math.max(o.v, val) } else t.st[k] = { t: turns, v: val || 0 } }
function shield(b, t, amt) { amt = Math.round(amt); t.sh = (t.sh || 0) + amt; b.fxq.push([t.uid, '🛡+' + amt, 'sh']) }
function healU(b, t, amt) { if (!t.alive) return; amt = Math.round(amt); const real = Math.min(amt, t.maxHp - t.hp); t.hp += real; b.fxq.push([t.uid, '+' + real, 'heal']) }
function hit(b, u, t, mult) {
  if (!t || !t.alive) return 0;
  let d = u.atk * mult * (0.9 + Math.random() * .2);
  if (u.st.weak) d *= .75; if (t.st.vuln) d *= 1.3;
  if (u.side === 'h' && t.side === 'e' && knowLv(t.type) >= 2) d *= 1 + C.dungeon.knowWeakBonus;
  d = Math.max(1, Math.round(d - t.def));
  return dealDmg(b, t, d);
}
function dealDmg(b, t, d) {
  const ab = Math.min(t.sh || 0, d); t.sh = (t.sh || 0) - ab; const real = d - ab;
  t.hp = Math.max(0, t.hp - real);
  b.fxq.push([t.uid, real ? '-' + real : '🛡' + ab, real ? 'dmg' : 'sh']);
  if (t.hp <= 0 && t.alive) kill(b, t);
  return real;
}
function kill(b, t) {
  t.alive = false; t.sh = 0;
  if (t.side === 'e') { K(t.type).kills++; log(b, `${t.name} ถูกปราบ`) } else { b.fell = true; log(b, `💔 ${t.name} ล้มลง!`) }
}
// --- data-driven skill effects ---
function fxTargets(b, u, t, skTgt, to) {
  to = to || (skTgt === 'all' ? 'enemies' : skTgt === 'self' ? 'self' : 'target');
  const mine = u.side === 'h' ? aliveH(b) : aliveE(b), theirs = u.side === 'h' ? aliveE(b) : aliveH(b);
  if (to === 'self') return u.alive ? [u] : [];
  if (to === 'team') return mine; if (to === 'others') return mine.filter(x => x !== u); if (to === 'enemies') return theirs;
  return t && t.alive ? [t] : [];
}
function runFx(b, u, t, fx, skTgt, ctx) {
  ctx = ctx || { dealt: 0 };
  for (const f of fx || []) {
    const ts = fxTargets(b, u, t, skTgt, f.to);
    switch (f.t) {
      case 'dmg': ts.forEach(x => { ctx.dealt += hit(b, u, x, f.m) }); break;
      case 'heal': ts.forEach(x => healU(b, x, f.p ? x.maxHp * f.p : u.atk * f.m)); break;
      case 'shield': ts.forEach(x => shield(b, x, x.maxHp * f.p)); break;
      case 'st': ts.forEach(x => { if (x.alive) addSt(x, f.s, f.turns, f.v ? Math.max(2, Math.round(u.atk * f.v)) : 0) }); break;
      case 'stun': ts.forEach(x => { if (x.alive) x.st.stun = 1 }); break;
      case 'cleanse': ts.forEach(x => { delete x.st.poison; delete x.st.burn }); break;
      case 'lifesteal': if (ctx.dealt) healU(b, u, ctx.dealt * f.p); break;
      case 'steal': { const g = RR(f.gold), c = RR(f.crystals); S.run.loot.gold += g; S.run.loot.crystals += c; log(b, `${u.name} ฉกได้ ${g} ทอง ${c} คริสตัล`); break }
    }
  }
  return ctx.dealt;
}
function tauntHero(b) { let best = null; aliveH(b).forEach(h => { if (h.st.taunt && (!best || h.st.taunt.t > best.st.taunt.t)) best = h }); return best }
function pickTarget(b, e) {
  const hs = aliveH(b); if (!hs.length) return -1; const d = ENEMIES[e.type]; let t;
  if (d.tg === 'front') { const fr = hs.slice(0, 2); t = Math.random() < .7 ? pick(fr) : pick(hs) }
  else if (d.tg === 'low') t = hs.reduce((a, h) => h.hp / h.maxHp < a.hp / a.maxHp ? h : a);
  else t = pick(hs);
  return b.heroes.indexOf(t);
}
function aiKey(b, e) {
  const ai = ENEMIES[e.type].ai || {};
  if (ai.special === 'boss') {
    if (!e.p2 && e.hp <= e.maxHp * (ai.phase2At || .5)) { e.p2 = true; e.turn = 0; log(b, ai.phase2Log) }
    const seq = e.p2 ? ai.p2 : ai.p1; return seq[e.turn % seq.length];
  }
  if (ai.special === 'cult') {
    const hurt = aliveE(b).filter(x => x !== e && x.hp < x.maxHp * (ai.healBelow || .55));
    if (hurt.length && e.turn % 2 === 0) { e._ally = b.enemies.indexOf(hurt[0]); return ai.heal }
  }
  return ai.seq[e.turn % ai.seq.length];
}
function decide(b, e) {
  let k = aiKey(b, e), sk = ESK[k];
  if (sk && sk.kind === 'summon' && aliveE(b).length >= (sk.maxEnemies || 4) - 1) { k = sk.fallback; sk = ESK[k] }
  if (!sk) { k = Object.keys(ESK).find(x => ESK[x].kind === 'single'); sk = ESK[k] }
  const it = { k };
  if (sk.kind === 'single') it.t = pickTarget(b, e);
  if (sk.kind === 'ally') it.t = e._ally;
  return it;
}
function newRound() {
  const b = B; b.phase = 'player'; b.busy = false; b.sel = null;
  aliveE(b).forEach(e => { if (e.st.stun) { delete e.st.stun; e.intent = null; log(b, `${e.name} มึนงง`) } else { e.intent = decide(b, e); e.turn++ } });
  b.act = nextActor(-1);
  if (b.act < 0) { render(); setTimeout(enemyPhase, 600) } else render();
}
function nextActor(from) {
  const b = B; for (let i = from + 1; i < b.heroes.length; i++) { const h = b.heroes[i]; if (!h.alive) continue; if (h.st.stun) { delete h.st.stun; log(b, `💫 ${h.name} มึนงง ข้ามเทิร์น`); continue } return i } return -1;
}
function chooseSkill(k) {
  const b = B; if (!b || b.phase !== 'player' || b.busy) return; const u = b.heroes[b.act];
  if (k === 'potion') { if (S.inv.potions < 1) return; b.sel = 'potion'; render(); return }
  const s = HSK[k]; if (!s || u.cd[k]) return;
  if (s.tgt === 'enemy' || s.tgt === 'ally') { b.sel = k; render(); return }
  doAct(u, k, u);
}
function chooseTarget(side, i) {
  const b = B; if (!b || !b.sel || b.busy) return; const u = b.heroes[b.act], k = b.sel;
  const need = k === 'potion' ? 'ally' : HSK[k].tgt;
  if (need === 'enemy' && side !== 'e') return; if (need === 'ally' && side !== 'h') return;
  const t = side === 'e' ? b.enemies[i] : b.heroes[i]; if (!t || !t.alive) return;
  b.sel = null; doAct(u, k, t);
}
function doAct(u, k, t) {
  const b = B;
  if (k === 'potion') { S.inv.potions--; log(b, `${u.name} ใช้ยากับ ${t.name}`); healU(b, t, t.maxHp * C.dungeon.potionHeal) }
  else { const s = HSK[k]; log(b, `${u.name} ใช้ ${s.name}${t && t !== u ? ' → ' + t.name : ''}`); runFx(b, u, t, s.fx, s.tgt); if (s.cd) u.cd[k] = s.cd + 1 }
  if (checkEnd()) return;
  b.act = nextActor(b.act);
  if (b.act < 0) enemyPhase(); else render();
}
async function enemyPhase() {
  const b = B; if (!b) return; b.phase = 'enemy'; b.busy = true; b.sel = null;
  b.enemies.forEach(e => { if (e.alive) e.sh = 0 });
  render();
  for (const e of b.enemies.slice()) {
    if (!e.alive || !e.intent) continue;
    await sleep(600); if (B !== b) return;
    execIntent(b, e); render();
    if (checkEnd()) return;
  }
  await sleep(450); if (B !== b) return;
  endRound();
}
function execIntent(b, e) {
  const sk = ESK[e.intent.k]; if (!sk) return;
  if (sk.reveal) K(e.type).rev = true;
  const single = idx => { let t = tauntHero(b) || b.heroes[idx]; if (!t || !t.alive) t = pick(aliveH(b)); return t };
  if (sk.kind === 'single') { const t = single(e.intent.t); if (!t) return; log(b, `${e.name}: ${sk.name} → ${t.name}`); if (sk.mult) hit(b, e, t, sk.mult); runFx(b, e, t, sk.fx, 'enemy') }
  else if (sk.kind === 'rand2') { log(b, `${e.name}: ${sk.name}`); for (let i = 0; i < 2; i++) { const hs = aliveH(b); if (!hs.length) break; const t = tauntHero(b) || pick(hs); hit(b, e, t, sk.mult); runFx(b, e, t, sk.fx, 'enemy') } }
  else if (sk.kind === 'allh') { log(b, `${e.name}: ${sk.name}!`); if (sk.mult) aliveH(b).forEach(t => hit(b, e, t, sk.mult)); runFx(b, e, null, sk.fx, 'all') }
  else if (sk.kind === 'self') { log(b, `${e.name}: ${sk.name}`); runFx(b, e, e, sk.fx, 'self') }
  else if (sk.kind === 'ally') { const t = b.enemies[e.intent.t]; log(b, `${e.name}: ${sk.name}`); runFx(b, e, t && t.alive ? t : e, sk.fx, 'ally') }
  else if (sk.kind === 'summon') { log(b, `${e.name}: ${sk.name}!`); const n = Math.min(sk.count || 1, (sk.maxEnemies || 4) - aliveE(b).length); for (let i = 0; i < n; i++) { if (!ENEMIES[sk.unit]) break; const s = mkEnemy(sk.unit, ENC.bossEnemyFloor || S.run.floor); s.sum = true; K(sk.unit); b.enemies.push(s) } }
  else if (sk.kind === 'charge') log(b, sk.log || `${e.name} กำลังรวบรวมพลัง...`);
}
function endRound() {
  const b = B;
  [...b.heroes, ...b.enemies].forEach(u => {
    if (!u.alive) return;
    ['poison', 'burn'].forEach(k => { if (u.st[k] && u.alive) { const v = u.st[k].v; u.hp = Math.max(0, u.hp - v); b.fxq.push([u.uid, (k === 'poison' ? '☠' : '🔥') + v, 'dmg']); if (u.hp <= 0) kill(b, u) } });
    for (const k of ['weak', 'vuln', 'taunt', 'poison', 'burn']) { if (u.st[k]) { u.st[k].t--; if (u.st[k].t <= 0) delete u.st[k] } }
    if (u.side === 'h') { u.sh = 0; for (const k in u.cd) { u.cd[k]--; if (u.cd[k] <= 0) delete u.cd[k] } }
  });
  b.round++;
  if (checkEnd()) return;
  newRound();
}
function checkEnd() {
  const b = B; if (!b || b.phase === 'end') return true;
  if (!aliveE(b).length) { b.phase = 'end'; setTimeout(() => { if (B === b) win() }, 500); render(); return true }
  if (!aliveH(b).length) { b.phase = 'end'; setTimeout(() => { if (B === b) lose() }, 700); render(); return true }
  return false;
}
function win() {
  const b = B; if (!b || b.run !== S.run) { B = null; return } const r = S.run, f = r.floor, RW = C.rewards;
  new Set(b.enemies.map(e => e.type)).forEach(t => K(t).seen++);
  let g, c, s = 0;
  if (b.kind === 'boss') { g = RW.boss.gold; c = RW.boss.crystals; s = RW.boss.souls } else { const rw = RW[b.kind]; g = RR(rw.gold) * f; c = RR(rw.crystals); s = Math.random() < rw.soulChance ? 1 : 0 }
  r.loot.gold += g; r.loot.crystals += c; r.loot.souls += s;
  const lines = [];
  b.heroes.forEach(h => { if (h.alive) r.hp[h.id] = h.hp; else if (Math.random() < C.death.surviveChance) { r.hp[h.id] = 1; lines.push(`😮‍💨 ${h.name} รอดมาได้อย่างหวุดหวิด (HP 1)`) } else { killHero(h.id); lines.push(`🪦 ${h.name} จากไปแล้ว...`) } });
  if (b.fell) b.heroes.forEach(h => { const d = HEROES[h.id], sh = S.heroes[h.id]; if (h.alive && d.hidden && !sh.hid && d.unlock && d.unlock.type === 'allyFellSurvive') { sh.hid = true; lines.push(`✦ <b>${d.name}ปลดล็อกสกิลซ่อน "${HSK[d.hidden].name}"!</b> "${d.unlockLine || ''}"`) } });
  const boss = b.kind === 'boss'; B = null;
  if (boss) r.party.forEach(id => S.heroes[id].aff++);
  save(); render();
  choiceModal(boss ? `${ENEMIES[b.enemies[0].type].name} ล้มลงแล้ว!` : 'ชนะ!', `${IC.gold()} ${g} · ${IC.cry()} ${c}${s ? ` · ${IC.soul()} ${s}` : ''}${lines.length ? '<br><br>' + lines.join('<br>') : ''}`, [{ label: 'ไปต่อ', cls: 'pri', fn: () => { closeModal(); const row = r.map.layers[b.pos.l]; if (row && row[b.pos.i]) row[b.pos.i].done = true; save(); if (boss) bossVictory(); else render() } }]);
}
function bossVictory() {
  const J = STORY.journals, last = C.dungeon.bossFloor;
  if (!S.journals.includes(last) && J[last]) S.journals.push(last);
  S.deepest = last; save();
  const pages = [STORY.boss.victory]; if (J[last]) pages.push('📜 ' + J[last].t + '\n\n' + J[last].x); pages.push(STORY.boss.end);
  storyModal(pages, () => endRun(true, STORY.boss.returnText), 'ชัยชนะ');
}
function lose() {
  const b = B; if (!b || b.run !== S.run) { B = null; return }
  new Set(b.enemies.map(e => e.type)).forEach(t => K(t).seen++);
  const lines = [];
  b.heroes.forEach(h => { if (Math.random() < C.death.surviveChance) lines.push(`😮‍💨 ${h.name} ถูกหน่วยกู้ศพลากกลับขึ้นมาได้ทัน`); else { killHero(h.id); lines.push(`🪦 ${h.name} จากไปแล้ว...`) } });
  B = null; save();
  storyModal([`ทีมล้มลงทั้งหมด...\n\n${lines.join('\n')}\n\nสิ่งที่ได้เรียนรู้จากศัตรูยังคงอยู่ในบันทึก`], () => endRun(false, STORY.lose), 'พ่ายแพ้');
}

// ----- battle view -----
function stHtml(u) {
  const a = []; if (u.sh) a.push(`🛡${u.sh}`); const m = { taunt: '🎯', weak: '🔻', vuln: '💢', poison: '☠', burn: '🔥' };
  for (const k in m) if (u.st[k]) a.push(`${m[k]}${u.st[k].t}`); if (u.st.stun) a.push('💫'); return a.join(' ');
}
function intentHtml(b, e) {
  if (!e.alive) return '<div class="intent" style="visibility:hidden">-</div>';
  if (!e.intent) return '<div class="intent">💫 มึนงง</div>';
  const sk = ESK[e.intent.k], kl = e.boss ? (K(e.type).rev ? 1 : 0) : knowLv(e.type);
  let tg = '';
  if (sk.kind === 'single') { const t = tauntHero(b) || b.heroes[e.intent.t]; tg = t ? `→ ${t.name}` : '' }
  if (sk.kind === 'allh') tg = '→ ทั้งทีม'; if (sk.kind === 'rand2') tg = '→ สุ่ม ×2';
  if (sk.kind === 'charge') return `<div class="intent ch">${sk.icon} ${sk.name}<span>${kl ? sk.warn || '' : '???'}</span></div>`;
  let dmg = '';
  if (sk.mult) { if (kl >= 1) dmg = ` ~${Math.round(e.atk * sk.mult * (e.st.weak ? .75 : 1))}`; else dmg = sk.secret ? ' ???' : ' ?' }
  return `<div class="intent">${sk.icon} ${sk.name}${dmg}<span class="mut" style="font-size:10px">${tg}${sk.note && kl ? ' ' + sk.note : ''}</span></div>`;
}
function unitHtml(b, u, i) {
  let isTg = false;
  if (b.sel && u.alive) { const need = b.sel === 'potion' ? 'ally' : HSK[b.sel].tgt; isTg = (need === 'ally' && u.side === 'h') || (need === 'enemy' && u.side === 'e') }
  const act = u.side === 'h' && b.phase === 'player' && b.heroes[b.act] === u;
  const size = u.boss ? 92 : 60;
  return `<div class="unit ${u.alive ? '' : 'down'} ${act ? 'act' : ''} ${isTg ? 'tg' : ''}" data-uid="${u.uid}" ${isTg ? `onclick="G.tgt('${u.side}',${i})"` : ''}>
   ${u.side === 'e' ? intentHtml(b, u) : `<div class="pos">${i < 2 ? 'หน้า' : 'หลัง'}</div>`}
   <div style="display:flex;justify-content:center">${spr(u.file, u.emoji, u.color, size)}</div>
   <div class="nm">${u.name}</div><div class="hpb ${u.side === 'e' ? 'e' : ''}"><i style="width:${u.hp / u.maxHp * 100}%"></i>${u.sh ? `<s style="width:${Math.min(100, u.sh / u.maxHp * 100)}%"></s>` : ''}</div>
   <div class="hpt">${u.hp}/${u.maxHp}</div><div class="sts">${stHtml(u)}</div></div>`;
}
function battleScreen() {
  const b = B, r = S.run, u = b.phase === 'player' && b.act >= 0 ? b.heroes[b.act] : null;
  let acts = '';
  if (b.phase === 'enemy') acts = '<div class="mut" style="text-align:center;padding:14px">ศัตรูกำลังเคลื่อนไหว...</div>';
  else if (b.phase === 'end') acts = '<div class="mut" style="text-align:center;padding:14px">...</div>';
  else if (u) {
    if (b.sel) { const nm = b.sel === 'potion' ? 'ยาฟื้นฟู' : HSK[b.sel].name; acts = `<div class="row" style="justify-content:space-between"><span>เลือกเป้าหมายสำหรับ <b>${nm}</b></span><button onclick="G.cancel()">ยกเลิก</button></div>` }
    else acts = `<div style="margin-bottom:6px"><b style="color:var(--lamp2)">${u.name}</b> <span class="mut">ถึงตาแล้ว</span></div><div class="grid">${[...u.skills, 'defend'].filter(k => HSK[k]).map(k => { const s = HSK[k], hid = HEROES[u.id].hidden === k; return `<button onclick="G.sk('${k}')" ${u.cd[k] ? 'disabled' : ''} style="${hid ? 'border-color:var(--pur)' : ''}">${hid ? '✦ ' : ''}${s.name}${u.cd[k] ? ` (${u.cd[k]})` : ''}<small>${s.desc}</small></button>` }).join('')}<button onclick="G.sk('potion')" ${S.inv.potions ? '' : 'disabled'}>${IC.potion()} ยา (${S.inv.potions})<small>ฟื้น HP ${Math.round(C.dungeon.potionHeal * 100)}%</small></button></div>`;
  }
  return `<div class="bt" style="${b.kind === 'boss' ? BG.boss() : BG.dun()}">
  <div class="bar"><b class="pix" style="color:var(--lamp2)">ชั้น ${r.floor}</b><span>เทิร์น ${b.round}</span><span class="mut">${b.kind === 'boss' ? 'บอส' : b.kind === 'elite' ? 'ศัตรูเก่ง' : ''}</span></div>
  <div class="side">${b.enemies.map((e, i) => e.alive || !e.sum ? unitHtml(b, e, i) : '').join('')}</div>
  <div class="mid">${b.phase === 'player' ? 'วางแผนจากท่าที่ศัตรูประกาศไว้ด้านบน' : ''}</div>
  <div class="side">${b.heroes.map((h, i) => unitHtml(b, h, i)).join('')}</div>
  <div class="log">${b.log.slice(-4).map(l => `<div>${l}</div>`).join('')}</div>
  <div class="acts">${acts}</div></div>`;
}
function flushFx() {
  const b = B; if (!b) return; const q = b.fxq.splice(0);
  q.forEach(([uid, t, c], k) => { const el = document.querySelector(`[data-uid="${uid}"]`); if (!el) return; const d = document.createElement('div'); d.className = 'float ' + c; d.textContent = t; d.style.animationDelay = (k % 3) * .08 + 's'; el.appendChild(d); setTimeout(() => d.remove(), 1200) });
}

// ================= map potion / retreat =================
function mapPotion() {
  if (!S.inv.potions) return;
  choiceModal('ใช้ยากับใคร?', '', [...S.run.party.map(id => { const mx = heroStats(id).maxHp; return { label: `${HEROES[id].name} (${S.run.hp[id]}/${mx})`, dis: S.run.hp[id] >= mx, fn: () => { S.inv.potions--; S.run.hp[id] = Math.min(mx, S.run.hp[id] + Math.round(mx * C.dungeon.potionHeal)); save(); closeModal(); render() } } }), { label: 'ยกเลิก', fn: closeModal }]);
}
function retreat() {
  const k = C.dungeon.retreatKeep;
  choiceModal('ถอยกลับเมือง?', `การถอยกลางทางต้องทิ้งของหนักไว้\nจะได้ของที่เก็บมาแค่ ${Math.round(k * 100)}%`, [
    { label: 'ถอยกลับ', cls: 'dan', fn: () => { closeModal(); const l = S.run.loot; l.gold = Math.floor(l.gold * k); l.crystals = Math.floor(l.crystals * k); l.souls = Math.floor(l.souls * k); endRun(true, 'ทีมถอยกลับขึ้นมาอย่างเร่งรีบ') } },
    { label: 'สำรวจต่อ', cls: 'pri', fn: closeModal }]);
}

// ================= global handlers =================
window.G = {
  cb: i => { const f = _cb[i]; f && f() },
  close: closeModal,
  start: () => { storyModal(STORY.intro, () => { S.started = true; C.start.heroes.filter(id => HEROES[id]).forEach(addHero); save(); render(); toast(STORY.afterIntro) }, '') },
  tab: t => { ui.tab = t; render() },
  jtab: t => { ui.jtab = t; render() },
  ev: c => resolveEvent(c),
  pull: n => doPull(n),
  hero: id => heroDetail(id),
  revive: (id, h) => revive(id, h),
  buy: k => buy(k),
  prep: () => { ui.prep = S.lastParty.filter(alive).slice(0, 4); render() },
  prepX: () => { ui.prep = null; render() },
  psel: id => { const p = ui.prep; const i = p.indexOf(id); if (i >= 0) p.splice(i, 1); else if (p.length < 4) p.push(id); render() },
  go: () => startRun(),
  enter: (l, i) => enterNode(l, i),
  mapPotion, retreat,
  sk: k => chooseSkill(k),
  tgt: (s, i) => chooseTarget(s, i),
  cancel: () => { if (B) { B.sel = null; render() } },
  reset: () => choiceModal('ลบเซฟ?', 'ข้อมูลทั้งหมดจะหายไปและเริ่มใหม่ตั้งแต่ต้น', [{ label: 'ลบและเริ่มใหม่', cls: 'dan', fn: () => { S = fresh(); B = null; ui.tab = 'home'; ui.prep = null; save(); closeModal(); render() } }, { label: 'ยกเลิก', fn: closeModal }])
};

// ================= boot =================
async function boot() {
  try {
    const r = await loadGameData();
    D = r.D; MODDED = r.modded;
  } catch (e) {
    document.getElementById('app').innerHTML = `<div class="loading">โหลดข้อมูลเกมไม่ได้<br><span class="mut">${e.message}<br>ต้องเปิดผ่านเว็บ (เช่น GitHub Pages หรือ artifact) ไม่ใช่ดับเบิลคลิกไฟล์</span></div>`;
    return;
  }
  C = D.config; HEROES = D.heroes; HSK = D.skills.hero; ESK = D.skills.enemy; ENEMIES = D.enemies; ENC = D.encounters; EV = D.events; STORY = D.story;
  HERO_IDS = dataKeys(HEROES);
  S = load() || fresh();
  if (S.run && (!S.run.party.length || S.run.party.some(id => !HEROES[id]))) S.run = null;
  render();
}
boot();
