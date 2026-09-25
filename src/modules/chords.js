// Render module: гитарные аккорды (```chords / ```chordpro).
// Рендерит аккорды над текстом (моноширинно) + SVG-диаграммы для известных аккордов.
var CHORDS_MODULE = (function () {
  // Аппликатуры (6 струн, от низкой E к высокой): -1 = не звучит (×), 0 = открытая.
  var SHAPES = {
    'E': [0,2,2,1,0,0], 'Em': [0,2,2,0,0,0], 'E7': [0,2,0,1,0,0], 'Em7': [0,2,0,0,0,0], 'Esus4': [0,2,2,2,0,0],
    'A': [-1,0,2,2,2,0], 'Am': [-1,0,2,2,1,0], 'A7': [-1,0,2,0,2,0], 'Am7': [-1,0,2,0,1,0],
    'Amaj7': [-1,0,2,1,2,0], 'Asus2': [-1,0,2,2,0,0], 'Asus4': [-1,0,2,2,3,0], 'Aadd9': [-1,0,2,4,2,0],
    'D': [-1,-1,0,2,3,2], 'Dm': [-1,-1,0,2,3,1], 'D7': [-1,-1,0,2,1,2], 'Dm7': [-1,-1,0,2,1,1],
    'Dsus2': [-1,-1,0,2,3,0], 'Dsus4': [-1,-1,0,2,3,3], 'Dmaj7': [-1,-1,0,2,2,2],
    'G': [3,2,0,0,0,3], 'G7': [3,2,0,0,0,1], 'Gmaj7': [3,2,0,0,0,2], 'Gm': [3,5,5,3,3,3], 'G/B': [-1,2,0,0,0,3],
    'C': [-1,3,2,0,1,0], 'C7': [-1,3,2,3,1,0], 'Cmaj7': [-1,3,2,0,0,0], 'Cadd9': [-1,3,2,0,3,0],
    'Cm': [-1,3,5,5,4,3], 'Csus4': [-1,3,3,0,1,1],
    'F': [1,3,3,2,1,1], 'Fmaj7': [-1,-1,3,2,1,0], 'Fm': [1,3,3,1,1,1],
    'B': [-1,2,4,4,4,2], 'Bm': [-1,2,4,4,3,2], 'B7': [-1,2,1,2,0,2], 'Bb': [-1,1,3,3,3,1], 'Bbm': [-1,1,3,3,2,1],
    'F#m': [2,4,4,2,2,2], 'F#': [2,4,4,3,2,2], 'C#m': [-1,4,6,6,5,4], 'G#m': [4,6,6,4,4,4],
    'D/F#': [2,-1,0,2,3,2], 'A/C#': [-1,4,2,2,2,0]
  };

  var CHORD_RE = /^[A-G](#|b)?(maj7|maj9|maj|min|m|dim7|dim|aug|sus2|sus4|sus|add9|add|7|9|11|13|6|5|2|4)*(\/[A-G](#|b)?)?$/;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; });
  }
  function isChord(tok) { return CHORD_RE.test(tok) && /[A-G]/.test(tok[0]); }

  function chordSvg(name, pos) {
    var strings = 6, W = 58, H = 74, padL = 10, padR = 9, padT = 18, padB = 8;
    var gw = (W - padL - padR) / (strings - 1);
    var shown = 4;
    var fretted = pos.filter(function (p) { return p > 0; });
    var maxF = fretted.length ? Math.max.apply(null, fretted) : 0;
    var minF = fretted.length ? Math.min.apply(null, fretted) : 0;
    var base = (maxF > shown) ? minF : 1;
    var gh = (H - padT - padB) / shown;
    var s = '<svg class="ycp-chord-svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" xmlns="http://www.w3.org/2000/svg">';
    s += '<text x="' + (W / 2) + '" y="9" text-anchor="middle" class="ycp-cn">' + esc(name) + '</text>';
    var i, x, y;
    for (i = 0; i < strings; i++) { x = padL + i * gw; s += '<line x1="' + x + '" y1="' + padT + '" x2="' + x + '" y2="' + (padT + shown * gh) + '"/>'; }
    for (i = 0; i <= shown; i++) { y = padT + i * gh; var w = (base === 1 && i === 0) ? 2.4 : 0.7; s += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke-width="' + w + '"/>'; }
    if (base > 1) s += '<text x="' + (padL - 3) + '" y="' + (padT + gh * 0.72) + '" text-anchor="end" class="ycp-bf">' + base + 'fr</text>';
    for (i = 0; i < strings; i++) {
      x = padL + i * gw;
      if (pos[i] === -1) s += '<text x="' + x + '" y="' + (padT - 3) + '" text-anchor="middle" class="ycp-mx">×</text>';
      else if (pos[i] === 0) s += '<circle cx="' + x + '" cy="' + (padT - 5) + '" r="2.2" class="ycp-open"/>';
    }
    for (i = 0; i < strings; i++) {
      if (pos[i] > 0) {
        var rel = pos[i] - base + 1;
        if (rel >= 1 && rel <= shown) { x = padL + i * gw; y = padT + (rel - 0.5) * gh; s += '<circle cx="' + x + '" cy="' + y + '" r="3" class="ycp-dot"/>'; }
      }
    }
    return s + '</svg>';
  }

  function renderBlock(info, content) {
    var lines = content.replace(/\s+$/, '').split('\n');
    var used = {};
    var order = [];
    var mark = function (name) { if (SHAPES[name] && !used[name]) { used[name] = 1; order.push(name); } };
    var out = [];

    if (/chordpro/i.test(info)) {
      // inline [C]lyrics
      lines.forEach(function (line) {
        out.push(esc(line).replace(/\[([A-G][^\]]*)\]/g, function (m, ch) { mark(ch); return '<span class="ycp-chord">' + esc(ch) + '</span>'; }));
      });
    } else {
      lines.forEach(function (line) {
        var toks = line.trim() === '' ? [] : line.trim().split(/\s+/);
        var chords = toks.filter(isChord);
        var isChordLine = toks.length > 0 && chords.length / toks.length >= 0.6;
        if (isChordLine) {
          out.push(line.replace(/(\S+)/g, function (tok) {
            if (isChord(tok)) { mark(tok); return '<span class="ycp-chord">' + esc(tok) + '</span>'; }
            return esc(tok);
          }));
        } else {
          out.push(esc(line));
        }
      });
    }

    var diagrams = '';
    if (order.length) {
      diagrams = '<div class="ycp-diagrams">' + order.map(function (n) { return chordSvg(n, SHAPES[n]); }).join('') + '</div>';
    }
    return '<div class="ycp-chords">' + diagrams + '<pre class="ycp-chordtext">' + out.join('\n') + '</pre></div>';
  }

  return {
    id: 'chords',
    langs: ['chords', 'chordpro', 'chord', 'chords-sheet'],
    fence: function (info, content) {
      var lang = (info || '').trim().split(/\s+/)[0].toLowerCase();
      if (this.langs.indexOf(lang) < 0) return null;
      return renderBlock(info, content);
    },
    css: [
      '.ycp-chords{margin:1em 0}',
      '.ycp-chordtext{background:#faf8f4;border:1px solid #eee;border-radius:6px;padding:12px;overflow:auto;white-space:pre;font-family:ui-monospace,Menlo,monospace;line-height:1.5}',
      '.ycp-chord{color:#c0392b;font-weight:700}',
      '.ycp-diagrams{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 12px}',
      '.ycp-chord-svg{background:#fff;border:1px solid #eee;border-radius:6px}',
      '.ycp-chord-svg line{stroke:#333}',
      '.ycp-chord-svg .ycp-dot{fill:#c0392b}',
      '.ycp-chord-svg .ycp-open{fill:none;stroke:#333;stroke-width:.7}',
      '.ycp-chord-svg .ycp-cn{font:700 8px sans-serif;fill:#222}',
      '.ycp-chord-svg .ycp-mx{font:6px sans-serif;fill:#666}',
      '.ycp-chord-svg .ycp-bf{font:5px sans-serif;fill:#666}'
    ].join('')
  };
})();
