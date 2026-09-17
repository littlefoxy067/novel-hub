(() => {
  const API = 'https://novel-api.nabaikabaiaguo.workers.dev';
  const app = document.getElementById('app');
  if (!app) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  const pick = (obj, keys, fallback = '') => { for (const key of keys) if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key]; return fallback; };
  const unwrap = value => { if (!value || typeof value !== 'object' || Array.isArray(value)) return value; for (const key of ['data','result','payload','response']) if (value[key] !== undefined) return unwrap(value[key]); return value; };
  const arrayFrom = value => { if (Array.isArray(value)) return value; if (!value || typeof value !== 'object') return []; for (const key of ['items','list','records','chapters','rows']) if (Array.isArray(value[key])) return value[key]; return []; };
  const bookFrom = raw => ({
    id: String(pick(raw, ['id','novelId','novel_id','bookId','nid'], '')),
    title: String(pick(raw, ['title','name','novelName','bookName'], 'Untitled')),
    author: String(pick(raw, ['author','writer','authorName','novelAuthor'], 'Unknown author')),
    summary: String(pick(raw, ['summary','description','intro','story','desc'], 'No description available.')),
    cover: String(pick(raw, ['cover','coverUrl','cover_url','image','imageUrl','pic','thumb','poster'], '') || '')
  });
  async function api(path) { const r = await fetch(API + path, { headers:{Accept:'application/json'}, cache:'no-store' }); if (!r.ok) throw Error('API '+r.status); return r.json(); }
  async function recover() {
    const route = location.hash.slice(1) || '/';
    if (!route.startsWith('/novel/')) return;
    const id = decodeURIComponent(route.slice(7)).trim();
    if (!id || !/^\d+$/.test(id)) return;
    for (let i=0; i<40; i++) { if (app.textContent.includes('Novel not found.')) break; await new Promise(r => setTimeout(r, 100)); }
    if (!app.textContent.includes('Novel not found.')) return;
    try {
      const book = bookFrom(unwrap(await api('/novel/' + encodeURIComponent(id))));
      book.id = book.id || id;
      const chapters = arrayFrom(unwrap(await api('/chapters?id=' + encodeURIComponent(book.id) + '&order=asc&p=1&l=100')));
      const cover = book.cover ? `<img src="${esc(book.cover)}" alt="${esc(book.title)}">` : '<div class="poster-fallback">🦊</div>';
      const links = chapters.map((chapter, i) => {
        const cid = String(pick(chapter, ['id','chapterId','chapter_id','cid'], ''));
        const title = String(pick(chapter, ['title','name','chapterName'], 'Chapter '+(i+1)));
        return cid ? `<a class="chapter" href="#/chapter/${encodeURIComponent(cid)}/${encodeURIComponent(book.id)}/${encodeURIComponent(book.title)}/${i}"><span>${esc(title)}</span><span>→</span></a>` : '';
      }).join('');
      const first = chapters[0] ? String(pick(chapters[0], ['id','chapterId','chapter_id','cid'], '')) : '';
      app.innerHTML = `<div class="page detail"><a class="back" href="#/">← HOME</a><div class="detail-top"><div><div class="poster">${cover}</div></div><div><div class="eyebrow">NOVEL</div><h1>${esc(book.title)}</h1><p class="author">${esc(book.author)}</p><p class="summary">${esc(book.summary)}</p>${first ? `<a class="primary" href="#/chapter/${encodeURIComponent(first)}/${encodeURIComponent(book.id)}/${encodeURIComponent(book.title)}/0">START READING</a>` : ''}</div></div><div class="chapters"><div class="chapters-heading"><div><div class="eyebrow">READ</div><h2>Chapters</h2></div><span>${chapters.length ? chapters.length+' chapters' : 'No chapters'}</span></div>${links || '<div class="status">No chapters found.</div>'}</div></div>`;
    } catch (_) {}
  }
  window.addEventListener('DOMContentLoaded', recover);
  window.addEventListener('hashchange', recover);
})();
