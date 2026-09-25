# YC Pages Publish — архитектура плагина

Плагин Obsidian: публикует заметку как временный сайт через API сервиса **yc-pages**
(см. `../README.md`). Правый клик по `.md` файлу → «Опубликовать как сайт».

## Поток

```
file-menu (ПКМ по .md)  ─┐
command palette          ─┴─► startPublish(file)
                              read(file) → stripFrontmatter → deriveTitle
                              PublishModal (заголовок + TTL, предзаполнен defaultTtl)
                                    └─ onSubmit ─► doPublish()
                                          requestUrl POST apiUrl
                                          {title, markdown, ttlDays, token}
                                          успех → URL в буфер + Notice
```

## Компоненты (main.js)

- **YcPagesPublishPlugin** — регистрирует `file-menu`, команду `publish-active-note`, вкладку настроек.
- **startPublish(file)** — читает заметку, срезает YAML-frontmatter (`stripFrontmatter`),
  берёт заголовок из первого `# H1` или имени файла (`deriveTitle`), открывает модалку.
- **PublishModal** — поля «Заголовок» и «Время жизни» (7/30/90, предзаполнено настройкой),
  кнопка «Опубликовать».
- **doPublish(title, markdown, ttl)** — `requestUrl` (без CORS-проблем) POST на `apiUrl`.
  Успех → копирует URL в буфер + `Notice`.
- **YcPagesSettingTab** — настройки: `apiUrl`, `token` (password), `defaultTtl`.

## Настройки (data.json)

```json
{ "apiUrl": "https://<id>.apigw.yandexcloud.net/pages", "token": "...", "defaultTtl": 7 }
```

## Сайт из папки (ПКМ по любой папке → «Создать сайт из папки»)

Сайт повторяет **дерево папок Obsidian**: у каждой папки свой индекс, вглубь по клику.

`buildSite(rootFolder, title, ttl)`:
1. `action:site-init` → `siteSlug` + `siteUrl` + запись в корневой manifest (ничего не рендерит).
2. `walk(folder, dir, breadcrumbs, folderTitle)` — рекурсивный обход дерева. На каждом уровне:
   - заметки → `pages[]` (body без frontmatter, `meta`, заголовок, slug, картинки) и `noteEntries` (title,url,meta);
   - подпапки (только непустые, `folderHasNotes`) → `folderEntries` (name,url) + рекурсия с `dir+slug+'/'`;
   - узел папки → `folders[]` с `{dir, title, breadcrumbs, folders, notes}`.
   Slug уникален в пределах уровня (`uniqueSlug` = slugify+fnv-хеш пути); URL абсолютные (`siteUrl+dir+slug+'/'`).
3. Пул задач (`concurrency`, прогресс в Notice):
   - `action:site-folder` → пишет `s/<ttl>/<site>/<dir>index.html` (генерик UI) + `<dir>data.json`
     (`{title, breadcrumbs, folders, notes}`);
   - `action:site-page` → `s/<ttl>/<site>/<dir><slug>/index.html` (+ presigned-картинки), «← к списку» = `../`.

Индекс папки (`renderSiteIndex`, один шаблон на все уровни) рендерит из `data.json`: хлебные крошки →
раздел «Разделы» (📁 подпапки) → раздел «Страницы» (поиск + авто-фильтры из ключей meta + сортировка).
Всё **на клиенте**, ничего не зашито под конкретную папку.

## Картинки (`collectImages` / `uploadAssets`)

- Находит `![[embed.png]]` и `![](path.png)` (кроме http и уже-`assets/`), резолвит через
  `metadataCache.getFirstLinkpathDest`, переписывает ссылку на `assets/<safeName>`.
- Функция возвращает `uploads:[{name, putUrl}]` (presigned PUT, ключи S3 не покидают сервер).
- Плагин `readBinary` + `requestUrl PUT` заливает бинарники (без CORS-проблем).

## Журнал ссылок (`logLink`)

После каждой публикации (страница или сайт) плагин пишет запись в заметку `settings.linksNote`
(по умолчанию `Ссылка на сайты.md` в корне vault): таблица `| Сайт | Создано | TTL | Истекает |`,
ссылка = `[title](url)`. Перед добавлением новой записи весь список парсится (`parseLinkRows`) и
строки с `Истекает < now` удаляются (очистка по текущему времени). Даты — локальные `YYYY-MM-DD HH:mm`
(`fmtDate`/`parseDate`), `expiresAt` берётся из ответа функции. Ошибка записи журнала не срывает публикацию.

## QR-код (`loadQr`/`makeQr`, `QrModal`)

Библиотека `qrcode-generator` (MIT) лежит рядом как `qrcode.js` и грузится в рантайме через
`new Function(src + ';return qrcode;')()` — так её UMD не перехватывает `module.exports` плагина.
`makeQr(url)` → GIF data-URL (авто-версия, коррекция M). В окне результата показывается QR (клик/кнопка
«Открыть QR» → `QrModal` во весь экран для показа с телефона). Работает офлайн, без сторонних сервисов.

## Доступ на мобильном

`isDesktopOnly:false`. Пункт «Опубликовать как сайт» доступен на телефоне тремя путями:
`file-menu` (долгое нажатие в проводнике), `editor-menu` («•••» в заметке) и **иконка на панели**
(`addRibbonIcon`, публикует активную заметку). Плюс команда в палитре.

## Ограничения / TODO

- Прочий Obsidian-синтаксис (`[[wikilinks]]`, callouts) рендерится `markdown-it` как текст.
- `data.json`/токен в открытом виде (как у большинства плагинов).
- Большая папка = много вызовов функции (в пределах free-tier); идёт пулом с прогрессом.

## Установка вручную

Скопировать `manifest.json` + `main.js` в `<vault>/.obsidian/plugins/yc-pages-publish/`,
включить плагин в настройках Obsidian (Community plugins).
