// Shared by the game (index.html) and the editor (editor.html).
// Loads data/*.json, then applies the editor's draft (saved in this browser) on top.
"use strict";
const DATA_FILES = ['config', 'heroes', 'skills', 'enemies', 'encounters', 'events', 'story'];
const MOD_KEY = 'deepfall_mod_v1';

function readMod() {
  try { const m = JSON.parse(localStorage.getItem(MOD_KEY)); if (m && m.files) return m; } catch (e) {}
  return { on: true, files: {}, images: {} };
}
function writeMod(m) {
  try { localStorage.setItem(MOD_KEY, JSON.stringify(m)); return true; } catch (e) { return false; }
}
async function loadBaseData() {
  const out = {};
  await Promise.all(DATA_FILES.map(async f => {
    const r = await fetch('data/' + f + '.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('data/' + f + '.json ' + r.status);
    out[f] = await r.json();
  }));
  return out;
}
async function loadGameData() {
  const base = await loadBaseData();
  const mod = readMod();
  const useMod = mod.on !== false;
  const D = {};
  DATA_FILES.forEach(f => { D[f] = useMod && mod.files[f] ? mod.files[f] : base[f]; });
  window.__MOD = useMod ? mod : null;
  const modded = useMod && (Object.keys(mod.files).length > 0 || Object.keys(mod.images || {}).length > 0);
  return { D, base, mod, modded };
}
function assetSrc(file) {
  const m = window.__MOD;
  if (m && m.images && m.images[file]) return m.images[file];
  return 'assets/' + file + '.png';
}
const dataKeys = o => Object.keys(o || {}).filter(k => k[0] !== '_');
