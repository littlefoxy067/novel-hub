(() => {
  const API = 'https://novel-api.nabaikabaiaguo.workers.dev';
  const app = document.getElementById('app');
  if (!app) return;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  const pick = (obj, keys, fallback = '') => { for (const key of keys) if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key]; return fallback; };
  const unwrap = value => { if (!value || typeof value !== 'object' || Array.isArray(value)) return value; for (const key of ['data','result','payload','response']) if (value[key] !== undefined) return unwrap(value[key]); return value; };
  const arrayFrom = value => {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    for (const key of ['items','list','records','chapters','rows']) if (Array.isArray(value[key])) return value[key];
    for (const key of Object.keys(value)) if (Array.isArray(value[key])) return value[key];
    return [];
  };
  const bookFrom = raw => ({
    id: String(pick(raw, ['id','novelId','novel_id','bookId','nid'], '')),
    title: String(pick(raw, ['title','name','novelName','bookName'], 'Untitled')),
    author: String(pick(raw, ['author','writer','authorName','novelAuthor'], 'Unknown author')),
    summary: String(pick(raw, ['summary','description','intro','story','desc'], 'No description available.')),
    cover: String(pick(raw, ['cover','coverUrl','cover_url','image','imageUrl','pic','thumb','poster'], '') || '')
  });
  const chapterFrom = (raw, index) => ({
    id: String(pick(raw, ['id','chapterId','chapter_id','cid'], '')),
    title: String(pick(raw, ['title','name','chapterName'], 'Chapter ' + (index + 1))),
    index
  });

  async function api(path) {
    const r = await fetch(API + path, { headers:{Accept:'application/json'}, cache:'no-store' });
    if (!r.ok) throw Error('API ' + r.status);
    return r.json();
  }

  async function getBook(id) {
    const book = bookFrom(unwrap(await api('/novel/' + encodeURIComponent(id))));
    book.id = book.id || id;
    return book;
  }

  async function getChapters(id) {
    return arrayFrom(unwrap(await api('/chapters?id=' + encodeURIComponent(id) + '&order=asc&p=1&l=100')))
      .map(chapterFrom)
      .filter(chapter => chapter.id);
  }

  function chapterHref(chapter, book, index) {
    return '#/chapter/' + encodeURIComponent(chapter.id) + '/' + encodeURIComponent(book.id) + '/' + encodeURIComponent(book.title) + '/' + index;
  }

  function shortSummary(text, limit = 180) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (clean.length <= limit) return clean;
    const cut = clean.slice(0, limit);
    const last = cut.lastIndexOf(' ');
    return (last > 100 ? cut.slice(0, last) : cut).trim();
  }

  async function recoverNovel(id) {
    const book = await getBook(id);
    const chapters = await getChapters(book.id);
    const cover = book.cover ? `<img src="${esc(book.cover)}" alt="${esc(book.title)}">` : '<div class="poster-fallback">🦊</div>';
    const links = chapters.map((chapter, i) => `<a class="chapter" href="${chapterHref(chapter, book, i)}"><span>${esc(chapter.title)}</span><span>→</span></a>`).join('');
    const first = chapters[0];
    app.innerHTML = `<div class="page detail"><a class="back" href="#/">← HOME</a><div class="detail-top"><div><div class="poster">${cover}</div></div><div><div class="eyebrow">NOVEL</div><h1>${esc(book.title)}</h1><p class="author">${esc(book.author)}</p><p class="summary">${esc(shortSummary(book.summary))}</p>${first ? `<a class="primary" href="${chapterHref(first, book, 0)}">START READING</a>` : ''}</div></div><div class="chapters"><div class="chapters-heading"><div><div class="eyebrow">READ</div><h2>Chapters</h2></div><span>${chapters.length ? chapters.length+' chapters' : 'No chapters'}</span></div>${links || '<div class="status">No chapters found.</div>'}</div></div>`;
  }

  async function getChapterContent(cid) {
    const raw = unwrap(await api('/chapter/' + encodeURIComponent(cid)));
    let content = pick(raw, ['content','text','body','chapterContent','chapter_content'], '');
    if (content && typeof content === 'object') content = pick(content, ['content','text','body','value','path','url'], '');

    const contentPath = pick(raw, ['contentPath','content_path','contentUrl','content_url'], '');
    const candidate = contentPath || content;
    if (candidate && typeof candidate === 'string' && (/^https?:\/\//i.test(candidate) || candidate.startsWith('/content/'))) {
      try {
        const loaded = unwrap(await api(candidate));
        content = pick(loaded, ['content','text','body','value'], loaded);
      } catch (_) {}
    }
    return {
      title: String(pick(raw, ['title','name','chapterName'], 'Chapter')),
      content: String(content || 'No chapter content available.')
    };
  }

  async function recoverChapter(parts) {
    const cid = decodeURIComponent(parts[2] || '').trim();
    const bookId = decodeURIComponent(parts[3] || '').trim();
    const fallbackTitle = decodeURIComponent(parts[4] || '').trim() || 'Novel';
    if (!cid || !bookId) return;

    const book = await getBook(bookId);
    const chapters = await getChapters(book.id);
    const requested = Number(parts[5]);
    const foundIndex = chapters.findIndex(ch => ch.id === cid);
    const index = Number.isInteger(requested) && requested >= 0 && requested < chapters.length ? requested : Math.max(0, foundIndex);
    const current = chapters.find(ch => ch.id === cid) || chapters[index] || { title: fallbackTitle };
    const chapter = await getChapterContent(cid);
    const chapterTitle = chapter.title === 'Chapter' ? current.title : chapter.title;
    const content = chapter.content.replace(/\r/g, '').trim();
    const paragraphs = content.split(/\n{2,}/).map(x => x.trim()).filter(Boolean);
    const lines = paragraphs.length > 1 ? paragraphs : content.split(/\n+/).map(x => x.trim()).filter(Boolean);
    const previous = index > 0 ? chapters[index - 1] : null;
    const next = index < chapters.length - 1 ? chapters[index + 1] : null;

    app.innerHTML = `<div class="reader-shell" id="recoveredReader"><div class="reader-progress"><div id="recoveredProgressFill"></div></div><header class="reader-topbar"><div class="reader-top-left"><a class="reader-back" href="#/novel/${encodeURIComponent(book.id)}">← <span>BACK</span></a><div class="reader-book"><small>${esc(book.title)}</small><b>${esc(chapterTitle)}</b></div></div><div class="reader-top-tools"><span id="recoveredProgressText" class="reader-progress-text">0%</span><a class="reader-back" href="#/novel/${encodeURIComponent(book.id)}">☰ <span>CHAPTERS</span></a></div></header><main class="reader-main"><div class="reader-kicker"><span>${esc(book.title)}</span><i>·</i><span>CHAPTER ${index + 1}</span></div><article class="reader-article" tabindex="-1"><h1>${esc(chapterTitle)}</h1>${lines.map(p => `<p>${esc(p)}</p>`).join('')}</article><nav class="chapter-nav" aria-label="Chapter navigation">${previous ? `<a class="chapter-nav-btn" href="${chapterHref(previous, book, index - 1)}"><span>←</span><small>PREVIOUS</small><b>${esc(previous.title)}</b></a>` : '<span class="chapter-nav-btn disabled"><span>—</span><small>PREVIOUS</small><b>Beginning</b></span>'}<a class="chapter-nav-center" href="#/novel/${encodeURIComponent(book.id)}"><span>CHAPTER</span><b>${index + 1} / ${chapters.length || '—'}</b><small>VIEW ALL</small></a>${next ? `<a class="chapter-nav-btn next" href="${chapterHref(next, book, index + 1)}"><small>NEXT</small><b>${esc(next.title)}</b><span>→</span></a>` : '<span class="chapter-nav-btn disabled next"><small>NEXT</small><b>End of story</b><span>—</span></span>'}</nav></main></div>`;

    const updateProgress = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const value = Math.min(1, Math.max(0, window.scrollY / max));
      const fill = document.getElementById('recoveredProgressFill');
      const text = document.getElementById('recoveredProgressText');
      if (fill) fill.style.transform = `scaleX(${value})`;
      if (text) text.textContent = Math.round(value * 100) + '%';
    };
    window.addEventListener('scroll', updateProgress, { passive:true });
    setTimeout(updateProgress, 100);
  }

  async function recover() {
    const route = location.hash.slice(1) || '/';
    try {
      if (route.startsWith('/novel/')) {
        const id = decodeURIComponent(route.slice(7)).trim();
        if (!id || !/^\d+$/.test(id)) return;
        for (let i = 0; i < 20; i++) {
          if (app.querySelector('.detail') || app.textContent.includes('Novel not found.')) break;
          await new Promise(r => setTimeout(r, 100));
        }
        if (app.textContent.includes('Novel not found.')) await recoverNovel(id);
      } else if (route.startsWith('/chapter/')) {
        const parts = route.split('/');
        // A chapter URL is authoritative. If the main router leaves the user on the
        // novel page or an error page, recover the reader from the URL itself.
        for (let i = 0; i < 12; i++) {
          if (app.querySelector('.reader-shell')) return;
          await new Promise(r => setTimeout(r, 100));
        }
        if (!app.querySelector('.reader-shell')) await recoverChapter(parts);
      }
    } catch (_) {
      // Keep the normal app visible if the API itself is unavailable.
    }
  }

  document.addEventListener('click', event => {
    const link = event.target.closest('a.chapter, a.chapter-nav-btn, a.chapter-nav-center');
    if (!link || !link.getAttribute('href')?.startsWith('#/chapter/')) return;
    event.preventDefault();
    const href = link.getAttribute('href');
    if (location.hash === href) recover();
    else location.hash = href.slice(1);
  }, true);

  window.addEventListener('DOMContentLoaded', recover);
  window.addEventListener('hashchange', recover);
})();
