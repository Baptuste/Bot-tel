/**
 * Genere web/dist/_client-preview.html : un harnais qui simule le WebApp Telegram
 * (avec un initData NON-admin forge) et charge le vrai bundle -> on voit la Mini
 * App client en vrai, branchee sur /api/shop. A servir via le bot (localhost:3000).
 *
 *   node --import tsx src/index.ts   (le bot + serveur, dans un terminal)
 *   npm run preview:client
 *   -> http://localhost:3000/_client-preview.html
 */
import crypto from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf-8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const TOKEN = env.BOT_TOKEN!;

function initData(user: object): string {
  const p = new URLSearchParams();
  p.set('auth_date', String(Math.floor(Date.now() / 1000)));
  p.set('user', JSON.stringify(user));
  const dcs = [...p.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  p.set('hash', crypto.createHmac('sha256', secret).update(dcs).digest('hex'));
  return p.toString();
}

const ID = initData({ id: 987654, first_name: 'Lea', username: 'lea_demo' });

const index = readFileSync(new URL('../web/dist/index.html', import.meta.url), 'utf-8');
// recupere le <script type=module src=...> du build
const script = index.match(/<script type="module"[^>]*src="([^"]+)"[^>]*>/)![1];
const css = index.match(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/)?.[1] ?? '';

const html = `<!doctype html><html lang="fr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Preview client</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&display=swap">
${css ? `<link rel="stylesheet" crossorigin href="${css}">` : ''}
<style>
  :root{
    --tg-theme-bg-color:#ffffff; --tg-theme-text-color:#1c1c1e; --tg-theme-hint-color:#7d7d85;
    --tg-theme-link-color:#2f6e8f; --tg-theme-secondary-bg-color:#f1efe9;
    --tg-theme-button-color:#2f6e8f; --tg-theme-button-text-color:#fff;
  }
  @media (prefers-color-scheme: dark){:root{
    --tg-theme-bg-color:#17181c; --tg-theme-text-color:#eceae4; --tg-theme-hint-color:#8b8b93;
    --tg-theme-link-color:#6fb7d8; --tg-theme-secondary-bg-color:#232326;
    --tg-theme-button-color:#6fb7d8; --tg-theme-button-text-color:#111;
  }}
  body{max-width:420px;margin:0 auto;padding:44px 0 64px}
  #__mb{position:fixed;left:0;right:0;bottom:0;max-width:420px;margin:0 auto;
    background:#c6402f;color:#fff;font:600 15px/1 -apple-system,system-ui,sans-serif;
    text-align:center;padding:16px;display:none;cursor:pointer;letter-spacing:.02em}
  #__bb{position:fixed;top:8px;left:8px;z-index:9;background:#0006;color:#fff;border:0;
    border-radius:6px;padding:6px 10px;font:600 13px/1 monospace;display:none;cursor:pointer}
</style></head><body>
<button id="__bb">‹ back</button>
<div id="root"></div>
<div id="__mb"></div>
<script>
(function(){
  var mbEl=document.getElementById('__mb'), bbEl=document.getElementById('__bb');
  var mbCb=null, bbCb=null;
  mbEl.onclick=function(){ mbCb && mbCb(); };
  bbEl.onclick=function(){ bbCb && bbCb(); };
  window.Telegram={WebApp:{
    initData:${JSON.stringify(ID)},
    initDataUnsafe:{user:{id:987654,first_name:'Lea',username:'lea_demo'}},
    colorScheme:'light', themeParams:{},
    ready:function(){}, expand:function(){}, close:function(){ alert('WebApp.close()'); },
    showAlert:function(m,cb){ alert(m); cb&&cb(); },
    showConfirm:function(m,cb){ cb(confirm(m)); },
    HapticFeedback:{ notificationOccurred:function(){}, selectionChanged:function(){}, impactOccurred:function(){} },
    BackButton:{
      show:function(){ bbEl.style.display='block'; }, hide:function(){ bbEl.style.display='none'; },
      onClick:function(cb){ bbCb=cb; }, offClick:function(){ bbCb=null; }
    },
    MainButton:{
      setParams:function(p){
        if(p.text!=null) mbEl.textContent=p.text;
        if(p.is_visible!=null) mbEl.style.display=p.is_visible?'block':'none';
        mbEl.style.opacity=(p.is_active===false)?'.55':'1';
      },
      show:function(){ mbEl.style.display='block'; }, hide:function(){ mbEl.style.display='none'; },
      enable:function(){}, disable:function(){},
      showProgress:function(){ mbEl.style.opacity='.55'; }, hideProgress:function(){ mbEl.style.opacity='1'; },
      onClick:function(cb){ mbCb=cb; }, offClick:function(){ mbCb=null; }
    }
  }};
})();
</script>
<script type="module" crossorigin src="${script}"></script>
</body></html>`;

writeFileSync(new URL('../web/dist/_client-preview.html', import.meta.url), html);
console.log('ecrit web/dist/_client-preview.html -> http://localhost:3000/_client-preview.html');
