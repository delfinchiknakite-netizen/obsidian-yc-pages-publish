// Render module: Excalidraw — встроенные рисунки ![[Название.excalidraw]] экспортируются
// в SVG во время публикации (через ExcalidrawAutomate API) и вставляются инлайн.
var EXCALIDRAW_MODULE = (function () {
  var EMBED_RE = /!\[\[([^\]|]+?\.excalidraw)(?:\.md)?(?:\|([^\]]*))?\]\]/g;

  function getEA(ctx) {
    var p = ctx.app && ctx.app.plugins && ctx.app.plugins.plugins && ctx.app.plugins.plugins['obsidian-excalidraw-plugin'];
    if (!p) return null;
    return p.ea || (typeof window !== 'undefined' && window.ExcalidrawAutomate) || null;
  }

  async function toSvg(ea, file, ctx) {
    // разные версии плагина — пробуем известные сигнатуры createSVG
    if (ea && typeof ea.reset === 'function') { try { ea.reset(); } catch (e) {} }
    var svg = null;
    if (ea && typeof ea.createSVG === 'function') {
      try { svg = await ea.createSVG(file.path, false, {}, null, 'light', 8); }
      catch (e1) {
        try { svg = await ea.createSVG(file.path); } catch (e2) {}
      }
    }
    if (svg && svg.outerHTML) {
      // подчистим фиксированные размеры, чтобы вписывался
      try { svg.removeAttribute('width'); svg.removeAttribute('height'); svg.style.maxWidth = '100%'; svg.style.height = 'auto'; } catch (e) {}
      return svg.outerHTML;
    }
    return null;
  }

  return {
    id: 'excalidraw',
    preprocess: async function (markdown, ctx) {
      if (markdown.indexOf('.excalidraw') < 0) return markdown;
      var ea = getEA(ctx);
      var app = ctx.app;
      var matches = [];
      markdown.replace(EMBED_RE, function (whole, link) { matches.push({ whole: whole, link: link }); return whole; });

      for (var i = 0; i < matches.length; i++) {
        var mm = matches[i];
        var out;
        try {
          var dest = app && app.metadataCache.getFirstLinkpathDest(mm.link, ctx.sourcePath || '');
          if (dest && ea) {
            var svgHtml = await toSvg(ea, dest, ctx);
            out = svgHtml ? '<figure class="ycp-excalidraw">' + svgHtml + '</figure>'
              : '<div class="ycp-dv-note">✏️ Не удалось экспортировать рисунок: ' + mm.link + '</div>';
          } else {
            out = '<div class="ycp-dv-note">✏️ Excalidraw недоступен: ' + mm.link + '</div>';
          }
        } catch (e) {
          out = '<div class="ycp-dv-note">Excalidraw error: ' + String(e && e.message || e) + '</div>';
        }
        markdown = markdown.replace(mm.whole, '\n\n' + ctx.hold(out) + '\n\n');
      }
      return markdown;
    },
    css: [
      '.ycp-excalidraw{margin:1em 0;text-align:center}',
      '.ycp-excalidraw svg{max-width:100%;height:auto;border:1px solid #eee;border-radius:8px;background:#fff}'
    ].join('')
  };
})();
