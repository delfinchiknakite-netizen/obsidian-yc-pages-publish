// Render module: доски Kanban → колонки с карточками.
var KANBAN_MODULE = (function () {
  var md = (typeof markdownit !== 'undefined') ? markdownit({ html: false, linkify: true, breaks: true }) : null;
  function inline(s) { return md ? md.renderInline(s) : String(s).replace(/[&<>]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]; }); }

  function isKanban(markdown, ctx) {
    if (ctx && ctx.frontmatter && ctx.frontmatter['kanban-plugin']) return true;
    return markdown.indexOf('kanban:settings') >= 0;
  }

  return {
    id: 'kanban',
    renderFull: function (markdown, ctx) {
      if (!isKanban(markdown, ctx)) return null;
      // выкинуть служебный блок настроек
      var body = markdown.replace(/%%[\s\S]*?kanban:settings[\s\S]*?%%/g, '').trim();
      var lines = body.split('\n');
      var columns = [];
      var cur = null;
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var h = line.match(/^##\s+(.*)$/);
        if (h) { cur = { title: h[1].trim(), cards: [] }; columns.push(cur); continue; }
        var item = line.match(/^\s*-\s*(?:\[( |x|X)\]\s*)?(.*)$/);
        if (item && cur) {
          var txt = item[2].trim();
          if (txt === '' || /^\*\*.*\*\*$/.test(txt) && txt.indexOf('Complete') >= 0) { /* skip */ }
          cur.cards.push({ done: /[xX]/.test(item[1] || ''), text: txt });
        }
      }
      if (!columns.length) return null;
      var cols = columns.map(function (c) {
        var cards = c.cards.filter(function (x) { return x.text; }).map(function (x) {
          return '<div class="ycp-kcard' + (x.done ? ' done' : '') + '">' +
            (x.done ? '<span class="ycp-kdone">✓</span>' : '') + '<span>' + inline(x.text) + '</span></div>';
        }).join('');
        return '<div class="ycp-kcol"><div class="ycp-kcol-h">' + inline(c.title) +
          ' <span class="ycp-kcnt">' + c.cards.filter(function (x) { return x.text; }).length + '</span></div>' + cards + '</div>';
      }).join('');
      return '<div class="ycp-kanban">' + cols + '</div>';
    },
    css: [
      '.ycp-kanban{display:flex;gap:12px;overflow-x:auto;padding:6px 0;align-items:flex-start}',
      '.ycp-kcol{flex:0 0 240px;background:#f4f5f7;border-radius:10px;padding:8px}',
      '.ycp-kcol-h{font-weight:700;padding:4px 6px 8px;display:flex;align-items:center;gap:6px}',
      '.ycp-kcnt{font-size:12px;color:#888;background:#e2e5e9;border-radius:20px;padding:0 7px}',
      '.ycp-kcard{background:#fff;border:1px solid #e3e6ea;border-radius:8px;padding:8px 10px;margin:6px 0;box-shadow:0 1px 1px rgba(0,0,0,.04);display:flex;gap:7px;align-items:flex-start}',
      '.ycp-kcard.done{opacity:.6}',
      '.ycp-kcard.done>span:last-child{text-decoration:line-through}',
      '.ycp-kdone{color:#2ec16b;font-weight:700}'
    ].join('')
  };
})();
