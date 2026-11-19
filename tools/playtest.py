#!/usr/bin/env python3
"""Bot playtest for Deepfall.

Plays the game in headless Chrome with sped-up animations and reports errors and balance numbers.

  python3 tools/playtest.py              # 6 full runs with random play + boss trials
  python3 tools/playtest.py --runs 3 --boss 10 --levels 3,6,10

Needs: python playwright + a Chrome/Chromium binary (set CHROME=/path if not /usr/bin/google-chrome).
"""
import argparse, asyncio, functools, http.server, os, re, shutil, socketserver, tempfile, threading
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

RUNS_JS = r"""
async (runs) => {
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const out=[];
 G.start(); await sleep(20);
 for(let i=0;i<STORY.intro.length;i++){ G.cb(0); await sleep(5);} closeModal();
 G.pull(10); closeModal();
 out.push('owned: '+owned().join(','));
 for(let run=0; run<runs; run++){
   G.prep(); if(!ui.prep.length) ui.prep=owned().filter(alive).slice(0,4);
   S.gold+=300; S.inv.rations+=8; S.inv.potions+=2;
   G.go();
   let guard=0;
   while(S.run && guard++<40000){
     if(B){
       if(B.phase==='player'&&!B.busy&&B.act>=0){
         const u=B.heroes[B.act]; const ks=[...u.skills].reverse().filter(k=>!u.cd[k]); const k=ks[0]||'defend';
         chooseSkill(k);
         if(B&&B.sel){ if(HSK[k].tgt==='enemy') chooseTarget('e',B.enemies.findIndex(e=>e.alive)); else chooseTarget('h',B.heroes.findIndex(h=>h.alive)); }
       }
       await sleep(2); continue;
     }
     const m=document.getElementById('modal');
     if(m.classList.contains('on')){ const btn=[...m.querySelectorAll('button')].find(b=>!b.disabled); if(btn) btn.click(); await sleep(2); continue; }
     const av=availNodes(); if(!av.length){ out.push('STUCK: no rooms available'); break; }
     const [l,i]=pick(av); enterNode(l,i); await sleep(2);
   }
   for(let j=0;j<10;j++){const m=document.getElementById('modal'); if(!m.classList.contains('on'))break; const b=[...m.querySelectorAll('button')].find(b=>!b.disabled); b&&b.click(); await sleep(5);}
   if(S.lobbyEvent) G.ev('ok');
   out.push(`run ${run+1}: deepest=${S.deepest} dead=[${owned().filter(id=>S.heroes[id].dead)}] gold=${S.gold} crystals=${S.crystals} souls=${S.souls}`);
   owned().filter(id=>S.heroes[id].dead).forEach(id=>{S.heroes[id].dead=false});
   owned().forEach(id=>{S.heroes[id].lv=Math.min(C.hero.maxLv,S.heroes[id].lv+1)});
 }
 return out.join('\n');
}
"""

BOSS_JS = r"""
async ([lv, trials, team]) => {
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 let wins=0, rounds=[];
 for(let t=0;t<trials;t++){
  S=fresh();S.started=true;HERO_IDS.forEach(addHero);
  HERO_IDS.forEach(id=>{S.heroes[id].hid=true;S.heroes[id].lv=lv});
  ui.prep=team.slice();startRun();S.inv.potions=3;
  S.run.floor=C.dungeon.bossFloor;S.run.map=genFloor(S.run.floor);S.run.pos={l:S.run.map.layers.length-1,i:0};
  startBattle('boss'); let g=0, lastRound=0;
  while(B&&g++<20000){
    lastRound=B.round;
    if(B.phase==='player'&&!B.busy&&B.act>=0){
      const u=B.heroes[B.act];const danger=aliveE(B).some(e=>e.intent&&ESK[e.intent.k]&&(ESK[e.intent.k].kind==='charge'||ESK[e.intent.k].secret));
      const avail=[...u.skills,'defend'].filter(k=>!u.cd[k]);
      let k=null,tgt=null;const low=aliveH(B).find(h=>h.hp<h.maxHp*.45);
      const isShield=k=>(HSK[k].fx||[]).some(f=>f.t==='shield'&&(f.to==='team'||f.to==='others'));
      if(danger) k=avail.find(isShield)||avail.find(k=>(HSK[k].fx||[]).some(f=>f.t==='shield'))||'defend';
      if(!k&&low){const hk=avail.find(k=>HSK[k].tgt==='ally');if(hk){k=hk;tgt=['h',B.heroes.indexOf(low)]}}
      if(!k) k=avail.filter(k=>HSK[k].tgt==='all'||HSK[k].tgt==='enemy').sort((a,b)=>(HSK[b].cd||0)-(HSK[a].cd||0))[0]||'defend';
      chooseSkill(k);
      if(B&&B.sel){ if(tgt) chooseTarget(...tgt); else { const es=aliveE(B); const e=es.reduce((a,e)=>e.hp<a.hp?e:a); chooseTarget('e',B.enemies.indexOf(e)); } }
    }
    await sleep(2);
  }
  await sleep(20);
  const won=B===null && S.run && S.run.party.length>0 && Object.values(S.know).some(k=>k.kills>0) && dataKeys(ENEMIES).filter(k=>ENEMIES[k].boss).some(k=>S.know[k]&&S.know[k].kills>0);
  if(won)wins++; rounds.push(lastRound);
  closeModal();
 }
 return `boss lv${lv} [${team}] : won ${wins}/${trials}, avg ${Math.round(rounds.reduce((a,b)=>a+b,0)/rounds.length)} turns`;
}
"""

def serve(dirpath):
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    handler = functools.partial(Quiet, directory=dirpath)
    httpd = socketserver.TCPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd

async def main(a):
    tmp = tempfile.mkdtemp()
    shutil.copytree(ROOT, tmp, dirs_exist_ok=True, ignore=shutil.ignore_patterns('.git'))
    eng = os.path.join(tmp, 'js', 'engine.js')
    s = open(eng, encoding='utf-8').read()
    s = s.replace('setTimeout(r, ms))', 'setTimeout(r, ms / 100))')
    s = re.sub(r'\}, (500|700)\); render\(\); return true', '}, 5); render(); return true', s)
    open(eng, 'w', encoding='utf-8').write(s)
    httpd = serve(tmp)
    url = f'http://127.0.0.1:{httpd.server_address[1]}/index.html'
    async with async_playwright() as p:
        br = await p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--no-sandbox'])
        pg = await br.new_page(viewport={'width': 390, 'height': 844})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(url)
        await pg.wait_for_function('typeof S!=="undefined" && S')
        if a.runs:
            print(await pg.evaluate(RUNS_JS, a.runs))
        for team in [t.split('+') for t in a.teams.split(',')]:
            for lv in [int(x) for x in a.levels.split(',')]:
                if a.boss:
                    await pg.reload(); await pg.wait_for_function('typeof S!=="undefined" && S')
                    print(await pg.evaluate(BOSS_JS, [lv, a.boss, team]))
        print('ERRORS:', errs if errs else 'none')
        await br.close()
    httpd.shutdown()

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--runs', type=int, default=6)
    ap.add_argument('--boss', type=int, default=8, help='boss trials per team/level (0 = skip)')
    ap.add_argument('--levels', default='3,6,10')
    ap.add_argument('--teams', default='iolen+kael+mira+doran,bran+pip+lyra+doran')
    asyncio.run(main(ap.parse_args()))
