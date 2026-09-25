// Render module: Obsidian callouts (> [!note] ...) → красивые боксы.
var CALLOUTS_MODULE = (function () {
  var ICON = {
    note: 'ℹ️', info: 'ℹ️', abstract: '📄', summary: '📄', tldr: '📄',
    tip: '💡', hint: '💡', important: '💡',
    success: '✅', check: '✅', done: '✅',
    question: '❓', help: '❓', faq: '❓',
    warning: '⚠️', caution: '⚠️', attention: '⚠️',
    failure: '❌', fail: '❌', missing: '❌',
    danger: '🛑', error: '🛑', bug: '🐞',
    example: '📋', quote: '❝', cite: '❝', todo: '☑️'
  };
  var COLOR = {
    note: '#448aff', info: '#448aff', abstract: '#00b0ff', summary: '#00b0ff', tldr: '#00b0ff',
    tip: '#00bfa5', hint: '#00bfa5', important: '#00bfa5',
    success: '#2ec16b', check: '#2ec16b', done: '#2ec16b',
    question: '#e6b800', help: '#e6b800', faq: '#e6b800',
    warning: '#e08d00', caution: '#e08d00', attention: '#e08d00',
    failure: '#e5484d', fail: '#e5484d', missing: '#e5484d',
    danger: '#e5484d', error: '#e5484d', bug: '#e5484d',
    example: '#7c4dff', quote: '#9e9e9e', cite: '#9e9e9e', todo: '#448aff'
  };
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  return {
    id: 'callouts',
    postprocessHtml: function (html) {
      return html.replace(/<blockquote>\s*([\s\S]*?)<\/blockquote>/g, function (whole, inner) {
        var m = inner.match(/^\s*<p>\s*\[!([\w-]+)\][+-]?\s*([^\n<]*)/);
        if (!m) return whole;
        var type = m[1].toLowerCase();
        var title = m[2].trim();
        var color = COLOR[type] || '#448aff';
        var icon = ICON[type] || 'ℹ️';
        var bodyHtml = inner.replace(/^\s*<p>\s*\[![\w-]+\][+-]?\s*[^\n<]*(<br>\s*\n?)?/, '<p>');
        bodyHtml = bodyHtml.replace(/<p>\s*<\/p>/g, '');
        return '<div class="ycp-callout" style="--cc:' + color + '">' +
          '<div class="ycp-callout-title"><span class="ycp-callout-ic">' + icon + '</span>' + (title || cap(type)) + '</div>' +
          (bodyHtml.trim() ? '<div class="ycp-callout-body">' + bodyHtml + '</div>' : '') +
          '</div>';
      });
    },
    css: [
      '.ycp-callout{border:1px solid #e6e6e6;border-left:4px solid var(--cc,#448aff);border-radius:8px;padding:10px 14px;margin:1em 0;background:color-mix(in srgb,var(--cc,#448aff) 7%,#fff)}',
      '.ycp-callout-title{font-weight:700;color:var(--cc,#448aff);display:flex;align-items:center;gap:8px}',
      '.ycp-callout-ic{font-size:1.05em}',
      '.ycp-callout-body{margin-top:4px}',
      '.ycp-callout-body>p:first-child{margin-top:0}',
      '.ycp-callout-body>p:last-child{margin-bottom:0}'
    ].join('')
  };
})();
