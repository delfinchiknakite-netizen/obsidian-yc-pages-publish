// Render module: Mermaid-диаграммы (```mermaid). Рендерятся Mermaid.js с CDN в браузере зрителя.
var MERMAID_MODULE = (function () {
  var HEAD = '<script type="module">import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";mermaid.initialize({startOnLoad:true,securityLevel:"strict"});</scr' + 'ipt>';
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]; }); }
  return {
    id: 'mermaid',
    fence: function (info, content, ctx) {
      var lang = (info || '').trim().split(/\s+/)[0].toLowerCase();
      if (lang !== 'mermaid') return null;
      if (ctx && ctx.addHead) ctx.addHead(HEAD);
      return '<pre class="mermaid">' + esc(content) + '</pre>';
    },
    css: '.mermaid{margin:1em 0;text-align:center;background:#fff;overflow-x:auto}'
  };
})();
