// Render module: Dataview — выполняет запрос ВО ВРЕМЯ публикации (через Dataview API)
// и вставляет статический результат. Требует установленный Dataview.
var DATAVIEW_MODULE = (function () {
  var md = (typeof markdownit !== 'undefined') ? markdownit({ html: false, linkify: true, breaks: true }) : null;
  function renderMd(s) { return md ? md.render(s) : ('<pre>' + String(s) + '</pre>'); }

  function getApi(ctx) {
    var p = ctx.app && ctx.app.plugins && ctx.app.plugins.plugins && ctx.app.plugins.plugins.dataview;
    return p && p.api ? p.api : null;
  }

  return {
    id: 'dataview',
    preprocess: async function (markdown, ctx) {
      if (markdown.indexOf('```dataview') < 0) return markdown;
      var api = getApi(ctx);

      // dataviewjs — статически не выполняем
      markdown = markdown.replace(/```dataviewjs\s*\n[\s\S]*?```/g, function () {
        return '\n\n' + ctx.hold('<div class="ycp-dv-note">⚠️ dataviewjs не поддерживается на статическом сайте</div>') + '\n\n';
      });

      if (!api) {
        return markdown.replace(/```dataview\s*\n[\s\S]*?```/g, function () {
          return '\n\n' + ctx.hold('<div class="ycp-dv-note">⚠️ Dataview недоступен при публикации</div>') + '\n\n';
        });
      }

      var blocks = [];
      markdown.replace(/```dataview\s*\n([\s\S]*?)```/g, function (whole, q) { blocks.push({ whole: whole, q: q }); return whole; });
      for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i];
        var htmlOut;
        try {
          var res = await api.queryMarkdown(b.q, ctx.sourcePath || '');
          if (res && res.successful) htmlOut = '<div class="ycp-dataview">' + renderMd(res.value) + '</div>';
          else htmlOut = '<div class="ycp-dv-note">Dataview: ' + (res && res.error ? res.error : 'ошибка') + '</div>';
        } catch (e) {
          htmlOut = '<div class="ycp-dv-note">Dataview error: ' + String(e && e.message || e) + '</div>';
        }
        markdown = markdown.replace(b.whole, '\n\n' + ctx.hold(htmlOut) + '\n\n');
      }
      return markdown;
    },
    css: [
      '.ycp-dataview table{border-collapse:collapse;width:100%;margin:.5em 0}',
      '.ycp-dataview th,.ycp-dataview td{border:1px solid #e3e6ea;padding:6px 10px;text-align:left}',
      '.ycp-dataview th{background:#f4f5f7}',
      '.ycp-dv-note{background:#fff7e6;border:1px solid #ffe1a8;border-radius:8px;padding:8px 12px;color:#8a6d1a;margin:1em 0}'
    ].join('')
  };
})();
