'use strict';

const { Plugin, PluginSettingTab, Setting, Notice, Modal, TFile, TFolder, requestUrl } = require('obsidian');

const DEFAULT_SETTINGS = {
  apiUrl: '',
  token: '',
  defaultTtl: 7,
  concurrency: 5,
  linksNote: 'Ссылка на сайты.md',
  bootstrapped: false,
};

const TTL_OPTIONS = [7, 30, 90];
const IMG_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'];

module.exports = class YcPagesPublishPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.setupRenderer();

    // Меню файла/папки (десктоп — ПКМ; мобайл — долгое нажатие в проводнике)
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, item) => {
        if (item instanceof TFile && item.extension === 'md') {
          menu.addItem((mi) =>
            mi.setTitle('Опубликовать как сайт').setIcon('globe').onClick(() => this.startPublishNote(item))
          );
        } else if (item instanceof TFolder) {
          menu.addItem((mi) =>
            mi.setTitle('Создать сайт из папки').setIcon('folder').onClick(() => this.startPublishFolder(item))
          );
        }
      })
    );

    // Меню редактора (мобайл: «•••» / долгое нажатие в тексте заметки)
    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu, editor, view) => {
        const file = view && view.file;
        if (file && file.extension === 'md') {
          menu.addItem((mi) =>
            mi.setTitle('Опубликовать как сайт').setIcon('globe').onClick(() => this.startPublishNote(file))
          );
        }
      })
    );

    // Иконка на панели (видна и на телефоне) — публикует активную заметку
    this.addRibbonIcon('globe', 'Опубликовать как сайт', () => {
      const file = this.app.workspace.getActiveFile();
      if (file && file.extension === 'md') this.startPublishNote(file);
      else new Notice('Откройте .md заметку');
    });

    this.addCommand({
      id: 'publish-active-note',
      name: 'Опубликовать как сайт',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const ok = file && file.extension === 'md';
        if (checking) return !!ok;
        if (ok) this.startPublishNote(file);
        return true;
      },
    });

    this.addSettingTab(new YcPagesSettingTab(this.app, this));
  }

  makeQr(url, cell) {
    try {
      if (typeof qrcode === 'undefined') return null;
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      return qr.createDataURL(cell || 6, 4);
    } catch (e) {
      console.warn('[yc-pages] qr fail', e);
      return null;
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }

  // ---- рендер HTML внутри плагина + реестр модулей ----
  setupRenderer() {
    this.renderModules = [];
    const add = (m) => { if (typeof m !== 'undefined' && m) this.renderModules.push(m); };
    // порядок: fence/postprocess нейтральны; preprocess идёт dataview→excalidraw→math
    add(typeof CHORDS_MODULE !== 'undefined' ? CHORDS_MODULE : undefined);
    add(typeof TASKS_MODULE !== 'undefined' ? TASKS_MODULE : undefined);
    add(typeof CALLOUTS_MODULE !== 'undefined' ? CALLOUTS_MODULE : undefined);
    add(typeof KANBAN_MODULE !== 'undefined' ? KANBAN_MODULE : undefined);
    add(typeof DATAVIEW_MODULE !== 'undefined' ? DATAVIEW_MODULE : undefined);
    add(typeof EXCALIDRAW_MODULE !== 'undefined' ? EXCALIDRAW_MODULE : undefined);
    add(typeof MATH_MODULE !== 'undefined' ? MATH_MODULE : undefined);

    const self = this;
    if (typeof markdownit !== 'undefined') {
      this.md = markdownit({ html: false, linkify: true, breaks: true });
      const defaultFence = this.md.renderer.rules.fence
        || function (tokens, idx, options, env, slf) { return slf.renderToken(tokens, idx, options); };
      this.md.renderer.rules.fence = function (tokens, idx, options, env, slf) {
        const info = (tokens[idx].info || '').trim();
        for (const m of self.renderModules) {
          if (m.fence) {
            const out = m.fence(info, tokens[idx].content, env || {});
            if (out != null) return out;
          }
        }
        return defaultFence(tokens, idx, options, env, slf);
      };
    } else {
      this.md = null;
    }
  }

  // Публичный API: сторонний код может добавить свой модуль генерации HTML
  registerRenderModule(mod) {
    if (mod && this.renderModules) this.renderModules.push(mod);
  }

  aggCss() { return this.renderModules.map((m) => m.css || '').join(''); }

  // markdown → { html, css, head } с прогоном через модули (async)
  async renderNote(markdown, ctx) {
    ctx = ctx || {};
    if (!this.md) return { html: escapeForFallback(markdown), css: '', head: '' };

    // whole-note override (напр. Kanban)
    for (const m of this.renderModules) {
      if (m.renderFull) {
        try { const h = m.renderFull(markdown, ctx); if (h != null) return { html: h, css: this.aggCss(), head: '' }; }
        catch (e) { console.warn('[yc-pages] module ' + m.id, e); }
      }
    }

    // helpers: плейсхолдеры (для async-блоков) и <head>
    let phi = 0;
    const ph = {};
    const heads = [];
    ctx.hold = (h) => { const id = 'YCPH' + (phi++); ph[id] = h; return '@@' + id + '@@'; };
    ctx.addHead = (h) => { if (h && heads.indexOf(h) < 0) heads.push(h); };

    // async preprocess (dataview, excalidraw, math)
    let mdText = markdown || '';
    for (const m of this.renderModules) {
      if (m.preprocess) {
        try { mdText = await m.preprocess(mdText, ctx); }
        catch (e) { console.warn('[yc-pages] module ' + m.id, e); }
      }
    }

    // базовый рендер (sync fence: chords)
    let html = this.md.render(mdText, ctx);

    // sync postprocess (tasks, callouts)
    for (const m of this.renderModules) {
      if (m.postprocessHtml) { try { html = m.postprocessHtml(html, ctx); } catch (e) { console.warn('[yc-pages] module ' + m.id, e); } }
    }

    // подстановка плейсхолдеров
    html = html.replace(/<p>@@(YCPH\d+)@@<\/p>/g, (m0, id) => (ph[id] != null ? ph[id] : m0));
    html = html.replace(/@@(YCPH\d+)@@/g, (m0, id) => (ph[id] != null ? ph[id] : m0));

    const staticHead = this.renderModules.map((m) => m.head || '').filter(Boolean);
    const head = staticHead.concat(heads).join('\n');
    return { html, css: this.aggCss(), head };
  }

  settingsReady() {
    if (!this.settings.apiUrl || !this.settings.token) {
      new Notice('YC Pages: задайте API URL и токен в настройках плагина');
      return false;
    }
    return true;
  }

  // ---------- одиночная заметка ----------
  async startPublishNote(file) {
    if (!this.settingsReady()) return;
    const raw = await this.app.vault.read(file);
    const body = stripFrontmatter(raw);
    const title = deriveTitle(body, file.basename);
    new PublishModal(this.app, {
      plugin: this,
      title,
      ttl: this.settings.defaultTtl,
      onSubmit: (t, ttl, onProgress) => this.publishNote(file, t, body, ttl, onProgress),
    }).open();
  }

  // Создаёт корневые файлы в бакете один раз (index.html/new.html/error.html)
  async ensureBootstrap() {
    if (this.settings.bootstrapped) return;
    const r = await this.api({ action: 'bootstrap', apiUrl: this.settings.apiUrl });
    if (r.ok) { this.settings.bootstrapped = true; await this.saveSettings(); }
  }

  // возвращает URL опубликованной страницы (или бросает исключение)
  async publishNote(file, title, body, ttl, onProgress) {
    await this.ensureBootstrap();
    const { markdown, images } = collectImages(this.app, file, body);
    const cache = this.app.metadataCache.getFileCache(file);
    const rendered = await this.renderNote(markdown, { app: this.app, sourcePath: file.path, frontmatter: cache && cache.frontmatter });
    const r = await this.api({ action: 'page', title, html: rendered.html, css: rendered.css, head: rendered.head, ttlDays: ttl, images: images.map(imgMeta) });
    if (!r.ok) throw new Error(r.error);
    if (images.length) { if (onProgress) onProgress('Загрузка картинок…'); await uploadAssets(this.app, images, r.data.uploads || []); }
    await this.logLink({ title, url: r.data.url, ttl, expiresAt: r.data.expiresAt });
    return r.data.url;
  }

  // ---------- сайт из папки (иерархия = дерево Obsidian) ----------
  async startPublishFolder(folder) {
    if (!this.settingsReady()) return;
    const count = this.app.vault.getMarkdownFiles().filter((f) => inFolder(f, folder)).length;
    if (!count) { new Notice('В папке нет .md заметок'); return; }
    new PublishModal(this.app, {
      plugin: this,
      title: folder.name || 'Сайт',
      subtitle: 'Заметок: ' + count + ' (со вложенными папками)',
      ttl: this.settings.defaultTtl,
      onSubmit: (t, ttl, onProgress) => this.buildSite(folder, t, ttl, onProgress),
    }).open();
  }

  // возвращает URL корня сайта (или бросает исключение)
  async buildSite(rootFolder, title, ttl, onProgress) {
    const app = this.app;
    await this.ensureBootstrap();
    const init = await this.api({ action: 'site-init', title, ttlDays: ttl });
    if (!init.ok) throw new Error('site-init: ' + init.error);
    const siteSlug = init.data.siteSlug;
    const siteUrl = init.data.url;
    const realTtl = init.data.ttl || ttl;

    if (onProgress) onProgress('Подготовка заметок…');
    const folders = [];
    const pages = [];

      const walk = async (folder, dir, breadcrumbs, folderTitle) => {
        const used = {};
        const children = (folder.children || []).slice().sort((a, b) => a.name.localeCompare(b.name, 'ru'));
        const subfolders = children.filter((c) => c instanceof TFolder && folderHasNotes(c));
        const notes = children.filter((c) => c instanceof TFile && c.extension === 'md');
        const folderEntries = [];
        const noteEntries = [];

        for (const f of notes) {
          const raw = await app.vault.read(f);
          const body = stripFrontmatter(raw);
          const cache = app.metadataCache.getFileCache(f);
          const meta = extractMeta(cache && cache.frontmatter);
          const t = deriveTitle(body, f.basename);
          const slug = uniqueSlug(t, f.path, used);
          const url = siteUrl + dir + slug + '/';
          const { markdown, images } = collectImages(app, f, body);
          noteEntries.push({ title: t, url, meta });
          pages.push({ dir, slug, title: t, markdown, images, path: f.path, frontmatter: cache && cache.frontmatter });
        }

        for (const sub of subfolders) {
          const slug = uniqueSlug(sub.name, sub.path, used);
          const url = siteUrl + dir + slug + '/';
          folderEntries.push({ name: sub.name, url });
          await walk(sub, dir + slug + '/', breadcrumbs.concat([{ name: folderTitle, url: siteUrl + dir }]), sub.name);
        }

        folders.push({ dir, title: folderTitle, breadcrumbs, folders: folderEntries, notes: noteEntries });
      };

      await walk(rootFolder, '', [], title);

      const tasks = folders.map((fd) => ({ kind: 'folder', data: fd }))
        .concat(pages.map((p) => ({ kind: 'page', data: p })));

      const errors = await runPool(tasks, async (task) => {
        if (task.kind === 'folder') {
          const fd = task.data;
          const r = await this.api({ action: 'site-folder', siteSlug, ttlDays: realTtl, dir: fd.dir, title: fd.title, breadcrumbs: fd.breadcrumbs, folders: fd.folders, notes: fd.notes });
          if (!r.ok) throw new Error('folder ' + fd.dir + ': ' + r.error);
        } else {
          const p = task.data;
          const rendered = await this.renderNote(p.markdown, { app, sourcePath: p.path, frontmatter: p.frontmatter });
          const r = await this.api({ action: 'site-page', siteSlug, ttlDays: realTtl, dir: p.dir, slug: p.slug, title: p.title, html: rendered.html, css: rendered.css, head: rendered.head, images: p.images.map(imgMeta) });
          if (!r.ok) throw new Error('page ' + p.slug + ': ' + r.error);
          if (p.images.length) await uploadAssets(app, p.images, r.data.uploads || []);
        }
      }, this.settings.concurrency, (done, total) => { if (onProgress) onProgress('Публикация: ' + done + '/' + total); });

      if (errors.length) { console.error('[yc-pages] errors', errors); new Notice('Ошибок: ' + errors.length + ' (см. консоль)', 8000); }
      await this.logLink({ title, url: siteUrl, ttl: realTtl, expiresAt: init.data.expiresAt });
      return siteUrl;
  }

  // Журнал ссылок в Obsidian: добавляет запись и удаляет истёкшие
  async logLink(entry) {
    try {
      const path = (this.settings.linksNote || 'Ссылка на сайты.md').trim();
      const now = new Date();
      const file = this.app.vault.getAbstractFileByPath(path);

      let rows = [];
      if (file instanceof TFile) {
        const text = await this.app.vault.read(file);
        rows = parseLinkRows(text).filter((r) => !r.expires || r.expires > now);
      }

      const expires = entry.expiresAt ? new Date(entry.expiresAt) : new Date(now.getTime() + (entry.ttl || 0) * 86400000);
      const qrData = this.makeQr(entry.url, 3);
      rows.unshift({
        title: String(entry.title || 'без названия').replace(/[|\r\n]+/g, ' ').trim(),
        url: entry.url,
        qr: qrData ? '<img src="' + qrData + '" width="110">' : '',
        createdStr: fmtDate(now),
        ttlStr: (entry.ttl || '?') + ' дн',
        expiresStr: fmtDate(expires),
        expires,
      });

      const out = buildLinkNote(rows);
      if (file instanceof TFile) await this.app.vault.modify(file, out);
      else await this.app.vault.create(path, out);
    } catch (e) {
      console.warn('[yc-pages] logLink failed', e);
    }
  }

  // ---------- API ----------
  async api(payload) {
    try {
      const res = await requestUrl({
        url: this.settings.apiUrl,
        method: 'POST',
        contentType: 'application/json',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({}, payload, { token: this.settings.token })),
        throw: false,
      });
      const data = res.json || {};
      if (res.status >= 200 && res.status < 300) return { ok: true, data };
      return { ok: false, error: data.error || ('HTTP ' + res.status) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
};

// ======================= helpers =======================
function inFolder(file, folder) {
  if (folder.isRoot && folder.isRoot()) return true;
  return file.path === folder.path || file.path.startsWith(folder.path + '/');
}

function folderHasNotes(folder) {
  const stack = [folder];
  while (stack.length) {
    const f = stack.pop();
    for (const c of (f.children || [])) {
      if (c instanceof TFile && c.extension === 'md') return true;
      if (c instanceof TFolder) stack.push(c);
    }
  }
  return false;
}

function stripFrontmatter(mdText) {
  if (mdText.startsWith('---')) {
    const end = mdText.indexOf('\n---', 3);
    if (end !== -1) {
      const after = mdText.indexOf('\n', end + 1);
      return after !== -1 ? mdText.slice(after + 1) : '';
    }
  }
  return mdText;
}

function deriveTitle(mdText, fallback) {
  const m = mdText.match(/^#\s+(.+)$/m);
  return (m ? m[1] : fallback).trim();
}

function extractMeta(fm) {
  const meta = {};
  if (!fm) return meta;
  Object.keys(fm).forEach((k) => {
    if (k === 'position') return;
    let v = fm[k];
    if (v == null) return;
    if (Array.isArray(v)) v = v.join(', ');
    else if (typeof v === 'object') return;
    else v = String(v);
    if (v.trim() === '') return;
    meta[k] = v;
  });
  return meta;
}

function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(36);
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

function uniqueSlug(title, path, used) {
  let base = slugify(title);
  let slug = (base ? base + '-' : '') + fnv(path).slice(0, 6);
  while (used[slug]) slug = slug + '1';
  used[slug] = 1;
  return slug;
}

function safeAssetName(name) {
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
  const base = (dot >= 0 ? name.slice(0, dot) : name).replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_');
  return (base || 'img') + (ext ? '.' + ext : '');
}

function contentTypeFor(ext) {
  return ({
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif',
  })[ext] || 'application/octet-stream';
}

// Находит вложения-картинки, переписывает ссылки на assets/<name>
function collectImages(app, sourceFile, mdText) {
  const images = [];
  const seen = {};
  const register = (info) => { if (!seen[info.name]) { seen[info.name] = 1; images.push(info); } };

  const resolve = (linkpath) => {
    const dest = app.metadataCache.getFirstLinkpathDest(linkpath, sourceFile.path);
    if (!dest) return null;
    const ext = (dest.extension || '').toLowerCase();
    if (IMG_EXT.indexOf(ext) < 0) return null;
    return { file: dest, name: safeAssetName(dest.name), contentType: contentTypeFor(ext) };
  };

  let out = mdText.replace(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, (m, target) => {
    const info = resolve(target.trim());
    if (!info) return m;
    register(info);
    return '![' + info.name + '](assets/' + info.name + ')';
  });

  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, url) => {
    if (/^https?:\/\//i.test(url) || url.startsWith('assets/')) return m;
    const decoded = decodeURIComponent(url.split('#')[0].split('|')[0]).trim();
    const info = resolve(decoded);
    if (!info) return m;
    register(info);
    return '![' + (alt || info.name) + '](assets/' + info.name + ')';
  });

  return { markdown: out, images };
}

function imgMeta(i) { return { name: i.name, contentType: i.contentType }; }

// fallback, если markdown-it не загрузился
function escapeForFallback(md) {
  const s = String(md || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return '<pre>' + s + '</pre>';
}

async function uploadAssets(app, images, uploads) {
  const byName = {};
  images.forEach((i) => { byName[i.name] = i; });
  for (const u of uploads) {
    const info = byName[u.name];
    if (!info) continue;
    const buf = await app.vault.readBinary(info.file);
    await requestUrl({ url: u.putUrl, method: 'PUT', body: buf, headers: { 'Content-Type': info.contentType }, throw: false });
  }
}

async function runPool(items, worker, concurrency, onProgress) {
  let i = 0, done = 0;
  const errors = [];
  const n = Math.max(1, Math.min(concurrency || 5, items.length));
  async function next() {
    while (i < items.length) {
      const idx = i++;
      try { await worker(items[idx], idx); }
      catch (e) { errors.push({ item: items[idx], error: String(e && e.message || e) }); }
      done++;
      if (onProgress) onProgress(done, items.length);
    }
  }
  const runners = [];
  for (let k = 0; k < n; k++) runners.push(next());
  await Promise.all(runners);
  return errors;
}

async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); } catch (e) { /* mobile */ }
}

// ---- журнал ссылок ----
function pad2(n) { return String(n).padStart(2, '0'); }
function fmtDate(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}
function parseDate(s) {
  const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
}

// парсит строки-таблицы; поддерживает 5 колонок (с QR) и старые 4 (без QR)
function parseLinkRows(text) {
  const rows = [];
  for (const line of String(text).split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    const cols = cells.slice(1, cells.length - 1);
    if (cols.length < 4) continue;
    const link = cols[0].match(/\[([^\]]*)\]\(([^)]+)\)/);
    if (!link) continue; // заголовок/разделитель — пропускаем
    let qr = '', createdStr, ttlStr, expiresStr;
    if (cols.length >= 5) { qr = cols[1]; createdStr = cols[2]; ttlStr = cols[3]; expiresStr = cols[4]; }
    else { createdStr = cols[1]; ttlStr = cols[2]; expiresStr = cols[3]; }
    rows.push({ title: link[1], url: link[2], qr, createdStr, ttlStr, expiresStr, expires: parseDate(expiresStr) });
  }
  return rows;
}

function buildLinkNote(rows) {
  const head = '# Ссылки на сайты\n\n> Обновляется автоматически плагином YC Pages. Истёкшие ссылки удаляются при создании новых.\n\n| Сайт | QR | Создано | TTL | Истекает |\n|---|---|---|---|---|\n';
  const body = rows.map((r) =>
    '| [' + String(r.title).replace(/[[\]|]/g, ' ').trim() + '](' + r.url + ') | ' + (r.qr || '') + ' | ' + r.createdStr + ' | ' + r.ttlStr + ' | ' + r.expiresStr + ' |'
  ).join('\n');
  return head + body + (body ? '\n' : '');
}

// ======================= UI =======================
class PublishModal extends Modal {
  constructor(app, opts) {
    super(app);
    this.opts = opts;
    this.plugin = opts.plugin;
    this.pageTitle = opts.title;
    this.ttl = opts.ttl;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h3', { text: 'Опубликовать как сайт' });
    if (this.opts.subtitle) contentEl.createEl('p', { text: this.opts.subtitle, cls: 'setting-item-description' });

    new Setting(contentEl).setName('Заголовок').addText((t) =>
      t.setValue(this.pageTitle).onChange((v) => (this.pageTitle = v))
    );
    new Setting(contentEl).setName('Время жизни').addDropdown((d) => {
      TTL_OPTIONS.forEach((nn) => d.addOption(String(nn), nn + ' дней'));
      d.setValue(String(this.ttl)).onChange((v) => (this.ttl = Number(v)));
    });

    this.status = contentEl.createEl('p', { cls: 'setting-item-description' });
    new Setting(contentEl).addButton((b) => {
      this.pubBtn = b;
      b.setButtonText('Опубликовать').setCta().onClick(() => this.run());
    });
  }

  async run() {
    this.pubBtn.setDisabled(true);
    this.status.setText('Публикация…');
    try {
      const url = await this.opts.onSubmit(
        this.pageTitle.trim() || 'Без названия',
        this.ttl,
        (m) => this.status.setText(m)
      );
      this.showResult(url);
    } catch (e) {
      this.status.setText('Ошибка: ' + (e && e.message || e));
      this.pubBtn.setDisabled(false);
    }
  }

  showResult(url) {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h3', { text: 'Опубликовано ✓' });

    new Setting(contentEl).setName('Ссылка')
      .addText((t) => {
        t.setValue(url);
        t.inputEl.readOnly = true;
        t.inputEl.style.width = '100%';
        t.inputEl.onclick = () => t.inputEl.select();
      })
      .addExtraButton((b) =>
        b.setIcon('copy').setTooltip('Скопировать ссылку').onClick(async () => {
          await copyToClipboard(url);
          new Notice('Ссылка скопирована');
        })
      );

    const qrData = this.plugin && this.plugin.makeQr(url, 5);
    if (qrData) {
      const img = contentEl.createEl('img', { attr: { src: qrData, alt: 'QR' } });
      img.style.width = '180px';
      img.style.imageRendering = 'pixelated';
      img.style.display = 'block';
      img.style.margin = '12px auto';
      img.style.cursor = 'pointer';
      img.onclick = () => new QrModal(this.app, url, this.plugin).open();
    }

    const actions = new Setting(contentEl);
    actions.addButton((b) => b.setButtonText('Открыть').onClick(() => window.open(url)));
    actions.addButton((b) => b.setButtonText('Закрыть').setCta().onClick(() => this.close()));
  }

  onClose() { this.contentEl.empty(); }
}

// Полноэкранный QR для показа с телефона
class QrModal extends Modal {
  constructor(app, url, plugin) {
    super(app);
    this.url = url;
    this.plugin = plugin;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.style.textAlign = 'center';
    const data = this.plugin && this.plugin.makeQr(this.url, 10);
    if (data) {
      const img = contentEl.createEl('img', { attr: { src: data, alt: 'QR' } });
      img.style.width = 'min(320px, 80vw)';
      img.style.imageRendering = 'pixelated';
      img.style.display = 'block';
      img.style.margin = '8px auto';
    } else {
      contentEl.createEl('p', { text: 'QR недоступен' });
    }
    contentEl.createEl('p', { text: this.url, cls: 'setting-item-description' });
  }
  onClose() { this.contentEl.empty(); }
}

class YcPagesSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'YC Pages Publish' });

    new Setting(containerEl).setName('API URL').setDesc('Эндпоинт POST /pages вашего API Gateway')
      .addText((t) => t.setPlaceholder('https://<id>.apigw.yandexcloud.net/pages')
        .setValue(this.plugin.settings.apiUrl)
        .onChange(async (v) => { this.plugin.settings.apiUrl = v.trim(); await this.plugin.saveSettings(); }));

    new Setting(containerEl).setName('Токен').setDesc('Секретный токен (CREATE_TOKEN функции)')
      .addText((t) => { t.setPlaceholder('токен').setValue(this.plugin.settings.token)
        .onChange(async (v) => { this.plugin.settings.token = v.trim(); await this.plugin.saveSettings(); });
        t.inputEl.type = 'password'; });

    new Setting(containerEl).setName('TTL по умолчанию').setDesc('Предзаполнение в диалоге публикации')
      .addDropdown((d) => { TTL_OPTIONS.forEach((nn) => d.addOption(String(nn), nn + ' дней'));
        d.setValue(String(this.plugin.settings.defaultTtl))
          .onChange(async (v) => { this.plugin.settings.defaultTtl = Number(v); await this.plugin.saveSettings(); }); });

    new Setting(containerEl).setName('Параллельных загрузок').setDesc('Сколько страниц сайта грузить одновременно')
      .addText((t) => t.setValue(String(this.plugin.settings.concurrency))
        .onChange(async (v) => { const n = Number(v); this.plugin.settings.concurrency = n > 0 ? n : 5; await this.plugin.saveSettings(); }));

    new Setting(containerEl).setName('Заметка-журнал ссылок').setDesc('Путь в vault; сюда пишутся ссылки с датой и TTL, истёкшие удаляются')
      .addText((t) => t.setPlaceholder('Ссылка на сайты.md').setValue(this.plugin.settings.linksNote)
        .onChange(async (v) => { this.plugin.settings.linksNote = v.trim() || 'Ссылка на сайты.md'; await this.plugin.saveSettings(); }));

    new Setting(containerEl).setName('Инициализация сервиса')
      .setDesc('Создать корневые файлы (index.html, new.html, error.html) в бакете. Выполняется автоматически при первой публикации; кнопка — чтобы пере-создать вручную.')
      .addButton((b) => b.setButtonText('Инициализировать').onClick(async () => {
        if (!this.plugin.settings.apiUrl || !this.plugin.settings.token) { new Notice('Сначала задайте API URL и токен'); return; }
        const r = await this.plugin.api({ action: 'bootstrap', apiUrl: this.plugin.settings.apiUrl });
        if (r.ok) {
          this.plugin.settings.bootstrapped = true;
          await this.plugin.saveSettings();
          new Notice('Готово: ' + ((r.data.created || []).join(', ') || 'уже было'));
        } else {
          new Notice('Ошибка: ' + r.error);
        }
      }));
  }
}
