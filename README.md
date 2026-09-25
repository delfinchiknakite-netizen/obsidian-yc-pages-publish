# YC Pages Publish

Publish Obsidian notes and whole folders as **temporary (TTL) websites** on your own
**Yandex Cloud** Object Storage. Right‑click a note or folder (or use the ribbon icon / editor
menu on mobile) → **Publish as site**. Share the link or a QR code; pages disappear automatically
after the TTL you choose.

> ⚠️ **This plugin requires a self‑hosted backend** on Yandex Cloud (a tiny Cloud Function +
> Object Storage bucket + API Gateway). It is deployed once with the Terraform in [`backend/`](backend/)
> and stays within the Cloud Functions free tier (≈ €0). Without it the plugin has nothing to talk to.

## What it does

- **Note → page** — Markdown is rendered to a standalone HTML page **inside the plugin** and stored
  as‑is. The backend never renders anything — it only stores files.
- **Folder → multi‑page site** — mirrors your Obsidian folder tree: each folder gets its own index
  (breadcrumbs + sub‑folders + a searchable / filterable / sortable list built from note frontmatter).
- **Images** in notes are uploaded to the bucket (via presigned URLs — storage keys never leave the
  backend) and links are rewritten.
- **TTL** of 7 / 30 / 90 days — expired items are hidden on the site (client‑side) and physically
  removed by Object Storage lifecycle rules. No cron.
- **Link journal** — every publish is logged into a note (`Ссылка на сайты.md` by default) with date,
  TTL and a **QR code**; expired rows are pruned automatically; each row has a 🗑 button to delete the
  publication (files + manifest) right from the note.
- **QR code** of the link in the result dialog (show it, scan it from a phone).
- Works on desktop and mobile.

### Rendering modules

HTML is produced by a small **pluggable module system**. Built‑in modules:

| Module | Handles |
|---|---|
| chords | ```` ```chords ```` / ```` ```chordpro ```` → chords over lyrics + SVG chord diagrams |
| tasks | Tasks‑plugin items `- [ ] … 📅 ⏫ #tag` → styled cards |
| callouts | `> [!note] …` → coloured callout boxes |
| kanban | Kanban board notes → columns with cards |
| math | `$…$` / `$$…$$` → KaTeX (auto‑render from CDN) |
| dataview | ```` ```dataview ```` → query is executed at publish time and inlined as static HTML |
| excalidraw | `![[drawing.excalidraw]]` → exported to inline SVG |

Add your own: drop `src/modules/<name>.js` (interface `{ id, css?, head?, fence?, postprocessHtml?, renderFull?, preprocess? }`),
add it to `MODULES` in `src/build.js`, rebuild. See [`src/ARCHITECTURE.md`](src/ARCHITECTURE.md).

## Network use & privacy

This plugin sends data over the network **only to the API endpoint you configure** (your own
Yandex Cloud API Gateway). It transmits: the rendered HTML of the notes/folders you explicitly
choose to publish, their images, and a secret token you set. Nothing is sent anywhere else and
nothing happens automatically — only on an explicit "Publish" / "Delete" action. The
`dataview` and `excalidraw` modules read from other Obsidian plugins' APIs locally to render content.
The math module makes published **pages** load KaTeX from a public CDN in the viewer's browser.

## Setup

### 1. Deploy the backend (once)

Everything is in [`backend/`](backend/) — Terraform provisions a public static‑hosting bucket
(with TTL lifecycle rules), a service account, the storage‑only Cloud Function and an API Gateway.

```bash
cd backend/terraform
cp terraform.tfvars.example terraform.tfvars   # set bucket_name and create_token
export TF_CLI_CONFIG_FILE="$PWD/.terraformrc"  # provider mirror (useful in RU)
export YC_TOKEN=$(yc iam create-token)
terraform init && terraform apply
```

Outputs: `api_url` and `site_url`. See [`backend/README.md`](backend/README.md) for a `yc` CLI variant.

### 2. Install the plugin

- **BRAT** (beta): install *Obsidian42 - BRAT*, then *Add Beta plugin* →
  `delfinchiknakite-netizen/obsidian-yc-pages-publish`.
- **Manual**: copy `main.js` and `manifest.json` into `<vault>/.obsidian/plugins/yc-pages-publish/`.

### 3. Configure

In the plugin settings set **API URL** (`api_url`) and **Token** (`create_token`). On the first
publish the plugin creates the site's root files (`index.html`, `new.html`, `error.html`) in the
bucket; you can also run it from the **Initialize** button.

## Usage

- **Note**: right‑click → *Publish as site* (or ribbon 🌐 / editor menu / command palette).
- **Folder**: right‑click → *Create site from folder*.
- The result dialog shows the link, a copy icon and a QR code.
- All links accumulate in the journal note; use 🗑 (in Reading view) to delete a publication.

## Building from source

`src/main.js` is the clean source; `src/qrcode.js` and `src/markdown-it.js` are vendored (MIT).
The root `main.js` is produced by the bundler (it inlines the vendored libs, modules and templates):

```bash
node src/build.js main.js
```

## License

[MIT](LICENSE). Bundled: `qrcode-generator` © Kazuhiko Arase (MIT), `markdown-it` (MIT).
Published pages optionally load KaTeX (MIT) from a CDN.
