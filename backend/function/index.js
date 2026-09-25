'use strict';

// YC Pages backend — ЧИСТОЕ ХРАНИЛИЩЕ. Никакого рендера HTML: полные HTML-документы
// формирует плагин и присылает готовыми; функция лишь кладёт их в Object Storage,
// ведёт manifest.json, раздаёт presigned-URL для картинок и удаляет публикации.

const AWS = require('aws-sdk');
const crypto = require('crypto');

const s3 = new AWS.S3({
  endpoint: 'https://storage.yandexcloud.net',
  region: 'ru-central1',
  s3ForcePathStyle: true,
  signatureVersion: 'v4',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const BUCKET = process.env.BUCKET;
const TOKEN = process.env.CREATE_TOKEN;
const SITE_URL = (process.env.SITE_URL || '').replace(/\/$/, '');
const ALLOWED_TTL = [7, 30, 90];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  const method = event.httpMethod || (event.requestContext && event.requestContext.httpMethod);
  if (method === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (method !== 'POST') return resp(405, { error: 'method not allowed' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return resp(400, { error: 'bad json' }); }

  if (body.token !== TOKEN) return resp(401, { error: 'unauthorized' });

  try {
    switch (body.action || 'page') {
      case 'bootstrap':   return await bootstrap(body);
      case 'delete':      return await deletePublication(body);
      case 'page':        return await createPage(body);
      case 'site-init':   return await initSite(body);
      case 'site-folder': return await writeFolder(body);
      case 'site-page':   return await createSitePage(body);
      default:            return resp(400, { error: 'unknown action' });
    }
  } catch (e) {
    return resp(500, { error: String(e && e.message || e) });
  }
};

// ---------- bootstrap: записать корневые файлы (html присылает плагин) ----------
async function bootstrap(body) {
  const files = Array.isArray(body.files) ? body.files : [];
  const created = [];
  for (const f of files) {
    if (!f || !f.key || typeof f.html !== 'string') continue;
    await putHtml(String(f.key).replace(/^\/+/, ''), f.html);
    created.push(f.key);
  }
  // manifest.json — только если отсутствует
  try {
    await s3.headObject({ Bucket: BUCKET, Key: 'manifest.json' }).promise();
  } catch (e) {
    await putObj('manifest.json', JSON.stringify({ pages: [] }, null, 2), 'application/json', 'no-cache');
    created.push('manifest.json');
  }
  return resp(200, { ok: true, created, site: SITE_URL + '/' });
}

// ---------- delete: удалить публикацию по URL ----------
async function deletePublication(body) {
  const url = String(body.url || '');
  let prefix = url.replace(SITE_URL, '').replace(/^\//, '');
  if (!/^(p|s)\/\d+\/[a-f0-9]+\/?$/i.test(prefix)) return resp(400, { error: 'bad url' });
  if (!prefix.endsWith('/')) prefix += '/';

  let deleted = 0;
  let token;
  do {
    const list = await s3.listObjectsV2({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token }).promise();
    const objs = (list.Contents || []).map((o) => ({ Key: o.Key }));
    if (objs.length) { await s3.deleteObjects({ Bucket: BUCKET, Delete: { Objects: objs } }).promise(); deleted += objs.length; }
    token = list.IsTruncated ? list.NextContinuationToken : null;
  } while (token);

  try {
    const obj = await s3.getObject({ Bucket: BUCKET, Key: 'manifest.json' }).promise();
    const manifest = JSON.parse(obj.Body.toString('utf-8'));
    const nowIso = new Date().toISOString();
    manifest.pages = (manifest.pages || []).filter((p) => p.url !== url && p.expiresAt > nowIso);
    await putObj('manifest.json', JSON.stringify(manifest, null, 2), 'application/json', 'no-cache');
  } catch (e) { /* нет манифеста — ок */ }

  return resp(200, { ok: true, deleted });
}

// ---------- page: одиночная страница (html — готовый документ) ----------
async function createPage(body) {
  const { title, html, ttlDays, images } = body;
  if (!title || typeof html !== 'string') return resp(400, { error: 'title and html required' });

  const ttl = normTtl(ttlDays);
  const slug = rndSlug();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttl * 86400000);
  const prefix = `p/${ttl}/${slug}/`;
  const pageUrl = `${SITE_URL}/${prefix}`;

  await putHtml(prefix + 'index.html', html);
  await manifestAdd({ type: 'page', slug, title, ttl, url: pageUrl, createdAt: now.toISOString(), expiresAt: expiresAt.toISOString() });

  return resp(200, { url: pageUrl, expiresAt: expiresAt.toISOString(), uploads: presignAssets(images, prefix + 'assets/') });
}

// ---------- site-init: создать сайт (без html) ----------
async function initSite(body) {
  const { title, ttlDays } = body;
  if (!title) return resp(400, { error: 'title required' });

  const ttl = normTtl(ttlDays);
  const siteSlug = rndSlug();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttl * 86400000);
  const siteUrl = `${SITE_URL}/s/${ttl}/${siteSlug}/`;

  await manifestAdd({ type: 'site', slug: siteSlug, title, ttl, url: siteUrl, createdAt: now.toISOString(), expiresAt: expiresAt.toISOString() });

  return resp(200, { siteSlug, ttl, url: siteUrl, expiresAt: expiresAt.toISOString() });
}

// ---------- site-folder: индекс папки (html + data — готовые) ----------
async function writeFolder(body) {
  const { siteSlug, ttlDays, dir, html, data } = body;
  if (!siteSlug || dir == null || typeof html !== 'string') return resp(400, { error: 'siteSlug, dir, html required' });

  const ttl = normTtl(ttlDays);
  const prefix = `s/${ttl}/${siteSlug}/${dir}`;
  await putObj(prefix + 'data.json', JSON.stringify(data || {}), 'application/json', 'no-cache');
  await putHtml(prefix + 'index.html', html);
  return resp(200, { url: `${SITE_URL}/${prefix}` });
}

// ---------- site-page: страница заметки (html — готовый документ) ----------
async function createSitePage(body) {
  const { siteSlug, ttlDays, dir, slug, html, images } = body;
  if (!siteSlug || dir == null || !slug || typeof html !== 'string') return resp(400, { error: 'siteSlug, dir, slug, html required' });

  const ttl = normTtl(ttlDays);
  const prefix = `s/${ttl}/${siteSlug}/${dir}${slug}/`;
  const pageUrl = `${SITE_URL}/${prefix}`;

  await putHtml(prefix + 'index.html', html);
  return resp(200, { url: pageUrl, uploads: presignAssets(images, prefix + 'assets/') });
}

// ---------- helpers ----------
function normTtl(v) { return ALLOWED_TTL.includes(Number(v)) ? Number(v) : 30; }
function rndSlug() { return crypto.randomBytes(5).toString('hex'); }

function presignAssets(images, prefix) {
  if (!Array.isArray(images) || !images.length) return [];
  return images.map((img) => {
    const name = String(img.name).split('/').pop();
    const putUrl = s3.getSignedUrl('putObject', { Bucket: BUCKET, Key: prefix + name, Expires: 3600 });
    return { name: img.name, putUrl };
  });
}

async function putObj(key, bodyStr, contentType, cacheControl) {
  const params = { Bucket: BUCKET, Key: key, Body: bodyStr, ContentType: contentType };
  if (cacheControl) params.CacheControl = cacheControl;
  await s3.putObject(params).promise();
}
function putHtml(key, html) { return putObj(key, html, 'text/html; charset=utf-8'); }

async function manifestAdd(entry) {
  let manifest = { pages: [] };
  try {
    const obj = await s3.getObject({ Bucket: BUCKET, Key: 'manifest.json' }).promise();
    manifest = JSON.parse(obj.Body.toString('utf-8'));
  } catch (e) { /* first run */ }
  const nowIso = new Date().toISOString();
  manifest.pages = (manifest.pages || []).filter((p) => p.expiresAt > nowIso);
  manifest.pages.unshift(entry);
  await putObj('manifest.json', JSON.stringify(manifest, null, 2), 'application/json', 'no-cache');
}

function resp(statusCode, obj) {
  return { statusCode, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
}
