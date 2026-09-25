// Минимальный S3-клиент с подписью AWS SigV4 (path-style) на Web Crypto.
// Транспорт инъектируется: http({url,method,headers,body}) -> {status, text, arrayBuffer}.
// В плагине http оборачивает requestUrl (без CORS), в тестах — fetch.
function makeS3(cfg, http) {
  const endpoint = String(cfg.endpoint || '').replace(/\/$/, '');
  const host = endpoint.replace(/^https?:\/\//, '');
  const region = cfg.region || 'us-east-1';
  const bucket = cfg.bucket;
  const enc = new TextEncoder();

  function hex(buf) {
    const b = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
    return s;
  }
  async function sha256hex(bytes) { return hex(await crypto.subtle.digest('SHA-256', bytes)); }
  async function hmac(keyBytes, msg) {
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await crypto.subtle.sign('HMAC', key, typeof msg === 'string' ? enc.encode(msg) : msg));
  }
  async function signingKey(dateStamp) {
    let k = await hmac(enc.encode('AWS4' + cfg.secretAccessKey), dateStamp);
    k = await hmac(k, region);
    k = await hmac(k, 's3');
    k = await hmac(k, 'aws4_request');
    return k;
  }
  function amzDate() {
    const d = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    return { amz: d, day: d.slice(0, 8) };
  }
  function encKey(key) { return key.split('/').map(encodeURIComponent).join('/'); }

  // query: object {k:v} или null
  async function request(method, key, query, body, extraHeaders) {
    const bodyBytes = body == null ? new Uint8Array(0)
      : (typeof body === 'string' ? enc.encode(body) : new Uint8Array(body));
    const payloadHash = await sha256hex(bodyBytes);
    const { amz, day } = amzDate();

    const canonicalUri = '/' + bucket + (key ? '/' + encKey(key) : '');
    const qs = query
      ? Object.keys(query).sort().map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(query[k])).join('&')
      : '';

    const signed = ['host', 'x-amz-content-sha256', 'x-amz-date'];
    const canonicalHeaders = 'host:' + host + '\n' + 'x-amz-content-sha256:' + payloadHash + '\n' + 'x-amz-date:' + amz + '\n';
    const canonicalRequest = method + '\n' + canonicalUri + '\n' + qs + '\n' + canonicalHeaders + '\n' + signed.join(';') + '\n' + payloadHash;
    const scope = day + '/' + region + '/s3/aws4_request';
    const stringToSign = 'AWS4-HMAC-SHA256\n' + amz + '\n' + scope + '\n' + (await sha256hex(enc.encode(canonicalRequest)));
    const signature = hex(await hmac(await signingKey(day), stringToSign));
    const authorization = 'AWS4-HMAC-SHA256 Credential=' + cfg.accessKeyId + '/' + scope +
      ', SignedHeaders=' + signed.join(';') + ', Signature=' + signature;

    const headers = Object.assign({
      Authorization: authorization,
      'x-amz-date': amz,
      'x-amz-content-sha256': payloadHash,
    }, extraHeaders || {});
    const url = endpoint + canonicalUri + (qs ? '?' + qs : '');
    return http({ url, method, headers, body: bodyBytes });
  }

  return {
    publicUrl: String(cfg.publicBaseUrl || '').replace(/\/$/, ''),

    async put(key, body, contentType, cacheControl) {
      const h = {};
      if (contentType) h['Content-Type'] = contentType;
      if (cacheControl) h['Cache-Control'] = cacheControl;
      const r = await request('PUT', key, null, body, h);
      if (r.status >= 300) throw new Error('S3 PUT ' + key + ' → ' + r.status + ' ' + (await r.text()).slice(0, 200));
      return r;
    },
    async get(key) {
      const r = await request('GET', key, null, null, null);
      if (r.status === 404) return null;
      if (r.status >= 300) throw new Error('S3 GET ' + key + ' → ' + r.status);
      return await r.text();
    },
    async del(key) {
      const r = await request('DELETE', key, null, null, null);
      if (r.status >= 300 && r.status !== 404) throw new Error('S3 DELETE ' + key + ' → ' + r.status);
      return r;
    },
    // возвращает массив ключей с указанным префиксом (с пагинацией)
    async list(prefix) {
      const keys = [];
      let token = null;
      do {
        const q = { 'list-type': '2', prefix: prefix };
        if (token) q['continuation-token'] = token;
        const r = await request('GET', '', q, null, null);
        if (r.status >= 300) throw new Error('S3 LIST → ' + r.status);
        const xml = await r.text();
        const re = /<Key>([^<]+)<\/Key>/g;
        let m;
        while ((m = re.exec(xml))) keys.push(decodeXml(m[1]));
        const tm = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
        const trunc = /<IsTruncated>true<\/IsTruncated>/.test(xml);
        token = (trunc && tm) ? decodeXml(tm[1]) : null;
      } while (token);
      return keys;
    },
  };
}

function decodeXml(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
