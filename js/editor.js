// Deepfall content editor. Edits a draft copy of data/*.json saved in this browser (shared with the game).
"use strict";
const TAB_LABEL = { heroes: 'วีรบุรุษ', skills: 'สกิล', enemies: 'ศัตรู', encounters: 'กลุ่มศัตรู', events: 'เหตุการณ์', story: 'เนื้อเรื่อง', config: 'ตั้งค่า', images: 'ภาพ', export: 'ส่งออก' };
const TABS = ['heroes', 'skills', 'enemies', 'encounters', 'events', 'story', 'config', 'images', 'export'];
let BASE, DATA, MOD, tab = 'heroes';
const clone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const P = path => encodeURIComponent(JSON.stringify(path));
const unP = s => JSON.parse(decodeURIComponent(s));
const isPrim = v => v === null || ['string', 'number', 'boolean'].includes(typeof v);
function getAt(o, path) { return path.reduce((a, k) => a == null ? a : a[k], o) }
function setAt(o, path, v) { const last = path[path.length - 1]; getAt(o, path.slice(0, -1))[last] = v }
const changed = f => JSON.stringify(DATA[f]) !== JSON.stringify(BASE[f]);

function saveDraft(msg) {
  DATA_FILES.forEach(f => { if (changed(f)) MOD.files[f] = DATA[f]; else delete MOD.files[f] });
  const ok = writeMod(MOD);
  status(ok ? (msg || 'บันทึกฉบับร่างแล้ว ✔') : '⚠️ บันทึกไม่ได้ (พื้นที่ในเบราว์เซอร์เต็ม)');
  document.querySelectorAll('.etabs button').forEach(b => b.classList.toggle('chg', DATA_FILES.includes(b.dataset.t) && changed(b.dataset.t)));
}
function status(t) { const el = document.getElementById('st'); if (el) { el.textContent = t; clearTimeout(status._t); status._t = setTimeout(() => { el.textContent = '' }, 2500) } }

// ---------- dialogs (alert/confirm/prompt are blocked in the artifact frame) ----------
function dlg(html) { document.getElementById('dlg').innerHTML = `<div class="dlg"><div class="mbox">${html}</div></div>` }
function closeDlg() { document.getElementById('dlg').innerHTML = '' }
function confirmDlg(text, yes) { window._yes = () => { closeDlg(); yes() }; dlg(`<p>${text}</p><div class="ch"><button class="dan" onclick="_yes()">ยืนยัน</button><button onclick="closeDlg()">ยกเลิก</button></div>`) }
function promptDlg(text, def, ok) { window._ok = () => { const v = document.getElementById('pv').value.trim(); closeDlg(); ok(v) }; dlg(`<p>${text}</p><input id="pv" value="${esc(def)}"><div class="ch"><button class="pri" onclick="_ok()">ตกลง</button><button onclick="closeDlg()">ยกเลิก</button></div>`); setTimeout(() => document.getElementById('pv').focus(), 30) }

// ---------- generic field rendering ----------
function helpBox(h) {
  if (!h) return '';
  const t = typeof h === 'string' ? h : Object.entries(h).map(([k, v]) => `${k}: ${v}`).join('\n');
  return `<div class="help">${esc(t)}</div>`;
}
function primInput(path, v) {
  const p = P(path);
  if (typeof v === 'number') return `<input type="number" step="any" data-p="${p}" data-t="n" value="${v}">`;
  if (typeof v === 'boolean') return `<input type="checkbox" data-p="${p}" data-t="b" ${v ? 'checked' : ''}>`;
  const s = v == null ? '' : String(v);
  if (s.length > 48 || s.includes('\n')) return `<textarea data-p="${p}" data-t="s" rows="${Math.min(8, Math.max(2, Math.ceil(s.length / 45) + (s.match(/\n/g) || []).length))}">${esc(s)}</textarea>`;
  return `<input data-p="${p}" data-t="s" value="${esc(s)}">`;
}
function listInput(path, arr) {
  const nums = arr.length && arr.every(x => typeof x === 'number');
  return `<input data-p="${P(path)}" data-t="${nums ? 'an' : 'as'}" value="${esc(arr.join(', '))}" placeholder="คั่นด้วยจุลภาค">`;
}
function valueHTML(path, v, depth) {
  if (isPrim(v)) return primInput(path, v);
  if (Array.isArray(v)) {
    if (v.every(isPrim)) return listInput(path, v);
    const items = v.map((x, i) => `<div class="arr-item"><div class="gh" style="display:flex;justify-content:space-between"><span class="mut">#${i + 1}</span><button class="sm" onclick="E.delIdx('${P(path)}',${i})">ลบ</button></div>${valueHTML([...path, i], x, depth + 1)}</div>`).join('');
    return `<div class="grp">${items}<button class="sm" onclick="E.addIdx('${P(path)}')">+ เพิ่ม</button></div>`;
  }
  return `<div class="grp">${Object.entries(v).map(([k, x]) => k === '_help' || k === '_note' ? helpBox(x) : fieldHTML([...path, k], k, x, depth + 1)).join('')}</div>`;
}
function fieldHTML(path, key, v, depth) {
  if (isPrim(v) || (Array.isArray(v) && v.every(isPrim))) return `<div class="f"><label>${esc(key)}</label>${valueHTML(path, v, depth)}</div>`;
  return `<div style="margin:6px 0"><div class="gh" style="font-size:12px;color:var(--lamp2)">${esc(key)}</div>${valueHTML(path, v, depth)}</div>`;
}
function thumb(file, emoji, color) {
  const src = MOD.images && MOD.images[file] ? MOD.images[file] : 'assets/' + file + '.png';
  return `<div class="spr" style="--c:${color || '#333'};width:36px;height:36px"><img src="${src}" alt="" onload="this.parentNode.classList.add('has')" onerror="this.remove()"><span style="font-size:18px">${emoji || '?'}</span></div>`;
}
function dictItems(path, obj, titleFn, canAdd = true) {
  const keys = Object.keys(obj).filter(k => k[0] !== '_');
  return keys.map(k => { const v = obj[k]; const t = titleFn(k, v);
    return `<details class="item" data-k="${esc(path.concat(k).join('/'))}"><summary>${t}</summary><div class="ibody">
      <div class="f"><label>id</label><div class="row"><code>${esc(k)}</code><button class="sm" onclick="E.rename('${P(path)}','${esc(k)}')">เปลี่ยน id</button><button class="sm" onclick="E.dupKey('${P(path)}','${esc(k)}')">คัดลอกเป็นตัวใหม่</button><button class="sm dan" onclick="E.delKey('${P(path)}','${esc(k)}')">ลบ</button></div></div>
      ${Object.entries(v).map(([fk, fv]) => fieldHTML([...path, k, fk], fk, fv, 1)).join('')}
    </div></details>` }).join('') + (canAdd ? `<button onclick="E.addKey('${P(path)}')">+ เพิ่มใหม่ (คัดลอกจากตัวแรก)</button>` : '');
}

// ---------- validation ----------
function validate() {
  const w = [], H = DATA.heroes, SH = DATA.skills.hero, SE = DATA.skills.enemy, EN = DATA.enemies, ENC = DATA.encounters;
  dataKeys(H).forEach(id => { const h = H[id];
    (h.skills || []).forEach(s => { if (!SH[s]) w.push(`วีรบุรุษ ${id}: ไม่มีสกิล "${s}" ในหน้าสกิล`) });
    if (h.hidden && !SH[h.hidden]) w.push(`วีรบุรุษ ${id}: ไม่มีสกิลซ่อน "${h.hidden}"`);
    if (!(h.star >= 1 && h.star <= 5)) w.push(`วีรบุรุษ ${id}: star ต้องเป็น 1–5`);
  });
  [1, 2, 3, 4, 5].forEach(s => { if ((DATA.config.gacha.rates[s] || 0) > 0 && !dataKeys(H).some(id => H[id].star === s)) w.push(`กาชา: มีอัตราออก ${s}★ แต่ไม่มีวีรบุรุษ ${s}★`) });
  dataKeys(EN).forEach(id => { const a = EN[id].ai || {};
    [...(a.seq || []), ...(a.p1 || []), ...(a.p2 || []), ...(a.heal ? [a.heal] : [])].forEach(s => { if (!SE[s]) w.push(`ศัตรู ${id}: ไม่มีท่า "${s}" ในหน้าสกิล (enemy)`) });
    if (!a.seq && !a.p1) w.push(`ศัตรู ${id}: ai ต้องมี seq`);
  });
  dataKeys(SE).forEach(k => { const s = SE[k]; if (s.kind === 'summon' && !EN[s.unit]) w.push(`ท่า ${k}: ไม่มีศัตรู "${s.unit}" ให้เรียก`); if (s.fallback && !SE[s.fallback]) w.push(`ท่า ${k}: fallback "${s.fallback}" ไม่มีอยู่`) });
  const chk = (g, where) => g.forEach(id => { if (!EN[id]) w.push(`${where}: ไม่มีศัตรู "${id}"`) });
  ['normal', 'elite'].forEach(t => dataKeys(ENC[t]).forEach(f => (ENC[t][f] || []).forEach(g => chk(g, `กลุ่มศัตรู ${t} ชั้น ${f}`))));
  chk(ENC.boss || [], 'กลุ่มศัตรูบอส');
  (DATA.config.start.heroes || []).forEach(id => { if (!H[id]) w.push(`ตั้งค่า start.heroes: ไม่มีวีรบุรุษ "${id}"`) });
  return w;
}

// ---------- tabs ----------
function heroesTab() {
  const H = DATA.heroes;
  return dictItems(['heroes'], H, (k, v) => `${thumb(v.file, v.emoji, v.color)}<b>${esc(v.name)}</b><span class="stars">${'★'.repeat(v.star || 0)}</span><span class="mut">${esc(v.role || '')} · HP ${v.hp} ATK ${v.atk} DEF ${v.def}</span>`);
}
function enemiesTab() {
  return helpBox(DATA.enemies._help) + dictItems(['enemies'], DATA.enemies, (k, v) => `${thumb(v.file, v.emoji, v.color)}<b>${esc(v.name)}</b><span class="mut">HP ${v.hp} ATK ${v.atk} DEF ${v.def}${v.boss ? ' · บอส' : ''}</span>`);
}
function skillsTab() {
  const S = DATA.skills;
  return helpBox(S._help) + `<h3 style="color:var(--lamp2)">สกิลวีรบุรุษ</h3>` + dictItems(['skills', 'hero'], S.hero, (k, v) => `<b>${esc(v.name)}</b><span class="mut">${esc(k)} · ${esc(v.desc || '')}</span>`) +
    `<h3 style="color:var(--lamp2);margin-top:18px">ท่าศัตรู</h3>` + dictItems(['skills', 'enemy'], S.enemy, (k, v) => `<span>${v.icon || ''}</span><b>${esc(v.name)}</b><span class="mut">${esc(k)} · ${esc(v.kind)}${v.mult ? ' ×' + v.mult : ''}</span>`);
}
function eventsTab() {
  const ev = DATA.events;
  const dun = ev.dungeon.map((e, i) => `<details class="item"><summary><b>${esc(e.title)}</b><span class="mut">โอกาสเจอ ${e.w}</span></summary><div class="ibody">${Object.entries(e).map(([k, v]) => fieldHTML(['events', 'dungeon', i, k], k, v, 1)).join('')}<button class="sm dan" onclick="E.delIdx('${P(['events', 'dungeon'])}',${i})">ลบเหตุการณ์นี้</button></div></details>`).join('');
  return helpBox(ev._help) + `<h3 style="color:var(--lamp2)">เหตุการณ์ในดันเจี้ยน</h3>${dun}<button onclick="E.addIdx('${P(['events', 'dungeon'])}')">+ เพิ่มเหตุการณ์ (คัดลอกอันสุดท้าย)</button>
  <h3 style="color:var(--lamp2);margin-top:18px">ข้อความห้องพิเศษ</h3>${valueHTML(['events', 'rooms'], ev.rooms, 0)}
  <h3 style="color:var(--lamp2);margin-top:18px">เหตุการณ์ในเมือง</h3>${valueHTML(['events', 'lobby'], ev.lobby, 0)}`;
}
function genericTab(f) { return valueHTML([f], DATA[f], 0) }
function imagesTab() {
  const rows = [];
  dataKeys(DATA.heroes).forEach(id => { const h = DATA.heroes[id]; rows.push([h.file, `${h.name} (ตัวเต็ม)`, '64×64']); rows.push([h.file + '_portrait', `${h.name} (พอร์เทรต)`, '96×96']); if (h.anim && h.anim.idle) rows.push([h.anim.idle.file, `${h.name} (อนิเมชันยืน ${h.anim.idle.frames} เฟรม)`, 'แถบแนวนอน']) });
  dataKeys(DATA.enemies).forEach(id => { const e = DATA.enemies[id]; rows.push([e.file, e.name, e.boss ? '128×128' : '64×64']); if (e.anim && e.anim.idle) rows.push([e.anim.idle.file, `${e.name} (อนิเมชัน)`, 'แถบแนวนอน']) });
  [['bg_title', 'หน้าเริ่มเกม'], ['story_intro', 'ฉากเปิดเรื่อง'], ['bg_lobby', 'ล็อบบี้'], ['bg_dungeon_1', 'ดันเจี้ยน ชั้น 1–4'], ['bg_boss_1', 'ห้องบอส']].forEach(x => rows.push([x[0], x[1], '320×180']));
  [['icon_crystal', 'คริสตัล'], ['icon_gold', 'ทอง'], ['icon_soul', 'เศษวิญญาณ'], ['icon_ration', 'เสบียง'], ['icon_potion', 'ยา'], ['icon_feather', 'ขนนกฟีนิกซ์'],
   ['room_battle', 'ห้องต่อสู้'], ['room_elite', 'ห้องศัตรูเก่ง'], ['room_treasure', 'ห้องสมบัติ'], ['room_rest', 'ห้องพัก'], ['room_event', 'ห้องเหตุการณ์'], ['room_merchant', 'ห้องพ่อค้า'], ['room_stairs', 'บันได'], ['room_boss', 'ห้องบอส']].forEach(x => rows.push([x[0], x[1], '32×32']));
  const seen = new Set();
  return `<div class="help">ลองใส่ภาพเพื่อดูในเกมได้ทันที (เก็บในเบราว์เซอร์นี้เท่านั้น) พอใจแล้วส่งไฟล์ภาพต้นฉบับในแชท Claude เพื่อใส่ลงโฟลเดอร์ assets/ ของเกมถาวร</div>` +
    rows.filter(r => !seen.has(r[0]) && seen.add(r[0])).map(([f, label, size]) => { const d = MOD.images && MOD.images[f];
      return `<div class="imgrow"><div class="imgbox"><img src="${d || 'assets/' + f + '.png'}" alt="" onload="E.imgOk(this,'${f}',${d ? 1 : 0})" onerror="E.imgMiss(this,'${f}')"></div>
      <div><b style="font-size:14px">${esc(label)}</b><div class="mut"><code>${f}.png</code> · ${size}</div><div id="is-${f}" class="miss" style="font-size:12px">${d ? '' : 'ยังไม่มีภาพ'}</div></div>
      <div style="display:flex;flex-direction:column;gap:4px"><label><button class="sm" onclick="this.nextElementSibling.click()">เลือกภาพ</button><input type="file" accept="image/*" style="display:none" onchange="E.upload('${f}',this)"></label>${d ? `<button class="sm dan" onclick="E.delImg('${f}')">เอาออก</button>` : ''}</div></div>` }).join('');
}
function exportTab() {
  const ch = DATA_FILES.filter(changed);
  const all = ch.map(f => `=== data/${f}.json ===\n${JSON.stringify(DATA[f], null, 2)}`).join('\n\n');
  window._all = all;
  return `<div class="card"><h3>ส่งการแก้ไขให้ Claude บันทึกถาวร</h3><p class="mut">กด "คัดลอกทั้งหมด" แล้ววางในแชท Claude พร้อมบอกว่า "บันทึกลงเกม" ระบบจะส่งเฉพาะไฟล์ที่แก้ ไม่ต้องอ่านเกมทั้งหมดใหม่</p>
  ${ch.length ? `<p>ไฟล์ที่แก้: ${ch.map(f => `<code>${f}.json</code>`).join(', ')}</p><button class="pri" onclick="E.copy(_all)">📋 คัดลอกทั้งหมด</button>` : '<p class="mut">ยังไม่มีการแก้ไข</p>'}
  ${Object.keys(MOD.images || {}).length ? `<p class="mut">มีภาพทดลอง ${Object.keys(MOD.images).length} ภาพ — ภาพต้องส่งไฟล์ต้นฉบับในแชทแยกต่างหาก</p>` : ''}</div>
  ${ch.length ? `<textarea readonly style="min-height:220px;font-size:12px;font-family:monospace">${esc(all)}</textarea>` : ''}
  <div class="card" style="margin-top:12px"><h3>จัดการฉบับร่าง</h3>
  <label class="row" style="margin-bottom:10px"><input type="checkbox" ${MOD.on !== false ? 'checked' : ''} onchange="E.toggleMod(this.checked)"> ใช้ฉบับร่างเมื่อเปิดเกมในเบราว์เซอร์นี้</label>
  <div class="row">${ch.map(f => `<button class="sm" onclick="E.resetFile('${f}')">คืนค่า ${TAB_LABEL[f] || f}</button>`).join('')}<button class="dan" onclick="E.resetAll()">ล้างฉบับร่างทั้งหมด</button></div></div>`;
}

function render() {
  const w = validate();
  const body = { heroes: heroesTab, enemies: enemiesTab, skills: skillsTab, events: eventsTab, images: imagesTab, export: exportTab }[tab] || (() => genericTab(tab));
  const open = [...document.querySelectorAll('details.item[open]')].map(d => d.dataset.k);
  const y = window.scrollY;
  document.getElementById('app').innerHTML = `<div class="top"><div class="row"><b class="pix" style="color:var(--lamp2);font-size:18px">DEEPFALL Editor</b><span id="st" class="status"></span><a href="index.html"><button class="pri sm">▶ เล่นเกม</button></a></div>
  <div class="etabs">${TABS.map(t => `<button data-t="${t}" class="${t === tab ? 'on' : ''} ${DATA_FILES.includes(t) && changed(t) ? 'chg' : ''}" onclick="E.tab('${t}')">${TAB_LABEL[t]}</button>`).join('')}</div></div>
  <div class="wrap">${w.length ? `<div class="warn"><b>⚠️ ตรวจพบปัญหา ${w.length} จุด</b><br>${w.slice(0, 8).map(esc).join('<br>')}</div>` : ''}${body()}</div>`;
  open.forEach(k => { const d = document.querySelector(`details.item[data-k="${CSS.escape(k)}"]`); if (d) d.open = true });
  window.scrollTo(0, y);
}

// ---------- input handling ----------
document.addEventListener('change', e => {
  const el = e.target; if (!el.dataset || !el.dataset.p) return;
  const path = unP(el.dataset.p), t = el.dataset.t; let v;
  if (t === 'n') { v = el.value === '' ? 0 : Number(el.value); if (isNaN(v)) { status('⚠️ ต้องเป็นตัวเลข'); return } }
  else if (t === 'b') v = el.checked;
  else if (t === 'an' || t === 'as') { const parts = el.value.split(',').map(s => s.trim()).filter(s => s !== ''); v = t === 'an' && parts.every(s => /^-?\d+(\.\d+)?$/.test(s)) ? parts.map(Number) : parts }
  else v = el.value;
  setAt(DATA, path, v); saveDraft();
  if (['name', 'hp', 'atk', 'def', 'star', 'title', 'w', 'emoji', 'color', 'desc', 'kind', 'mult', 'icon'].includes(path[path.length - 1]) || t === 'an' || t === 'as') { const w = validate(); const box = document.querySelector('.warn'); if (!!w.length !== !!box) render() }
});

window.E = {
  tab: t => { tab = t; window.scrollTo(0, 0); render() },
  addKey: p => { const path = unP(p), obj = getAt(DATA, path), first = Object.keys(obj).find(k => k[0] !== '_');
    promptDlg('id ของตัวใหม่ (ภาษาอังกฤษ ไม่เว้นวรรค)', 'new_' + Math.floor(Math.random() * 1000), id => { if (!id || obj[id] || !/^[a-zA-Z0-9_]+$/.test(id)) { status('⚠️ id ซ้ำหรือไม่ถูกต้อง'); return } obj[id] = clone(obj[first]); if (obj[id].name) obj[id].name += ' (ใหม่)'; saveDraft(); render(); const d = document.querySelector(`details.item[data-k="${CSS.escape(path.concat(id).join('/'))}"]`); if (d) { d.open = true; d.scrollIntoView() } }) },
  dupKey: (p, k) => { const path = unP(p), obj = getAt(DATA, path);
    promptDlg('id ของตัวใหม่', k + '_2', id => { if (!id || obj[id] || !/^[a-zA-Z0-9_]+$/.test(id)) { status('⚠️ id ซ้ำหรือไม่ถูกต้อง'); return } obj[id] = clone(obj[k]); saveDraft(); render() }) },
  rename: (p, k) => { const path = unP(p), obj = getAt(DATA, path);
    promptDlg(`เปลี่ยน id "${k}" เป็น (ระวัง: ที่อื่นที่อ้างถึง id เดิมต้องแก้ตามด้วย)`, k, id => { if (!id || id === k || obj[id] || !/^[a-zA-Z0-9_]+$/.test(id)) return; const n = {}; Object.keys(obj).forEach(x => { n[x === k ? id : x] = obj[x] }); setAt(DATA, path, n); saveDraft(); render() }) },
  delKey: (p, k) => confirmDlg(`ลบ "${k}"?`, () => { delete getAt(DATA, unP(p))[k]; saveDraft(); render() }),
  addIdx: p => { const arr = getAt(DATA, unP(p)); arr.push(arr.length ? clone(arr[arr.length - 1]) : ''); saveDraft(); render() },
  delIdx: (p, i) => confirmDlg('ลบรายการนี้?', () => { getAt(DATA, unP(p)).splice(i, 1); saveDraft(); render() }),
  copy: async t => { try { await navigator.clipboard.writeText(t); status('คัดลอกแล้ว ✔') } catch (e) { status('คัดลอกไม่ได้ — เลือกข้อความในกล่องด้านล่างแล้วคัดลอกเอง') } },
  toggleMod: on => { MOD.on = on; writeMod(MOD); status(on ? 'เกมจะใช้ฉบับร่าง' : 'เกมจะใช้ข้อมูลต้นฉบับ') },
  resetFile: f => confirmDlg(`คืนค่า ${TAB_LABEL[f] || f} เป็นต้นฉบับ?`, () => { DATA[f] = clone(BASE[f]); saveDraft('คืนค่าแล้ว'); render() }),
  resetAll: () => confirmDlg('ล้างฉบับร่างทั้งหมด (รวมภาพทดลอง)?', () => { DATA_FILES.forEach(f => DATA[f] = clone(BASE[f])); MOD.images = {}; saveDraft('ล้างแล้ว'); render() }),
  imgOk: (img, f, draft) => { const s = document.getElementById('is-' + f); if (s) { s.className = draft ? 'draft' : 'ok'; s.textContent = `${draft ? 'ภาพทดลอง' : 'มีในเกมแล้ว'} · ${img.naturalWidth}×${img.naturalHeight}` } },
  imgMiss: (img, f) => { img.remove() },
  upload: (f, input) => { const file = input.files[0]; if (!file) return;
    const rd = new FileReader(); rd.onload = () => { MOD.images = MOD.images || {}; MOD.images[f] = rd.result; if (!writeMod(MOD)) { delete MOD.images[f]; status('⚠️ ภาพใหญ่เกินไป เก็บในเบราว์เซอร์ไม่ได้') } else status('ใส่ภาพแล้ว ✔ เปิดเกมเพื่อดูได้เลย'); render() }; rd.readAsDataURL(file) },
  delImg: f => { delete MOD.images[f]; writeMod(MOD); render() }
};

(async function boot() {
  try { BASE = await loadBaseData() } catch (e) { document.getElementById('app').innerHTML = `<div class="loading">โหลดข้อมูลไม่ได้<br><span class="mut">${esc(e.message)}</span></div>`; return }
  MOD = readMod(); MOD.images = MOD.images || {};
  DATA = {}; DATA_FILES.forEach(f => { DATA[f] = clone(MOD.files[f] || BASE[f]) });
  const h = location.hash.slice(1); if (TABS.includes(h)) tab = h;
  render();
})();
