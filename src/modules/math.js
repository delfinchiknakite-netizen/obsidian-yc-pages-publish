// Render module: LaTeX-математика ($...$, $$...$$) через KaTeX (auto-render с CDN).
// Защищает формулы от markdown-it (плейсхолдеры) и добавляет KaTeX в <head> страницы.
var MATH_MODULE = (function () {
  var KX = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/';
  var HEAD = [
    '<link rel="stylesheet" href="' + KX + 'katex.min.css">',
    '<script defer src="' + KX + 'katex.min.js"></script>',
    '<script defer src="' + KX + 'contrib/auto-render.min.js" onload="renderMathInElement(document.body,{delimiters:[{left:\'$$\',right:\'$$\',display:true},{left:\'$\',right:\'$\',display:false}],throwOnError:false})"></script>'
  ].join('\n');

  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]; }); }

  return {
    id: 'math',
    preprocess: function (markdown, ctx) {
      var found = false;
      // display $$...$$
      var out = markdown.replace(/\$\$([\s\S]+?)\$\$/g, function (m, body) {
        found = true;
        return ctx.hold('<div class="ycp-math-display">$$' + esc(body) + '$$</div>');
      });
      // inline $...$ (не пустое, без переносов, не задевает $$)
      out = out.replace(/(^|[^\\$])\$(?!\s)([^\n$]+?)(?<!\s)\$(?!\$)/g, function (m, pre, body) {
        found = true;
        return pre + ctx.hold('<span class="ycp-math">$' + esc(body) + '$</span>');
      });
      if (found) ctx.addHead(HEAD);
      return out;
    },
    css: '.ycp-math-display{overflow-x:auto;margin:1em 0}'
  };
})();
