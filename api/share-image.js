function pick(obj, keys, fallback = '') {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
  }
  return fallback;
}

function unwrap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  for (const key of ['data','result','payload','response','novel','book']) {
    if (value[key] !== undefined) return unwrap(value[key]);
  }
  return value;
}

function coverFrom(value) {
  const obj = unwrap(value);
  let cover = pick(obj, ['cover','coverUrl','cover_url','image','imageUrl','pic','thumb','poster'], '');
  if (cover && typeof cover === 'object') cover = pick(cover, ['url','src','href'], '');
  return String(cover || '');
}

module.exports = async function handler(req, res) {
  const id = String(req.query?.id || '').trim();
  const source = String(req.query?.source || '').trim();
  if (!id) return res.status(400).send('Missing novel ID');

  let cover = '';
  try {
    if (source) {
      const path = source.startsWith('/') ? source : '/novel/' + encodeURIComponent(source);
      const r = await fetch('https://novel-api.nabaikabaiaguo.workers.dev' + path, { headers: { Accept: 'application/json' } });
      if (r.ok) cover = coverFrom(await r.json());
    }
  } catch (_) {}

  if (!cover) {
    try {
      const r = await fetch('https://novel-api.nabaikabaiaguo.workers.dev/search?q=' + encodeURIComponent(id) + '&p=1&l=30', { headers: { Accept: 'application/json' } });
      if (r.ok) {
        const data = unwrap(await r.json());
        const items = Array.isArray(data) ? data : (data?.items || data?.list || data?.records || data?.novels || data?.books || []);
        const book = items.find(item => String(pick(item, ['id','novelId','novel_id','bookId','nid'], '')) === id);
        cover = coverFrom(book);
      }
    } catch (_) {}
  }

  if (!/^https?:\/\//i.test(cover)) return res.status(404).send('Cover not found');

  try {
    const transform = new URL('https://wsrv.nl/');
    transform.searchParams.set('url', cover);
    transform.searchParams.set('w', '1200');
    transform.searchParams.set('h', '630');
    transform.searchParams.set('fit', 'contain');
    transform.searchParams.set('cbg', '07080d');
    transform.searchParams.set('output', 'jpg');
    transform.searchParams.set('q', '55');

    const image = await fetch(transform);
    if (!image.ok) return res.status(502).send('Preview image unavailable');

    const buffer = Buffer.from(await image.arrayBuffer());
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.status(200).send(buffer);
  } catch (_) {
    res.status(502).send('Preview image unavailable');
  }
};
