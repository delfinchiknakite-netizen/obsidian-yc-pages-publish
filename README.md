# YC Pages Publish

Publish Obsidian notes and whole folders as **temporary (TTL) websites** on **your own
S3‑compatible bucket** (Yandex Cloud Object Storage, AWS S3, Cloudflare R2, Backblaze B2, MinIO…).
Right‑click a note or folder (or use the ribbon icon / editor menu on mobile) → **Publish as site**.
Share the link or a QR code; pages disappear automatically after the TTL you choose.

> **No server to run.** The plugin talks **directly** to your bucket (AWS SigV4, signed in‑app) —
> just like *Remotely Save*. You bring an S3 bucket; there is no backend service to deploy or maintain.

## What it does

- **Note → page** — Markdown is rendered to a standalone HTML page **inside the plugin** and uploaded
  to the bucket.
- **Folder → multi‑page site** — mirrors your folder tree: each folder gets its own index (breadcrumbs
  + sub‑folders + a searchable / filterable / sortable list built from note frontmatter).
- **Images** in notes are uploaded alongside the page.
- **TTL** of 7 / 30 / 90 days — expired items are hidden on the site (client‑side) and deleted from the
  bucket by the plugin on startup. (You can also add a bucket lifecycle rule for belt‑and‑suspenders.)
- **Link journal** — every publish is logged into a note with date, TTL and a **QR code**; expired rows
  are pruned; each row has a 🗑 button to delete the publication from the note.
- Works on desktop and mobile.

### Rendering modules

HTML is produced by a small **pluggable module system**: `chords` (chord charts + SVG diagrams),
`tasks` (Tasks‑plugin items → cards), `callouts`, `kanban`, `math` (KaTeX), `dataview` (query executed
at publish time), `excalidraw` (drawing → inline SVG). Add your own — see
[`src/ARCHITECTURE.md`](src/ARCHITECTURE.md).

## Network use & privacy

The plugin makes network requests **only to the S3 endpoint you configure**. It uploads the rendered
HTML/images of the notes and folders you explicitly publish, reads/writes a small `manifest.json`, and
lists/deletes objects when you delete a publication. Your access key/secret are stored in the vault
(`data.json`, like other S3 sync plugins) and never sent anywhere except as an AWS SigV4 signature to
your endpoint. Nothing happens automatically except deleting **already‑expired** publications on
startup. Published **pages** may load KaTeX from a public CDN in the viewer's browser (math module only).

## Setup

### 1. Create a public static‑website bucket (once)

Any S3‑compatible provider works. You need:
- a **bucket** with **static website hosting** enabled (index document `index.html`, error `error.html`),
- **public read** access,
- an **access key / secret** that can read & write the bucket.

For Yandex Cloud you can provision exactly this with the Terraform in [`backend/`](backend/)
(`terraform apply` → outputs the bucket name, public URL and keys), or click it together in any cloud
console. No Cloud Function / API Gateway is needed.

### 2. Install the plugin

- **BRAT**: install *Obsidian42 - BRAT* → *Add Beta plugin* →
  `delfinchiknakite-netizen/obsidian-yc-pages-publish`.
- **Manual**: copy `main.js` and `manifest.json` into `<vault>/.obsidian/plugins/yc-pages-publish/`.

### 3. Configure

In the plugin settings fill the **S3** section: Endpoint, Region, Bucket, Access Key ID, Secret Access
Key, and the **Public URL** (your bucket's static‑website address). Press **Initialize** to create the
root files and verify access.

## Usage

- **Note**: right‑click → *Publish as site* (or ribbon 🌐 / editor menu / command palette).
- **Folder**: right‑click → *Create site from folder*.
- The result dialog shows the link, a copy icon and a QR code.
- Links accumulate in the journal note; use 🗑 (in Reading view) to delete a publication.

## Building from source

`src/main.js` is the source; `src/qrcode.js`, `src/markdown-it.js`, `src/s3.js` and the render modules
are combined by the bundler:

```bash
node src/build.js main.js
```

## License

[MIT](LICENSE). Bundled: `qrcode-generator` © Kazuhiko Arase (MIT), `markdown-it` (MIT).
