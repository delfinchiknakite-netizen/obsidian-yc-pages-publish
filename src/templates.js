// HTML-шаблоны страниц (весь рендер — на стороне плагина; S3 только хранит готовое).
function ycpEscHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; });
}

// Полный HTML-документ страницы заметки.
function pageDocument(title, contentHtml, extraCss, extraHead, backLink) {
  return '<!doctype html>\n<html lang="ru">\n<head>\n' +
    '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + ycpEscHtml(title) + '</title>\n<style>\n' +
    '  body{max-width:760px;margin:40px auto;padding:0 16px;font:16px/1.6 -apple-system,system-ui,sans-serif;color:#222;word-wrap:break-word}\n' +
    '  h1,h2,h3,h4{line-height:1.25;margin:1.4em 0 .5em}\n  h1{font-size:1.8em} h2{font-size:1.45em;border-bottom:1px solid #eee;padding-bottom:.2em} h3{font-size:1.2em}\n' +
    '  img{max-width:100%;border-radius:6px}\n' +
    '  pre{background:#f5f5f5;padding:12px;overflow:auto;border-radius:6px;white-space:pre}\n' +
    '  code{background:#f5f5f5;padding:2px 5px;border-radius:4px;font-size:.92em}\n' +
    '  pre code{background:none;padding:0}\n' +
    '  a{color:#0a58ca}\n' +
    '  mark{background:#fff3a3;padding:0 2px;border-radius:3px}\n' +
    '  blockquote{margin:1em 0;padding:.2em 1em;border-left:4px solid #d9dee5;color:#555}\n' +
    '  hr{border:none;border-top:1px solid #e3e6ea;margin:2em 0}\n' +
    '  table{border-collapse:collapse;margin:1em 0;display:block;overflow-x:auto}\n' +
    '  th,td{border:1px solid #e3e6ea;padding:6px 12px;text-align:left}\n  th{background:#f4f5f7}\n  tr:nth-child(2n) td{background:#fafbfc}\n' +
    '  ul,ol{padding-left:1.5em} li{margin:.15em 0}\n  del{color:#999}\n  kbd{background:#eee;border:1px solid #ccc;border-radius:4px;padding:0 5px;font-size:.85em}\n' +
    (extraCss || '') + '\n</style>\n' + (extraHead || '') + '\n</head>\n<body>\n' +
    (backLink || '') + '\n' + contentHtml + '\n</body>\n</html>';
}

// Индекс папки многостраничного сайта: хлебные крошки + подпапки + заметки (поиск/фильтры/сортировка).
function siteIndexDocument(title) {
  var head = '<!doctype html>\n<html lang="ru">\n<head>\n' +
    '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + ycpEscHtml(title) + '</title>\n<style>\n' +
    '  body{max-width:820px;margin:28px auto;padding:0 16px;font:16px/1.6 -apple-system,system-ui,sans-serif;color:#222}\n' +
    '  #bc{font-size:14px;color:#888;margin-bottom:4px} #bc a{color:#0a58ca;text-decoration:none}\n' +
    '  h1{margin:.2em 0}\n' +
    '  #q{width:100%;box-sizing:border-box;padding:10px;margin:10px 0;border:1px solid #ccc;border-radius:8px;font:inherit}\n' +
    '  #filters{display:flex;flex-wrap:wrap;gap:10px;margin:6px 0} label.f{font-size:14px;color:#555}\n' +
    '  select{padding:6px;border:1px solid #ccc;border-radius:6px;font:inherit}\n' +
    '  #count{color:#888;font-size:14px;margin:8px 0}\n' +
    '  ul{list-style:none;padding:0} li{padding:8px 0;border-bottom:1px solid #eee}\n' +
    '  ul.folders li{border:none;padding:4px 0}\n' +
    '  a{color:#0a58ca;text-decoration:none} a:hover{text-decoration:underline} small{color:#888}\n' +
    '  .bar{display:flex;gap:12px;align-items:center;flex-wrap:wrap} h3.sec{margin:16px 0 4px;font-size:15px;color:#666}\n' +
    '</style>\n</head>\n<body>\n' +
    '<div id="bc"></div>\n<h1 id="h1"></h1>\n<div id="folders"></div>\n' +
    '<div id="notesblock" style="display:none">\n' +
    '  <input id="q" placeholder="Поиск по названию и метаданным...">\n' +
    '  <div id="filters"></div>\n' +
    '  <div class="bar"><label>Сортировка: <select id="sortby"></select></label><span id="count"></span></div>\n' +
    '  <ul id="list"></ul>\n</div>\n';
  var script = '<script>\n' +
    'var NOTES=[];\n' +
    'function el(id){return document.getElementById(id);}\n' +
    'function esc(s){var d=document.createElement("div");d.textContent=(s==null?"":s);return d.innerHTML;}\n' +
    'function renderAll(D){\n' +
    '  var parts=(D.breadcrumbs||[]).map(function(b){return "<a href=\\""+encodeURI(b.url)+"\\">"+esc(b.name)+"</a>";});\n' +
    '  parts.push(esc(D.title));el("bc").innerHTML=parts.join(" / ");el("h1").textContent=D.title||"";\n' +
    '  var fol=D.folders||[];\n' +
    '  el("folders").innerHTML=fol.length?("<h3 class=\\"sec\\">Разделы</h3><ul class=\\"folders\\">"+fol.map(function(f){return "<li>📁 <a href=\\""+encodeURI(f.url)+"\\">"+esc(f.name)+"</a></li>";}).join("")+"</ul>"):"";\n' +
    '  NOTES=D.notes||[];\n' +
    '  if(!NOTES.length){el("notesblock").style.display="none";return;}\n' +
    '  el("notesblock").style.display="";\n' +
    '  if(fol.length)el("notesblock").insertAdjacentHTML("afterbegin","<h3 class=\\"sec\\">Страницы</h3>");\n' +
    '  buildFilters();\n' +
    '}\n' +
    'function buildFilters(){\n' +
    '  var keys=[],seen={};NOTES.forEach(function(s){Object.keys(s.meta||{}).forEach(function(k){if(!seen[k]){seen[k]=1;keys.push(k);}});});\n' +
    '  var fc=el("filters");fc.innerHTML="";\n' +
    '  keys.forEach(function(k){\n' +
    '    var vals={};NOTES.forEach(function(s){var v=(s.meta||{})[k];if(v){vals[v]=1;}});\n' +
    '    var opts=Object.keys(vals).sort(function(a,b){return a.localeCompare(b,"ru");});\n' +
    '    if(opts.length<2||opts.length>60)return;\n' +
    '    var wrap=document.createElement("label");wrap.className="f";wrap.appendChild(document.createTextNode(k+": "));\n' +
    '    var sel=document.createElement("select");sel.setAttribute("data-key",k);\n' +
    '    sel.innerHTML="<option value=\\"\\">(все)</option>"+opts.map(function(o){return "<option>"+esc(o)+"</option>";}).join("");\n' +
    '    sel.addEventListener("change",render);wrap.appendChild(sel);fc.appendChild(wrap);\n' +
    '  });\n' +
    '  el("sortby").innerHTML="<option value=\\"title\\">Название</option>"+keys.map(function(k){return "<option value=\\"meta:"+esc(k)+"\\">"+esc(k)+"</option>";}).join("");\n' +
    '  el("sortby").onchange=render;el("q").oninput=render;render();\n' +
    '}\n' +
    'function render(){\n' +
    '  var q=el("q").value.toLowerCase().trim();\n' +
    '  var sels=[].slice.call(document.querySelectorAll("#filters select"));var sortby=el("sortby").value;\n' +
    '  var rows=NOTES.filter(function(s){\n' +
    '    if(q){var hay=(s.title+" "+Object.keys(s.meta||{}).map(function(k){return s.meta[k];}).join(" ")).toLowerCase();if(hay.indexOf(q)<0)return false;}\n' +
    '    for(var i=0;i<sels.length;i++){var k=sels[i].getAttribute("data-key"),v=sels[i].value;if(v&&(s.meta||{})[k]!==v)return false;}\n' +
    '    return true;});\n' +
    '  rows.sort(function(a,b){var av,bv;if(sortby.indexOf("meta:")===0){var k=sortby.slice(5);av=(a.meta||{})[k]||"";bv=(b.meta||{})[k]||"";}else{av=a.title||"";bv=b.title||"";}return String(av).localeCompare(String(bv),"ru");});\n' +
    '  el("count").textContent=rows.length+" из "+NOTES.length;\n' +
    '  el("list").innerHTML=rows.map(function(s){var sub=[];var m=s.meta||{};if(m["исполнитель"])sub.push(esc(m["исполнитель"]));if(m["тональность"])sub.push(esc(m["тональность"]));return "<li><a href=\\""+encodeURI(s.url)+"\\">"+esc(s.title)+"</a>"+(sub.length?" <small>— "+sub.join(" · ")+"</small>":"")+"</li>";}).join("")||"<li>Ничего не найдено</li>";\n' +
    '}\n' +
    'fetch("data.json?_="+Date.now()).then(function(r){return r.json();}).then(renderAll).catch(function(){el("h1").textContent="Ошибка загрузки";});\n' +
    '</scr' + 'ipt>\n</body>\n</html>';
  return head + script;
}

// Корневые файлы сервиса.
function rootIndexHtml() {
  return '<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Мои страницы</title>\n<style>\n' +
    '  body{max-width:640px;margin:40px auto;padding:0 16px;font:16px/1.6 -apple-system,system-ui,sans-serif;color:#222}\n  h1{margin-bottom:8px} ul{list-style:none;padding:0} li{padding:10px 0;border-bottom:1px solid #eee}\n  a{color:#0a58ca;text-decoration:none} a:hover{text-decoration:underline} small{color:#888}\n  .new{display:inline-block;margin:8px 0 20px;padding:8px 14px;background:#0a58ca;color:#fff;border-radius:6px}\n</style>\n</head>\n<body>\n' +
    '<h1>Мои страницы</h1>\n<ul id="list"><li>Загрузка…</li></ul>\n<script>\n' +
    'fetch("manifest.json?_="+Date.now()).then(function(r){return r.json();}).then(function(m){\n' +
    '  var now=new Date().toISOString();var live=(m.pages||[]).filter(function(p){return p.expiresAt>now;});var ul=document.getElementById("list");\n' +
    '  if(!live.length){ul.innerHTML="<li>Пока пусто</li>";return;}\n' +
    '  ul.innerHTML=live.map(function(p){var days=Math.max(0,Math.ceil((new Date(p.expiresAt)-new Date())/86400000));var tag=p.type==="site"?" 📁":"";return "<li><a href=\\""+p.url+"\\">"+esc(p.title)+"</a>"+tag+" <small>— сгорит через "+days+" дн.</small></li>";}).join("");\n' +
    '  function esc(s){var d=document.createElement("div");d.textContent=s;return d.innerHTML;}\n' +
    '}).catch(function(){document.getElementById("list").innerHTML="<li>Ошибка загрузки списка</li>";});\n</scr' + 'ipt>\n</body>\n</html>';
}

function rootErrorHtml() {
  return '<!doctype html>\n<html lang="ru">\n<head><meta charset="utf-8"><title>Не найдено</title></head>\n<body style="font:16px/1.6 -apple-system,system-ui,sans-serif;max-width:640px;margin:80px auto;text-align:center">\n<h1>404</h1>\n<p>Страница не найдена или срок её жизни истёк.</p>\n<p><a href="/index.html">← На главную</a></p>\n</body>\n</html>';
}

// Веб-форма создания: рендерит markdown в HTML в браузере (markdown-it с CDN), затем шлёт готовый html.
function rootNewHtml(apiUrl) {
  return '<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Создать страницу</title>\n<style>\n' +
    '  body{max-width:640px;margin:40px auto;padding:0 16px;font:16px/1.6 -apple-system,system-ui,sans-serif;color:#222}\n  input,textarea,select,button{width:100%;box-sizing:border-box;margin:6px 0 14px;padding:10px;font:inherit;border:1px solid #ccc;border-radius:6px}\n  textarea{min-height:240px;font-family:ui-monospace,Menlo,monospace} button{background:#0a58ca;color:#fff;border:none;cursor:pointer}\n  #out{white-space:pre-wrap;color:#555} a{color:#0a58ca}\n</style>\n' +
    '<script src="https://cdn.jsdelivr.net/npm/markdown-it@14.1.0/dist/markdown-it.min.js"></script>\n</head>\n<body>\n' +
    '<p><a href="index.html">← К списку</a></p>\n<h1>Новая страница</h1>\n<form id="f">\n' +
    '  <input name="title" placeholder="Заголовок" required>\n  <textarea name="markdown" placeholder="# Заголовок\\n\\nТекст в **markdown**..." required></textarea>\n' +
    '  <label>Время жизни: <select name="ttlDays"><option value="7">7 дней</option><option value="30" selected>30 дней</option><option value="90">90 дней</option></select></label>\n' +
    '  <input name="token" type="password" placeholder="Токен" required>\n  <button>Создать</button>\n</form>\n<div id="out"></div>\n<script>\n' +
    'var API="' + apiUrl + '";\n' +
    'document.getElementById("f").addEventListener("submit",function(e){\n' +
    '  e.preventDefault();var out=document.getElementById("out");out.textContent="Отправка…";\n' +
    '  var fd=Object.fromEntries(new FormData(e.target).entries());\n' +
    '  var body={action:"page",title:fd.title,token:fd.token,ttlDays:Number(fd.ttlDays),html:"<h1>"+fd.title.replace(/[&<>]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;"}[c];})+"</h1>"+window.markdownit({html:false,linkify:true,breaks:true}).render(fd.markdown)};\n' +
    '  fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})\n' +
    '    .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j};});})\n' +
    '    .then(function(res){if(res.ok){out.textContent="Готово: "+res.j.url;setTimeout(function(){location.href="index.html";},800);}else{out.textContent="Ошибка: "+(res.j.error||"неизвестно");}})\n' +
    '    .catch(function(err){out.textContent="Сбой сети: "+err;});\n' +
    '});\n</scr' + 'ipt>\n</body>\n</html>';
}
