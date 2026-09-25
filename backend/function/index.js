'use strict';

const AWS = require('aws-sdk');
const crypto = require('crypto');
const MarkdownIt = require('markdown-it');

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

const s3 = new AWS.S3({
  endpoint: 'https://storage.yandexcloud.net',
  region: 'ru-central1',
  s3ForcePathStyle: true,
  signatureVersion: 'v4',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const BUCKET = process.env.BUCKET;
const TOKEN = process.env.CREATE_TOKEN;
const SITE_URL = (process.env.SITE_URL || '').replace(/\/$/, '');
const ALLOWED_TTL = [7, 30, 90];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  const method = event.httpMethod || (event.requestContext && event.requestContext.httpMethod);
  if (method === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (method !== 'POST') return resp(405, { error: 'method not allowed' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return resp(400, { error: 'bad json' }); }

  if (body.token !== TOKEN) return resp(401, { error: 'unauthorized' });

  try {
    switch (body.action || 'page') {
      case 'bootstrap':   return await bootstrap(body);
      case 'page':        return await createPage(body);
      case 'site-init':   return await initSite(body);
      case 'site-folder': return await writeFolder(body);
      case 'site-page':   return await createSitePage(body);
      default:            return resp(400, { error: 'unknown action' });
    }
  } catch (e) {
    return resp(500, { error: String(e && e.message || e) });
  }
};

// ---------- action: bootstrap (создать корневые файлы при первом запуске) ----------
async function bootstrap(body) {
  const apiUrl = body.apiUrl || '';
  const created = [];

  // manifest.json — только если отсутствует (чтобы не стереть существующие публикации)
  let hasManifest = true;
  try { await s3.headObject({ Bucket: BUCKET, Key: 'manifest.json' }).promise(); }
  catch (e) { hasManifest = false; }
  if (!hasManifest) {
    await putObj('manifest.json', JSON.stringify({ pages: [] }, null, 2), 'application/json', 'no-cache');
    created.push('manifest.json');
  }

  // статические страницы — перезаписываем всегда (это шаблоны)
  await putHtml('index.html', ROOT_INDEX_HTML);
  await putHtml('error.html', ROOT_ERROR_HTML);
  await putHtml('new.html', rootNewHtml(apiUrl));
  created.push('index.html', 'error.html', 'new.html');

  return resp(200, { ok: true, created, site: SITE_URL + '/' });
}

// ---------- action: page (одиночная страница) ----------
async function createPage(body) {
  const { title, markdown, ttlDays, images } = body;
  if (!title || !markdown) return resp(400, { error: 'title and markdown required' });

  const ttl = normTtl(ttlDays);
  const slug = rndSlug();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttl * 86400000);
  const prefix = `p/${ttl}/${slug}/`;
  const pageUrl = `${SITE_URL}/${prefix}`;

  await putHtml(prefix + 'index.html', renderPage(title, md.render(markdown)));
  await manifestAdd({ type: 'page', slug, title, ttl, url: pageUrl, createdAt: now.toISOString(), expiresAt: expiresAt.toISOString() });

  return resp(200, { url: pageUrl, expiresAt: expiresAt.toISOString(), uploads: presignAssets(images, prefix + 'assets/') });
}

// ---------- action: site-init (создать сайт, вернуть slug) ----------
async function initSite(body) {
  const { title, ttlDays } = body;
  if (!title) return resp(400, { error: 'title required' });

  const ttl = normTtl(ttlDays);
  const siteSlug = rndSlug();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttl * 86400000);
  const siteUrl = `${SITE_URL}/s/${ttl}/${siteSlug}/`;

  await manifestAdd({ type: 'site', slug: siteSlug, title, ttl, url: siteUrl, createdAt: now.toISOString(), expiresAt: expiresAt.toISOString() });

  return resp(200, { siteSlug, ttl, url: siteUrl, expiresAt: expiresAt.toISOString() });
}

// ---------- action: site-folder (индекс одной папки дерева) ----------
async function writeFolder(body) {
  const { siteSlug, ttlDays, dir, title } = body;
  if (!siteSlug || dir == null) return resp(400, { error: 'siteSlug and dir required' });

  const ttl = normTtl(ttlDays);
  const prefix = `s/${ttl}/${siteSlug}/${dir}`;
  const data = {
    title: title || '',
    breadcrumbs: body.breadcrumbs || [],
    folders: body.folders || [],
    notes: body.notes || [],
  };

  await putObj(prefix + 'data.json', JSON.stringify(data), 'application/json', 'no-cache');
  await putHtml(prefix + 'index.html', renderSiteIndex(data.title));

  return resp(200, { url: `${SITE_URL}/${prefix}` });
}

// ---------- action: site-page (страница заметки внутри дерева) ----------
async function createSitePage(body) {
  const { siteSlug, ttlDays, dir, slug, title, markdown, images } = body;
  if (!siteSlug || dir == null || !slug || !markdown) return resp(400, { error: 'siteSlug, dir, slug, markdown required' });

  const ttl = normTtl(ttlDays);
  const prefix = `s/${ttl}/${siteSlug}/${dir}${slug}/`;
  const pageUrl = `${SITE_URL}/${prefix}`;
  const back = '<p><a href="../">← к списку</a></p>';

  await putHtml(prefix + 'index.html', renderPage(title || slug, back + md.render(markdown)));

  return resp(200, { url: pageUrl, uploads: presignAssets(images, prefix + 'assets/') });
}

// ---------- helpers ----------
function normTtl(v) { return ALLOWED_TTL.includes(Number(v)) ? Number(v) : 30; }
function rndSlug() { return crypto.randomBytes(5).toString('hex'); }

function presignAssets(images, prefix) {
  if (!Array.isArray(images) || !images.length) return [];
  return images.map((img) => {
    const name = String(img.name).split('/').pop();
    const putUrl = s3.getSignedUrl('putObject', { Bucket: BUCKET, Key: prefix + name, Expires: 3600 });
    return { name: img.name, putUrl };
  });
}

async function putObj(key, bodyStr, contentType, cacheControl) {
  const params = { Bucket: BUCKET, Key: key, Body: bodyStr, ContentType: contentType };
  if (cacheControl) params.CacheControl = cacheControl;
  await s3.putObject(params).promise();
}
function putHtml(key, html) { return putObj(key, html, 'text/html; charset=utf-8'); }

async function manifestAdd(entry) {
  let manifest = { pages: [] };
  try {
    const obj = await s3.getObject({ Bucket: BUCKET, Key: 'manifest.json' }).promise();
    manifest = JSON.parse(obj.Body.toString('utf-8'));
  } catch (e) { /* first run */ }
  const nowIso = new Date().toISOString();
  manifest.pages = (manifest.pages || []).filter((p) => p.expiresAt > nowIso);
  manifest.pages.unshift(entry);
  await putObj('manifest.json', JSON.stringify(manifest, null, 2), 'application/json', 'no-cache');
}

function resp(statusCode, obj) {
  return { statusCode, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderPage(title, contentHtml) {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body{max-width:760px;margin:40px auto;padding:0 16px;font:16px/1.6 -apple-system,system-ui,sans-serif;color:#222}
  img{max-width:100%}
  pre{background:#f5f5f5;padding:12px;overflow:auto;border-radius:6px;white-space:pre}
  code{background:#f5f5f5;padding:2px 4px;border-radius:4px}
  pre code{background:none;padding:0}
  a{color:#0a58ca}
</style>
</head>
<body>
${contentHtml}
</body>
</html>`;
}

// Индекс папки: хлебные крошки + подпапки + заметки (поиск/фильтры/сортировка). Читает data.json.
function renderSiteIndex(title) {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body{max-width:820px;margin:28px auto;padding:0 16px;font:16px/1.6 -apple-system,system-ui,sans-serif;color:#222}
  #bc{font-size:14px;color:#888;margin-bottom:4px}
  #bc a{color:#0a58ca;text-decoration:none}
  h1{margin:.2em 0}
  #q{width:100%;box-sizing:border-box;padding:10px;margin:10px 0;border:1px solid #ccc;border-radius:8px;font:inherit}
  #filters{display:flex;flex-wrap:wrap;gap:10px;margin:6px 0}
  label.f{font-size:14px;color:#555}
  select{padding:6px;border:1px solid #ccc;border-radius:6px;font:inherit}
  #count{color:#888;font-size:14px;margin:8px 0}
  ul{list-style:none;padding:0}
  li{padding:8px 0;border-bottom:1px solid #eee}
  ul.folders li{border:none;padding:4px 0}
  a{color:#0a58ca;text-decoration:none}
  a:hover{text-decoration:underline}
  small{color:#888}
  .bar{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
  h3.sec{margin:16px 0 4px;font-size:15px;color:#666}
</style>
</head>
<body>
<div id="bc"></div>
<h1 id="h1"></h1>
<div id="folders"></div>
<div id="notesblock" style="display:none">
  <input id="q" placeholder="Поиск по названию и метаданным...">
  <div id="filters"></div>
  <div class="bar"><label>Сортировка: <select id="sortby"></select></label><span id="count"></span></div>
  <ul id="list"></ul>
</div>
<script>
var NOTES=[];
function el(id){return document.getElementById(id);}
function esc(s){var d=document.createElement('div');d.textContent=(s==null?'':s);return d.innerHTML;}
function renderAll(D){
  var parts=(D.breadcrumbs||[]).map(function(b){return '<a href="'+encodeURI(b.url)+'">'+esc(b.name)+'</a>';});
  parts.push(esc(D.title));
  el('bc').innerHTML=parts.join(' / ');
  el('h1').textContent=D.title||'';
  var fol=D.folders||[];
  el('folders').innerHTML=fol.length?('<h3 class="sec">Разделы</h3><ul class="folders">'+fol.map(function(f){return '<li>📁 <a href="'+encodeURI(f.url)+'">'+esc(f.name)+'</a></li>';}).join('')+'</ul>'):'';
  NOTES=D.notes||[];
  if(!NOTES.length){el('notesblock').style.display='none';return;}
  el('notesblock').style.display='';
  if(fol.length)el('notesblock').insertAdjacentHTML('afterbegin','<h3 class="sec">Страницы</h3>');
  buildFilters();
}
function buildFilters(){
  var keys=[],seen={};
  NOTES.forEach(function(s){Object.keys(s.meta||{}).forEach(function(k){if(!seen[k]){seen[k]=1;keys.push(k);}});});
  var fc=el('filters');fc.innerHTML='';
  keys.forEach(function(k){
    var vals={};NOTES.forEach(function(s){var v=(s.meta||{})[k];if(v){vals[v]=1;}});
    var opts=Object.keys(vals).sort(function(a,b){return a.localeCompare(b,'ru');});
    if(opts.length<2||opts.length>60)return;
    var wrap=document.createElement('label');wrap.className='f';
    wrap.appendChild(document.createTextNode(k+': '));
    var sel=document.createElement('select');sel.setAttribute('data-key',k);
    sel.innerHTML='<option value="">(все)</option>'+opts.map(function(o){return '<option>'+esc(o)+'</option>';}).join('');
    sel.addEventListener('change',render);
    wrap.appendChild(sel);fc.appendChild(wrap);
  });
  el('sortby').innerHTML='<option value="title">Название</option>'+keys.map(function(k){return '<option value="meta:'+esc(k)+'">'+esc(k)+'</option>';}).join('');
  el('sortby').onchange=render;
  el('q').oninput=render;
  render();
}
function render(){
  var q=el('q').value.toLowerCase().trim();
  var sels=[].slice.call(document.querySelectorAll('#filters select'));
  var sortby=el('sortby').value;
  var rows=NOTES.filter(function(s){
    if(q){var hay=(s.title+' '+Object.keys(s.meta||{}).map(function(k){return s.meta[k];}).join(' ')).toLowerCase();if(hay.indexOf(q)<0)return false;}
    for(var i=0;i<sels.length;i++){var k=sels[i].getAttribute('data-key'),v=sels[i].value;if(v&&(s.meta||{})[k]!==v)return false;}
    return true;
  });
  rows.sort(function(a,b){
    var av,bv;
    if(sortby.indexOf('meta:')===0){var k=sortby.slice(5);av=(a.meta||{})[k]||'';bv=(b.meta||{})[k]||'';}
    else{av=a.title||'';bv=b.title||'';}
    return String(av).localeCompare(String(bv),'ru');
  });
  el('count').textContent=rows.length+' из '+NOTES.length;
  el('list').innerHTML=rows.map(function(s){
    var sub=[];var m=s.meta||{};
    if(m['исполнитель'])sub.push(esc(m['исполнитель']));
    if(m['тональность'])sub.push(esc(m['тональность']));
    return '<li><a href="'+encodeURI(s.url)+'">'+esc(s.title)+'</a>'+(sub.length?' <small>— '+sub.join(' · ')+'</small>':'')+'</li>';
  }).join('')||'<li>Ничего не найдено</li>';
}
fetch('data.json?_='+Date.now()).then(function(r){return r.json();}).then(renderAll).catch(function(){el('h1').textContent='Ошибка загрузки';});
</script>
</body>
</html>`;
}

// ---------- шаблоны корневых файлов (для bootstrap) ----------
const ROOT_INDEX_HTML = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Мои страницы</title>
<style>
  body{max-width:640px;margin:40px auto;padding:0 16px;font:16px/1.6 -apple-system,system-ui,sans-serif;color:#222}
  h1{margin-bottom:8px}
  ul{list-style:none;padding:0}
  li{padding:10px 0;border-bottom:1px solid #eee}
  a{color:#0a58ca;text-decoration:none}
  a:hover{text-decoration:underline}
  small{color:#888}
  .new{display:inline-block;margin:8px 0 20px;padding:8px 14px;background:#0a58ca;color:#fff;border-radius:6px}
</style>
</head>
<body>
<h1>Мои страницы</h1>
<a class="new" href="new.html">+ Создать</a>
<ul id="list"><li>Загрузка…</li></ul>
<script>
fetch('manifest.json?_=' + Date.now())
  .then(function (r) { return r.json(); })
  .then(function (m) {
    var now = new Date().toISOString();
    var live = (m.pages || []).filter(function (p) { return p.expiresAt > now; });
    var ul = document.getElementById('list');
    if (!live.length) { ul.innerHTML = '<li>Пока пусто</li>'; return; }
    ul.innerHTML = live.map(function (p) {
      var days = Math.max(0, Math.ceil((new Date(p.expiresAt) - new Date()) / 86400000));
      var tag = p.type === 'site' ? ' 📁' : '';
      return '<li><a href="' + p.url + '">' + esc(p.title) + '</a>' + tag +
             ' <small>— сгорит через ' + days + ' дн.</small></li>';
    }).join('');
    function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  })
  .catch(function () {
    document.getElementById('list').innerHTML = '<li>Ошибка загрузки списка</li>';
  });
</script>
</body>
</html>`;

const ROOT_ERROR_HTML = `<!doctype html>
<html lang="ru">
<head><meta charset="utf-8"><title>Не найдено</title></head>
<body style="font:16px/1.6 -apple-system,system-ui,sans-serif;max-width:640px;margin:80px auto;text-align:center">
<h1>404</h1>
<p>Страница не найдена или срок её жизни истёк.</p>
<p><a href="/index.html">← На главную</a></p>
</body>
</html>`;

function rootNewHtml(apiUrl) {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Создать страницу</title>
<style>
  body{max-width:640px;margin:40px auto;padding:0 16px;font:16px/1.6 -apple-system,system-ui,sans-serif;color:#222}
  input,textarea,select,button{width:100%;box-sizing:border-box;margin:6px 0 14px;padding:10px;font:inherit;border:1px solid #ccc;border-radius:6px}
  textarea{min-height:240px;font-family:ui-monospace,Menlo,monospace}
  button{background:#0a58ca;color:#fff;border:none;cursor:pointer}
  #out{white-space:pre-wrap;color:#555}
  a{color:#0a58ca}
</style>
</head>
<body>
<p><a href="index.html">← К списку</a></p>
<h1>Новая страница</h1>
<form id="f">
  <input name="title" placeholder="Заголовок" required>
  <textarea name="markdown" placeholder="# Заголовок&#10;&#10;Текст в **markdown**..." required></textarea>
  <label>Время жизни:
    <select name="ttlDays">
      <option value="7">7 дней</option>
      <option value="30" selected>30 дней</option>
      <option value="90">90 дней</option>
    </select>
  </label>
  <input name="token" type="password" placeholder="Токен" required>
  <button>Создать</button>
</form>
<div id="out"></div>
<script>
var API = '${apiUrl}';
document.getElementById('f').addEventListener('submit', function (e) {
  e.preventDefault();
  var out = document.getElementById('out');
  out.textContent = 'Отправка…';
  var body = Object.fromEntries(new FormData(e.target).entries());
  body.ttlDays = Number(body.ttlDays);
  fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
    .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
    .then(function (res) {
      if (res.ok) {
        out.textContent = 'Готово: ' + res.j.url;
        setTimeout(function () { location.href = 'index.html'; }, 800);
      } else {
        out.textContent = 'Ошибка: ' + (res.j.error || 'неизвестно');
      }
    })
    .catch(function (err) { out.textContent = 'Сбой сети: ' + err; });
});
</script>
</body>
</html>`;
}
