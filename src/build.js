// Сборка самодостаточного main.js: вшивает qrcode-generator (без UMD-хвоста)
// перед исходным кодом плагина. Использование:
//   node build.js /путь/к/выходному/main.js
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const vendorFull = fs.readFileSync(path.join(dir, 'qrcode.js'), 'utf8');
const cut = vendorFull.indexOf('\n(function (factory)'); // срезаем UMD-хвост
const vendor = (cut >= 0 ? vendorFull.slice(0, cut) : vendorFull).trim();

let code = fs.readFileSync(path.join(dir, 'main.js'), 'utf8');
code = code.replace(/^'use strict';\s*\n/, ''); // strict ломает старую либу

const out =
  '/* ====================================================================\n' +
  ' * Vendored: qrcode-generator by Kazuhiko Arase (MIT). UMD-хвост срезан,\n' +
  ' * экспортируется в module-scope переменную qrcode. Не редактировать.\n' +
  ' * Сгенерировано build.js — правьте main.js, затем пересоберите.\n' +
  ' * ==================================================================== */\n' +
  vendor + '\n' +
  '/* ================= end vendored qrcode-generator ==================== */\n\n' +
  code;

const target = process.argv[2] || path.join(dir, 'dist', 'main.js');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, out);
console.log('wrote', target, out.length, 'bytes');
