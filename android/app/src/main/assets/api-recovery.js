(() => {
  const API = 'https://novel-api.nabaikabaiaguo.workers.dev';
  const originalFetch = window.fetch.bind(window);
  const detailCache = new Map();

  const pick = (obj, keys, fallback = '') => {
    for (const key of keys) {
      if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
    }
    return fallback;
  };

  const unwrap = value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    for (const key of ['data', 'result', 'payload', 'response', 'novel', 'book']) {
      if (value[key] !== undefined) return unwrap(value[key]);
    }
    return value;
  };

  const arrays = value => {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    for (const key of ['items', 'list', 'records', 'novels', 'books', 'subjects', 'rows']) {
      if (Array.isArray(value[key])) return value[key];
    }
    for (const key of Object.keys(value)) if (Array.isArray(value[key])) return value[key];
    return [];
  };

  const idOf = value => String(pick(value, ['id', 'novelId', 'novel_id', 'bookId', 'nid'], ''));
  const detailOf = value => String(pick(value, ['detailPath', 'detail_path', 'path', 'detailUrl', 'detail_url'], ''));

  function absolute(path) {
    if (/^https?:\/\//i.test(path)) return path;
    return API + (path.startsWith('/') ? path : '/' + path);
  }

  async function findDetailPath(id) {
    id = String(id);
    if (detailCache.has(id)) return detailCache.get(id);

    const queries = [
      `/search?q=${encodeURIComponent(id)}&p=1&l=30`,
      `/featured?p=1&l=100`,
      `/rankings?rank=1&p=1&l=100`,
      `/search?q=popular&p=1&l=100`,
    ];

    for (const path of queries) {
      try {
        const response = await originalFetch(absolute(path), { headers: { Accept: 'application/json' }, cache: 'no-store' });
        if (!response.ok) continue;
        const rows = arrays(unwrap(await response.json()));
        const match = rows.find(item => idOf(item) === id);
        if (match) {
          const detail = detailOf(match);
          if (detail) {
            detailCache.set(id, detail);
            return detail;
          }
        }
      } catch (_) {}
    }
    return '';
  }

  window.fetch = async (input, init) => {
    let url = '';
    try { url = typeof input === 'string' ? input : input?.url || ''; } catch (_) {}

    if (!url || !url.startsWith(API + '/novel/')) return originalFetch(input, init);

    const requested = url.slice((API + '/novel/').length).split('?')[0];
    let response = await originalFetch(input, init);
    if (response.ok) return response;

    const detail = await findDetailPath(decodeURIComponent(requested));
    if (!detail) return response;

    return originalFetch(absolute(detail), init);
  };
})();
