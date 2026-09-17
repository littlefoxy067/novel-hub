(() => {
  const API = 'https://novel-api.nabaikabaiaguo.workers.dev';
  const app = document.getElementById('app');
  if (!app) return;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  const pick = (obj, keys, fallback = '') => {
    for (const key of keys) {
      if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
    }
    return fallback;
  };
  const unwrap = value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    for (const key of ['data','result','payload','response']) if (value[key] !== undefined) return unwrap(value[key]);
    return value;
  };
  const arrayFrom = value => {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    for (const key of ['items','list','records','chapters','rows','novels','books']) if (Array.isArray(value[key])) return value[key];
    for (const key of Object.keys(value)) if (Array.isArray(value[key])) return value[key];
    return [];
  };
  const bookFrom = raw => ({
    id: String(pick(raw, ['id','novelId','novel_id','bookId','nid'], '')),
    title: String(pick(raw, ['title','name','novelName','bookName'], 'Untitled')),
    author: String(pick(raw, ['author','writer','authorName','novelAuthor'], 'Unknown author')),
    summary: String(pick(raw, ['summary','description','intro','story','desc'], 'No description available.')),
    cover: String(pick(raw, ['cover','coverUrl','cover_url','image','imageUrl','pic','thumb','poster'], '') || ''),
    genre: String(pick(raw, ['genre','category','genres','type'], 'Novel')),
  });
  const chapterFrom = (raw, index) => ({
    id: String(pick(raw, ['id','chapterId','chapter_id','cid'], '')),
    title: String(pick(raw, ['title','name','chapterName'], `Chapter ${index + 1}`)),
    index,
  });

  async function api(path) {
    const response = await fetch(API + path, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error(`API ${response.status}`);
    return response.json();
  }

  async function getBook(id) {
    const book = bookFrom(unwrap(await api('/novel/' + encodeURIComponent(id))));
    book.id = book.id || id;
    return book;
  }

  async function getChapters(id) {
    return arrayFrom(unwrap(await api('/chapters?id=' + encodeURIComponent(id) + '&order=asc&p=1&l=100')))
      .map(chapterFrom).filter(chapter => chapter.id);
  }

  function chapterHref(chapter, book, index = 0) {
    return `/chapter/${encodeURIComponent(chapter.id)}/${encodeURIComponent(book.id)}/${encodeURIComponent(book.title)}/${index}`;
  }

  function inlineSummaryMore() {
    document.querySelectorAll('.detail .summary').forEach(summary => {
      if (summary.dataset.inlineMore === 'true') return;
      const fullText = summary.textContent.trim();
      const limit = 180;
      if (!fullText || fullText.length <= limit) {
        summary.dataset.inlineMore = 'true';
        return;
      }
      const cut = fullText.slice(0, limit);
      const lastSpace = cut.lastIndexOf(' ');
      const shortText = (lastSpace > 100 ? cut.slice(0, lastSpace) : cut).trim();
      summary.dataset.fullText = fullText;
      summary.innerHTML = '';
      const text = document.createElement('span');
      text.textContent = shortText + '… ';
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'detail-more-btn';
      more.textContent = 'MORE';
      more.setAttribute('aria-expanded', 'false');
      summary.append(text, more);
      summary.dataset.inlineMore = 'true';
      more.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const expanded = more.getAttribute('aria-expanded') === 'true';
        text.textContent = expanded ? shortText + '… ' : fullText + ' ';
        more.textContent = expanded ? 'MORE' : 'LESS';
        more.setAttribute('aria-expanded', String(!expanded));
      });
    });
  }

  function cleanRenderedLinks() {
    document.querySelectorAll('a[href^="#/"]').forEach(link => link.setAttribute('href', link.getAttribute('href').slice(1)));
    inlineSummaryMore();
  }

  function pathname() {
    return window.location.pathname.replace(/\/+$/, '') || '/';
  }

  function parts() {
    return pathname().split('/').filter(Boolean).map(segment => {
      try { return decodeURIComponent(segment); } catch (_) { return segment; }
    });
  }

  function isAppPath(path) {
    return path === '/' || /^\/(search|genres|shelf|novel|chapter)(\/|$)/.test(path);
  }

  async function renderNovel(id) {
    const book = await getBook(id);
    const chapters = await getChapters(book.id);
    const cover = book.cover ? `<img src="${esc(book.cover)}" alt="${esc(book.title)}">` : '<div class="poster-fallback">🦊</div>';
    const first = chapters[0];
    app.innerHTML = `<div class="page detail">
      <a class="back" href="/">← HOME</a>
      <div class="detail-top"><div><div class="poster">${cover}</div></div><div>
        <div class="eyebrow">NOVEL</div><h1>${esc(book.title)}</h1><p class="author">${esc(book.author)}</p>
        <p class="summary">${esc(book.summary)}</p>
        ${first ? `<a class="primary" href="${chapterHref(first, book, 0)}">START READING</a>` : ''}
      </div></div>
      <div class="chapters"><div class="chapters-heading"><div><div class="eyebrow">READ</div><h2>Chapters</h2></div><span>${chapters.length ? chapters.length + ' chapters' : 'No chapters'}</span></div>
      ${chapters.map((chapter, i) => `<a class="chapter" href="${chapterHref(chapter, book, i)}"><span>${esc(chapter.title)}</span><span>→</span></a>`).join('') || '<div class="status">No chapters found.</div>'}</div>
    </div>`;
    inlineSummaryMore();
    cleanRenderedLinks();
  }

  async function getChapterContent(cid) {
    const raw = unwrap(await api('/chapter/' + encodeURIComponent(cid)));
    let content = pick(raw, ['content','text','body','chapterContent','chapter_content'], '');
    const contentPath = pick(raw, ['contentPath','content_path','contentUrl','content_url'], '');
    const candidate = contentPath || content;
    if (candidate && typeof candidate === 'string' && (/^https?:\/\//i.test(candidate) || candidate.startsWith('/content/'))) {
      try {
        const loaded = unwrap(await api(candidate));
        content = pick(loaded, ['content','text','body','value'], loaded);
      } catch (_) {}
    }
    if (content && typeof content === 'object') content = pick(content, ['content','text','body','value'], '');
    return {
      title: String(pick(raw, ['title','name','chapterName'], 'Chapter')),
      content: String(content || 'No chapter content available.'),
    };
  }

  async function renderChapter(partsList) {
    const cid = partsList[1] || '';
    const bookId = partsList[2] || '';
    const requestedTitle = partsList[3] || 'Novel';
    const requestedIndex = Number(partsList[4]);
    if (!cid || !bookId) throw new Error('Invalid chapter route');

    const book = await getBook(bookId);
    const chapters = await getChapters(book.id);
    const foundIndex = chapters.findIndex(chapter => chapter.id === cid);
    const currentIndex = Number.isInteger(requestedIndex) && requestedIndex >= 0 && requestedIndex < chapters.length
      ? requestedIndex : Math.max(0, foundIndex);
    const current = chapters.find(chapter => chapter.id === cid) || chapters[currentIndex];
    const chapter = await getChapterContent(cid);
    const chapterTitle = chapter.title === 'Chapter' ? (current?.title || requestedTitle) : chapter.title;
    const content = chapter.content.replace(/\r/g, '').trim();
    const blocks = content.split(/\n{2,}/).map(x => x.trim()).filter(Boolean);
    const paragraphs = blocks.length > 1 ? blocks : content.split(/\n+/).map(x => x.trim()).filter(Boolean);
    const previous = currentIndex > 0 ? chapters[currentIndex - 1] : null;
    const next = currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;

    app.innerHTML = `<div class="reader-shell" id="directReader">
      <div class="reader-progress"><div id="directProgressFill"></div></div>
      <header class="reader-topbar"><div class="reader-top-left">
        <a class="reader-back" href="/novel/${encodeURIComponent(book.id)}">← <span>BACK</span></a>
        <div class="reader-book"><small>${esc(book.title)}</small><b>${esc(chapterTitle)}</b></div>
      </div><div class="reader-top-tools"><span id="directProgressText" class="reader-progress-text">0%</span>
        <a class="reader-back" href="/novel/${encodeURIComponent(book.id)}">☰ <span>CHAPTERS</span></a>
      </div></header>
      <main class="reader-main"><div class="reader-kicker"><span>${esc(book.title)}</span><i>·</i><span>CHAPTER ${currentIndex + 1}</span></div>
        <article class="reader-article" tabindex="-1"><h1>${esc(chapterTitle)}</h1>${paragraphs.map(p => `<p>${esc(p)}</p>`).join('')}</article>
        <nav class="chapter-nav" aria-label="Chapter navigation">
          ${previous ? `<a class="chapter-nav-btn" href="${chapterHref(previous, book, currentIndex - 1)}"><span>←</span><small>PREVIOUS</small><b>${esc(previous.title)}</b></a>` : '<span class="chapter-nav-btn disabled"><span>—</span><small>PREVIOUS</small><b>Beginning</b></span>'}
          <a class="chapter-nav-center" href="/novel/${encodeURIComponent(book.id)}"><span>CHAPTER</span><b>${currentIndex + 1} / ${chapters.length || '—'}</b><small>VIEW ALL</small></a>
          ${next ? `<a class="chapter-nav-btn next" href="${chapterHref(next, book, currentIndex + 1)}"><small>NEXT</small><b>${esc(next.title)}</b><span>→</span></a>` : '<span class="chapter-nav-btn disabled next"><small>NEXT</small><b>End of story</b><span>—</span></span>'}
        </nav>
      </main></div>`;

    const updateProgress = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const value = Math.min(1, Math.max(0, window.scrollY / max));
      const fill = document.getElementById('directProgressFill');
      const text = document.getElementById('directProgressText');
      if (fill) fill.style.transform = `scaleX(${value})`;
      if (text) text.textContent = Math.round(value * 100) + '%';
    };
    window.addEventListener('scroll', updateProgress, { passive: true });
    setTimeout(updateProgress, 0);
    cleanRenderedLinks();
  }

  async function renderPath() {
    cleanRenderedLinks();
    const current = pathname();
    const route = parts();
    try {
      if (current === '/') {
        if (typeof loadHome === 'function') await loadHome();
      } else if (route[0] === 'search') {
        const term = route.slice(1).join('/');
        if (typeof searchPage === 'function') await searchPage(encodeURIComponent(term));
      } else if (current === '/genres') {
        if (typeof genresPage === 'function') genresPage();
      } else if (current === '/shelf') {
        if (typeof shelfPage === 'function') shelfPage();
      } else if (route[0] === 'novel' && route[1]) {
        // The pathname is the source of truth, exactly like Foxflix's /movie/:id route.
        await renderNovel(route[1]);
      } else if (route[0] === 'chapter' && route[1] && route[2]) {
        // Never depend on the previous novel page/cache. The chapter URL contains everything needed.
        await renderChapter(route);
      } else if (isAppPath(current)) {
        if (typeof loadHome === 'function') await loadHome();
      } else {
        app.innerHTML = '<div class="page detail"><div class="empty">Page not found.</div></div>';
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load this page.';
      app.innerHTML = `<div class="page detail"><div class="empty">${esc(message)}</div></div>`;
    }
    cleanRenderedLinks();
    app.focus({ preventScroll: true });
  }

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; cleanRenderedLinks(); });
  });
  observer.observe(app, { childList: true, subtree: true });

  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    if (!link) return;
    const raw = link.getAttribute('href');
    if (!raw || raw.startsWith('#')) return;
    if (/^(mailto:|tel:|javascript:)/i.test(raw)) return;
    let url;
    try { url = new URL(raw, window.location.origin); } catch (_) { return; }
    if (url.origin !== window.location.origin || !isAppPath(url.pathname)) return;
    event.preventDefault();
    history.pushState({}, '', url.pathname + url.search);
    window.scrollTo(0, 0);
    renderPath();
  }, true);

  document.addEventListener('submit', event => {
    const form = event.target;
    if (!form || !form.matches('#navSearch, #heroSearch, #searchForm')) return;
    event.preventDefault();
    event.stopPropagation();
    const input = form.querySelector('input[type="search"], input');
    const value = String(input?.value || '').trim();
    if (!value) return;
    history.pushState({}, '', '/search/' + encodeURIComponent(value));
    window.scrollTo(0, 0);
    renderPath();
  }, true);

  window.addEventListener('popstate', () => {
    window.scrollTo(0, 0);
    renderPath();
  });

  window.addEventListener('hashchange', () => {
    const legacy = window.location.hash.replace(/^#/, '');
    if (!legacy.startsWith('/')) return;
    history.replaceState({}, '', legacy);
    renderPath();
  });

  window.addEventListener('DOMContentLoaded', () => {
    const legacy = window.location.hash.replace(/^#/, '');
    if (legacy.startsWith('/')) {
      history.replaceState({}, '', legacy);
    }
    setTimeout(renderPath, 0);
  });
})();
