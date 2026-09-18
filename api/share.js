function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}

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

function arrays(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (const key of ['items','list','records','novels','books','subjects','rows']) {
    if (Array.isArray(value[key])) return value[key];
  }
  for (const key of Object.keys(value)) if (Array.isArray(value[key])) return value[key];
  return [];
}

function findBook(payload, id) {
  const wanted = String(id);
  for (const item of arrays(unwrap(payload))) {
    const itemId = String(pick(item, ['id','novelId','novel_id','bookId','nid'], ''));
    if (itemId === wanted) return item;
  }
  return null;
}

async function findNovel(id) {
  const paths = [
    '/search?q=' + encodeURIComponent(id) + '&p=1&l=30',
    '/featured?p=1&l=100',
    '/rankings?rank=1&p=1&l=100',
    '/search?q=popular&p=1&l=100'
  ];
  for (const path of paths) {
    try {
      const response = await fetch('https://novel-api.nabaikabaiaguo.workers.dev' + path, {
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) continue;
      const book = findBook(await response.json(), id);
      if (book) return book;
    } catch (_) {}
  }
  return null;
}

module.exports = async function handler(req, res) {
  const id = String(req.query?.id || '').trim();
  if (!id || !/^[A-Za-z0-9._~-]+$/.test(id)) {
    res.status(400).send('Invalid novel ID');
    return;
  }

  const book = await findNovel(id);
  const title = String(pick(book, ['title','name','novelName','bookName'], 'Novel Hub')).slice(0, 180);
  const author = String(pick(book, ['author','writer','authorName','novelAuthor'], ''));
  let cover = pick(book, ['cover','coverUrl','cover_url','image','imageUrl','pic','thumb','poster'], '');
  if (cover && typeof cover === 'object') cover = pick(cover, ['url','src','href'], '');
  cover = String(cover || '');

  
function optimizedCoverUrl(cover) {
  if (!/^https?:\/\//i.test(String(cover || ''))) return '';
  try {
    const url = new URL('https://wsrv.nl/');
    url.searchParams.set('url', cover);
    url.searchParams.set('w', '1200');
    url.searchParams.set('h', '630');
    url.searchParams.set('fit', 'contain');
    url.searchParams.set('cbg', '07080d');
    url.searchParams.set('output', 'jpg');
    url.searchParams.set('q', '60');
    return url.toString();
  } catch (_) {
    return '';
  }
}

  const appUrl = 'https://' + req.headers.host + '/novel/' + encodeURIComponent(id);
  const description = ('Read ' + title + (author ? ' by ' + author : '') + ' on Novel Hub.').slice(0, 200);
  const previewImage = optimizedCoverUrl(cover);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  res.status(200).send('<!doctype html><html><head>' +
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + esc(title) + ' — Novel Hub</title>' +
    '<meta name="description" content="' + esc(description) + '">' +
    '<meta property="og:type" content="book">' +
    '<meta property="og:site_name" content="Novel Hub">' +
    '<meta property="og:title" content="' + esc(title) + '">' +
    '<meta property="og:description" content="' + esc(description) + '">' +
    '<meta property="og:url" content="' + esc(appUrl) + '">' +
    (previewImage ? '<meta property="og:image" content="' + esc(previewImage) + '">' +
      '<meta property="og:image:secure_url" content="' + esc(previewImage) + '">' +
      '<meta property="og:image:width" content="1200">' +
      '<meta property="og:image:height" content="630">' +
      '<meta property="og:image:type" content="image/jpeg">' +
      '<meta property="og:image:alt" content="' + esc(title) + '">' : '') +
    (previewImage ? '<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="' + esc(previewImage) + '">' : '<meta name="twitter:card" content="summary">') +
    '</head><body>' +
    '<p>Opening <a href="' + esc(appUrl) + '">' + esc(title) + '</a>…</p>' +
    '<script>location.replace(' + JSON.stringify(appUrl) + ')</script>' +
    '</body></html>');
};