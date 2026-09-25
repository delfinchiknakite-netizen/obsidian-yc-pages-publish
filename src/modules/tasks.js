// Render module: задачи плагина Tasks.
// Преобразует пункты списка вида "- [ ] текст 📅 2026-09-26 ⏫ #tag" в красивые карточки.
var TASKS_MODULE = (function () {
  var PRIORITY = { '🔺': ['highest', 'высший'], '⏫': ['high', 'высокий'], '🔼': ['medium', 'средний'], '🔽': ['low', 'низкий'], '⏬': ['lowest', 'низший'] };
  var DATES = [
    ['📅', 'due', 'до'], ['⏳', 'scheduled', 'запланировано'], ['🛫', 'start', 'старт'],
    ['✅', 'done', 'готово'], ['➕', 'created', 'создано'], ['❌', 'cancelled', 'отменено']
  ];

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; });
  }

  function parseTask(text, checked) {
    var badges = [];
    var body = text;

    Object.keys(PRIORITY).forEach(function (e) {
      if (body.indexOf(e) >= 0) {
        var p = PRIORITY[e];
        badges.push('<span class="ycp-badge pri-' + p[0] + '">' + e + ' ' + p[1] + '</span>');
        body = body.split(e).join(' ');
      }
    });
    DATES.forEach(function (d) {
      var re = new RegExp(d[0] + '\\s*(\\d{4}-\\d{2}-\\d{2})');
      var m = body.match(re);
      if (m) {
        badges.push('<span class="ycp-badge date-' + d[1] + '">' + d[0] + ' ' + d[2] + ' ' + m[1] + '</span>');
        body = body.replace(re, ' ');
      }
    });
    var rec = body.match(/🔁\s*([^📅⏳🛫✅➕❌#]+)/);
    if (rec) { badges.push('<span class="ycp-badge rec">🔁 ' + esc(rec[1].trim()) + '</span>'); body = body.replace(rec[0], ' '); }
    body = body.replace(/🆔\s*\S+/g, ' ').replace(/⛔\s*\S+/g, ' ');

    // #теги — в отдельные значки
    body = body.replace(/(^|\s)#([\wа-яё\-\/]+)/gi, function (m0, sp, tag) { badges.push('<span class="ycp-badge tag">#' + esc(tag) + '</span>'); return sp; });

    body = esc(body.replace(/\s{2,}/g, ' ').trim());
    var box = checked ? '<span class="ycp-check done">✓</span>' : '<span class="ycp-check"></span>';
    return '<li class="ycp-task' + (checked ? ' is-done' : '') + '">' + box +
      '<span class="ycp-task-body">' + body + (badges.length ? ' <span class="ycp-badges">' + badges.join('') + '</span>' : '') + '</span></li>';
  }

  var LI_RE = /<li>([\s\S]*?)<\/li>/g;
  var TASK_RE = /^\s*(?:<p>)?\s*\[([ xX/\-])\]\s*([\s\S]*?)(?:<\/p>)?\s*$/;

  return {
    id: 'tasks',
    postprocessHtml: function (html) {
      return html.replace(LI_RE, function (whole, inner) {
        var m = inner.match(TASK_RE);
        if (!m) return whole;
        var checked = /[xX]/.test(m[1]);
        return parseTask(m[2], checked);
      });
    },
    css: [
      'ul:has(> .ycp-task){list-style:none;padding-left:0}',
      '.ycp-task{list-style:none;display:flex;align-items:flex-start;gap:8px;padding:7px 10px;margin:5px 0;border:1px solid #eee;border-radius:8px;background:#fff}',
      '.ycp-task.is-done{opacity:.6}',
      '.ycp-task.is-done .ycp-task-body{text-decoration:line-through}',
      '.ycp-check{flex:0 0 auto;width:17px;height:17px;border:2px solid #b7c0cc;border-radius:5px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;color:#fff;margin-top:2px}',
      '.ycp-check.done{background:#2ec16b;border-color:#2ec16b}',
      '.ycp-task-body{flex:1}',
      '.ycp-badges{display:inline-flex;flex-wrap:wrap;gap:5px;margin-left:6px;vertical-align:middle}',
      '.ycp-badge{font-size:12px;padding:1px 7px;border-radius:20px;background:#eef1f5;color:#445}',
      '.ycp-badge.date-due{background:#fdeaea;color:#c0392b}',
      '.ycp-badge.date-done{background:#e8f7ee;color:#1e8a4c}',
      '.ycp-badge.pri-high,.ycp-badge.pri-highest{background:#fdeaea;color:#c0392b}',
      '.ycp-badge.pri-low,.ycp-badge.pri-lowest{background:#eef4fb;color:#2f6fb0}',
      '.ycp-badge.tag{background:#f0ecff;color:#6b46c1}',
      '.ycp-badge.rec{background:#fff5e6;color:#b9770e}'
    ].join('')
  };
})();
