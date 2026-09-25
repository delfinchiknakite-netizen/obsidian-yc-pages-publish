// Render module: Dataview — выполняет запрос ВО ВРЕМЯ публикации и вставляет статику.
// ```dataview (DQL) → queryMarkdown; ```dataviewjs → executeJs (+ canvas-графики → картинки).
var DATAVIEW_MODULE = (function () {
  var md = (typeof markdownit !== 'undefined') ? markdownit({ html: false, linkify: true, breaks: true }) : null;
  function renderMd(s) { return md ? md.render(s) : ('<pre>' + String(s) + '</pre>'); }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]; }); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // Закрывающий ``` только в начале строки — иначе вложенные ``` внутри кода рвут блок.
  var JS_RE = /(?:^|\n)```dataviewjs[ \t]*\n([\s\S]*?)\n```[ \t]*(?=\n|$)/g;
  var DQL_RE = /(?:^|\n)```dataview[ \t]*\n([\s\S]*?)\n```[ \t]*(?=\n|$)/g;

  function getApi(ctx) {
    var p = ctx.app && ctx.app.plugins && ctx.app.plugins.plugins && ctx.app.plugins.plugins.dataview;
    return p && p.api ? p.api : null;
  }

  function collect(re, markdown) {
    var out = [];
    var m;
    re.lastIndex = 0;
    while ((m = re.exec(markdown))) out.push({ whole: m[0], code: m[1] });
    return out;
  }

  // Выполнить dataviewjs и вернуть HTML; canvas-графики конвертируются в <img>.
  async function runJs(api, ctx, code) {
    var obs;
    try { obs = require('obsidian'); } catch (e) { obs = null; }
    if (!obs || !api.executeJs || typeof document === 'undefined') {
      return '<div class="ycp-dv-note">⚠️ dataviewjs требует Dataview и публикации из Obsidian</div>';
    }
    var container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-99999px;top:0;width:700px';
    document.body.appendChild(container);
    var component = new obs.Component();
    component.load();
    try {
      await api.executeJs(code, container, component, ctx.sourcePath || '');
      await sleep(150);
      if (container.querySelector('canvas')) await sleep(1400); // дать графику дорисоваться
      var cvs = container.querySelectorAll('canvas');
      for (var i = 0; i < cvs.length; i++) {
        try {
          var img = document.createElement('img');
          img.src = cvs[i].toDataURL('image/png');
          img.style.maxWidth = '100%';
          cvs[i].replaceWith(img);
        } catch (e) { /* tainted canvas — пропускаем */ }
      }
    } catch (e) {
      component.unload(); container.remove();
      return '<div class="ycp-dv-note">dataviewjs error: ' + esc(e && e.message || e) + '</div>';
    }
    var html = container.innerHTML;
    component.unload(); container.remove();
    if (/Evaluation Error/i.test(html)) {
      return '<div class="ycp-dv-note">dataviewjs: ошибка выполнения при публикации (см. консоль Obsidian).</div>';
    }
    html = html.replace(/\sdata-href="[^"]*"/g, '').replace(/\shref="app:\/\/[^"]*"/g, '');
    return html || '<div class="ycp-dv-note">(dataviewjs: пусто)</div>';
  }

  return {
    id: 'dataview',
    preprocess: async function (markdown, ctx) {
      if (markdown.indexOf('```dataview') < 0) return markdown;
      var api = getApi(ctx);

      // 1) dataviewjs
      var jsBlocks = collect(JS_RE, markdown);
      for (var j = 0; j < jsBlocks.length; j++) {
        var out = api ? await runJs(api, ctx, jsBlocks[j].code)
          : '<div class="ycp-dv-note">⚠️ dataviewjs требует Dataview и публикации из Obsidian</div>';
        markdown = markdown.replace(jsBlocks[j].whole, '\n\n' + ctx.hold('<div class="ycp-dataview ycp-dvjs">' + out + '</div>') + '\n\n');
      }

      // 2) dataview (DQL)
      var blocks = collect(DQL_RE, markdown);
      for (var i = 0; i < blocks.length; i++) {
        var htmlOut;
        if (!api) {
          htmlOut = '<div class="ycp-dv-note">⚠️ Dataview недоступен при публикации</div>';
        } else {
          try {
            var res = await api.queryMarkdown(blocks[i].code, ctx.sourcePath || '');
            htmlOut = (res && res.successful)
              ? '<div class="ycp-dataview">' + renderMd(res.value) + '</div>'
              : '<div class="ycp-dv-note">Dataview: ' + (res && res.error ? res.error : 'ошибка') + '</div>';
          } catch (e) {
            htmlOut = '<div class="ycp-dv-note">Dataview error: ' + esc(e && e.message || e) + '</div>';
          }
        }
        markdown = markdown.replace(blocks[i].whole, '\n\n' + ctx.hold(htmlOut) + '\n\n');
      }
      return markdown;
    },
    css: [
      '.ycp-dataview table{border-collapse:collapse;width:100%;margin:.5em 0}',
      '.ycp-dataview th,.ycp-dataview td{border:1px solid #e3e6ea;padding:6px 10px;text-align:left}',
      '.ycp-dataview th{background:#f4f5f7}',
      '.ycp-dataview img{max-width:100%}',
      '.ycp-dataview a.internal-link{color:#0a58ca;text-decoration:none}',
      '.ycp-dvjs ul{padding-left:1.4em}',
      '.ycp-dv-note{background:#fff7e6;border:1px solid #ffe1a8;border-radius:8px;padding:8px 12px;color:#8a6d1a;margin:1em 0}'
    ].join('')
  };
})();
