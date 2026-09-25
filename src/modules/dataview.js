// Render module: Dataview — выполняет запрос ВО ВРЕМЯ публикации (через Dataview API)
// и вставляет статический результат. ```dataview (DQL) → queryMarkdown; ```dataviewjs → executeJs.
var DATAVIEW_MODULE = (function () {
  var md = (typeof markdownit !== 'undefined') ? markdownit({ html: false, linkify: true, breaks: true }) : null;
  function renderMd(s) { return md ? md.render(s) : ('<pre>' + String(s) + '</pre>'); }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]; }); }

  function getApi(ctx) {
    var p = ctx.app && ctx.app.plugins && ctx.app.plugins.plugins && ctx.app.plugins.plugins.dataview;
    return p && p.api ? p.api : null;
  }

  // Выполнить dataviewjs-код и вернуть отрендеренный HTML
  async function runJs(api, ctx, code) {
    var obs;
    try { obs = require('obsidian'); } catch (e) { obs = null; }
    if (!obs || !api.executeJs || typeof document === 'undefined') {
      return '<div class="ycp-dv-note">⚠️ dataviewjs требует Dataview и публикации из Obsidian</div>';
    }
    var container = document.createElement('div');
    var component = new obs.Component();
    component.load();
    try {
      await api.executeJs(code, container, component, ctx.sourcePath || '');
      // дать асинхронному рендеру (dv.pages/await) завершиться
      await new Promise(function (r) { setTimeout(r, 80); });
    } catch (e) {
      component.unload();
      return '<div class="ycp-dv-note">dataviewjs error: ' + esc(e && e.message || e) + '</div>';
    }
    var html = container.innerHTML;
    component.unload();
    // внутренние ссылки Obsidian на статике неактивны — оставляем как текст
    html = html.replace(/\sdata-href="[^"]*"/g, '').replace(/\shref="app:\/\/[^"]*"/g, '');
    return html || '<div class="ycp-dv-note">(dataviewjs: пусто)</div>';
  }

  return {
    id: 'dataview',
    preprocess: async function (markdown, ctx) {
      if (markdown.indexOf('```dataview') < 0) return markdown;
      var api = getApi(ctx);

      // 1) dataviewjs — исполняем
      var jsBlocks = [];
      markdown.replace(/```dataviewjs\s*\n([\s\S]*?)```/g, function (whole, code) { jsBlocks.push({ whole: whole, code: code }); return whole; });
      for (var j = 0; j < jsBlocks.length; j++) {
        var out = api ? await runJs(api, ctx, jsBlocks[j].code)
          : '<div class="ycp-dv-note">⚠️ dataviewjs требует Dataview и публикации из Obsidian</div>';
        markdown = markdown.replace(jsBlocks[j].whole, '\n\n' + ctx.hold('<div class="ycp-dataview ycp-dvjs">' + out + '</div>') + '\n\n');
      }

      // 2) dataview (DQL) — queryMarkdown
      if (!api) {
        return markdown.replace(/```dataview\s*\n[\s\S]*?```/g, function () {
          return '\n\n' + ctx.hold('<div class="ycp-dv-note">⚠️ Dataview недоступен при публикации</div>') + '\n\n';
        });
      }
      var blocks = [];
      markdown.replace(/```dataview\s*\n([\s\S]*?)```/g, function (whole, q) { blocks.push({ whole: whole, q: q }); return whole; });
      for (var i = 0; i < blocks.length; i++) {
        var htmlOut;
        try {
          var res = await api.queryMarkdown(blocks[i].q, ctx.sourcePath || '');
          if (res && res.successful) htmlOut = '<div class="ycp-dataview">' + renderMd(res.value) + '</div>';
          else htmlOut = '<div class="ycp-dv-note">Dataview: ' + (res && res.error ? res.error : 'ошибка') + '</div>';
        } catch (e) {
          htmlOut = '<div class="ycp-dv-note">Dataview error: ' + esc(e && e.message || e) + '</div>';
        }
        markdown = markdown.replace(blocks[i].whole, '\n\n' + ctx.hold(htmlOut) + '\n\n');
      }
      return markdown;
    },
    css: [
      '.ycp-dataview table{border-collapse:collapse;width:100%;margin:.5em 0}',
      '.ycp-dataview th,.ycp-dataview td{border:1px solid #e3e6ea;padding:6px 10px;text-align:left}',
      '.ycp-dataview th{background:#f4f5f7}',
      '.ycp-dataview a.internal-link{color:#0a58ca;text-decoration:none}',
      '.ycp-dvjs ul{padding-left:1.4em}',
      '.ycp-dv-note{background:#fff7e6;border:1px solid #ffe1a8;border-radius:8px;padding:8px 12px;color:#8a6d1a;margin:1em 0}'
    ].join('')
  };
})();
