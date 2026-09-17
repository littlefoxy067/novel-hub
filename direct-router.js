(() => {
  const API = 'https://novel-api.nabaikabaiaguo.workers.dev';
  const app = document.getElementById('app');
  if (!app) return;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[ch]));

  const pick = (obj, keys, fallback = '') => {
    for (const key of keys) {
      if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
    }
    return fallback;
  };

  const unwrap = value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    for (const key of ['data', 'result', 'payload', 'response']) {
      if (value[key] !== undefined) return unwrap(value[key]);
    }
    return value;
  };

  const arrayFrom = value => {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    for (const key of ['items', 'list', 'records', 'chapters', 'rows', 'novels', 'books']) {
      if (Array.isArray(value[key])) return value[key];
    }
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
    const response = await fetch(API + path, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
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
      .map(chapterFrom)
      .filter(chapter => chapter.id);
  }

  function directChapterHref(chapter, book, index = 0) {
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
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'detail-more-btn';
      more.textContent = 'MORE';
      more.setAttribute('aria-expanded', 'false');
      summary.dataset.fullText = fullText;
      summary.textContent = shortText + '… ';
      summary.appendChild(more);
      summary.dataset.inlineMore = 'true';

      more.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const expanded = more.getAttribute('aria-expanded') === 'true';
        if (expanded) {
          summary.textContent = summary.dataset.fullText.slice(0, limit).trim() + '… ';
          summary.appendChild(more);
          more.textContent = 'MORE';
          more.setAttribute('aria-expanded', 'false');
        } else {
          summary.textContent = summary.dataset.fullText + ' ';
          summary.appendChild(more);
          more.textContent = 'LESS';
          more.setAttribute('aria-expanded', 'true');
        }
      });
    });
  }

  function cleanRenderedLinks() {
    document.querySelectorAll('a[href^="#/"]').forEach(link => {
      link.setAttribute('href', link.getAttribute('href').slice(1));
    });
    document.querySelectorAll('.card .more-btn').forEach(button => button.remove());
    inlineSummaryMore();
  }

  function routeFromLocation() {
    return window.location.pathname.replace(/\/+$/, '') || '/';
  }

  function routeParts() {
    return routeFromLocation().split('/').filter(Boolean).map(segment => {
      try { return decodeURIComponent(segment); } catch (_) { return segment; }
    });
  }

  function isAppPath(pathname) {
    return pathname === '/' || /^\/(search|genres|shelf|novel|chapter)(\/|$)/.test(pathname);
  }

  async function recoverNovel(id) {
    const book = await getBook(id);
    const chapters = await getChapters(book.id);
    const cover = book.cover
      ? `<img src="${esc(book.cover)}" alt="${esc(book.title)}">`
      : '<div class="poster-fallback">🦊</div>';
    const links = chapters.map((chapter, i) =>
      `<a class="chapter" href="${directChapterHref(chapter, book, i)}"><span>${esc(chapter.title)}</span><span>→</span></a>`
    ).join('');
    const first = chapters[0];

    app.innerHTML = `<div class="page detail">
      <a class="back" href="/">← HOME</a>
      <div class="detail-top">
        <div><div class="poster">${cover}</div></div>
        <div>
          <div class="eyebrow">NOVEL</div>
          <h1>${esc(book.title)}</h1>
          <p class="author">${esc(book.author)}</p>
          <p class="summary">${esc(book.summary)}</p>
          ${first ? `<a class="primary" href="${directChapterHref(first, book, 0)}">START READING</a>` : ''}
        </div>
      </div>
      <div class="chapters">
        <div class="chapters-heading"><div><div class="eyebrow">READ</div><h2>Chapters</h2></div><span>${chapters.length ? chapters.length + ' chapters' : 'No chapters'}</span></div>
        ${links || '<div class="status">No chapters found.</div>'}
      </div>
    </div>`;
    inlineSummaryMore();
    cleanRenderedLinks();
  }

  async function recoverChapter(parts) {
    const cid = parts[1] || '';
    const bookId = parts[2] || '';
    const requestedTitle = parts[3] || 'Novel';
    const requestedIndex = Number(parts[4]);
    if (!cid || !bookId) return;

    const book = await getBook(bookId);
    const chapters = await getChapters(book.id);
    const index = Number.isInteger(requestedIndex) && requestedIndex >= 0
      ? requestedIndex
      : chapters.findIndex(chapter => chapter.id === cid);
    const currentIndex = index >= 0 ? index : 0;
    const current = chapters.find(chapter => chapter.id === cid) || chapters[currentIndex];
    const data = unwrap(await api('/chapter/' + encodeURIComponent(cid)));
    const content = String(pick(data, ['content','text','body'], 'No chapter content available.'));
    const chapterTitle = String(pick(data, ['title','name','chapterName'], current?.title || requestedTitle || 'Chapter'));
    const blocks = content.replace(/\r/g, '').split(/\n{2,}/).map(x => x.trim()).filter(Boolean);
    const paragraphs = blocks.length > 1 ? blocks : content.split(/\n+/).map(x => x.trim()).filter(Boolean);
    const previous = currentIndex > 0 ? chapters[currentIndex - 1] : null;
    const next = currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;

    app.innerHTML = `<div class="reader-shell" id="directReader">
      <div class="reader-progress"><div id="directProgressFill"></div></div>
      <header class="reader-topbar">
        <div class="reader-top-left">
          <a class="reader-back" href="/novel/${encodeURIComponent(book.id)}">← <span>BACK</span></a>
          <div class="reader-book"><small>${esc(book.title)}</small><b>${esc(chapterTitle)}</b></div>
        </div>
        <div class="reader-top-tools">
          <span id="directProgressText" class="reader-progress-text">0%</span>
          <a class="reader-back" href="/novel/${encodeURIComponent(book.id)}">☰ <span>CHAPTERS</span></a>
        </div>
      </header>
      <main class="reader-main">
        <div class="reader-kicker"><span>${esc(book.title)}</span><i>·</i><span>CHAPTER ${currentIndex + 1}</span></div>
        <article class="reader-article" tabindex="-1">
          <h1>${esc(chapterTitle)}</h1>
          ${paragraphs.map(p => `<p>${esc(p)}</p>`).join('')}
        </article>
        <nav class="chapter-nav" aria-label="Chapter navigation">
          ${previous ? `<a class="chapter-nav-btn" href="${directChapterHref(previous, book, currentIndex - 1)}"><span>←</span><small>PREVIOUS</small><b>${esc(previous.title)}</b></a>` : '<span class="chapter-nav-btn disabled"><span>—</span><small>PREVIOUS</small><b>Beginning</b></span>'}
          <a class="chapter-nav-center" href="/novel/${encodeURIComponent(book.id)}"><span>CHAPTER</span><b>${currentIndex + 1} / ${chapters.length || '—'}</b><small>VIEW ALL</small></a>
          ${next ? `<a class="chapter-nav-btn next" href="${directChapterHref(next, book, currentIndex + 1)}"><small>NEXT</small><b>${esc(next.title)}</b><span>→</span></a>` : '<span class="chapter-nav-btn disabled next"><small>NEXT</small><b>End of story</b><span>—</span></span>'}
        </nav>
      </main>
    </div>`;

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
    const parts = routeParts();
    const pathname = routeFromLocation();

    try {
      if (pathname === '/') {
        if (typeof loadHome === 'function') await loadHome();
      } else if (parts[0] === 'search') {
        const term = parts.slice(1).join('/');
        if (typeof searchPage === 'function') await searchPage(encodeURIComponent(term));
      } else if (pathname === '/genres') {
        if (typeof genresPage === 'function') genresPage();
      } else if (pathname === '/shelf') {
        if (typeof shelfPage === 'function') shelfPage();
      } else if (parts[0] === 'novel' && parts[1]) {
        if (typeof novelPage === 'function') await novelPage(encodeURIComponent(parts[1]));
        if (app.textContent.includes('Novel not found.')) await recoverNovel(parts[1]);
      } else if (parts[0] === 'chapter' && parts[1] && parts[2]) {
        const cid = parts[1];
        const bookId = parts[2];
        const title = parts[3] || 'Novel';
        const index = parts[4] || '0';
        if (typeof readerPage === 'function') {
          await readerPage(encodeURIComponent(cid), encodeURIComponent(bookId), encodeURIComponent(title), encodeURIComponent(index));
        }
        if (!app.querySelector('.reader-shell') && app.textContent.includes('Open this chapter from a novel page')) {
          await recoverChapter(parts);
        }
      } else if (isAppPath(pathname)) {
        if (typeof loadHome === 'function') await loadHome();
      } else {
        app.innerHTML = '<div class="page detail"><div class="empty">Page not found.</div></div>';
      }
    } catch (_) {
      if (parts[0] === 'novel' && parts[1]) {
        try { await recoverNovel(parts[1]); } catch (_) {}
      } else if (parts[0] === 'chapter' && parts[1] && parts[2]) {
        try { await recoverChapter(parts); } catch (_) {}
      }
    }

    cleanRenderedLinks();
    app.focus({ preventScroll: true });
  }

  let scheduled = false;
  const scheduleClean = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      cleanRenderedLinks();
    });
  };

  const observer = new MutationObserver(scheduleClean);
  observer.observe(app, { childList: true, subtree: true });

  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    if (!link) return;
    const raw = link.getAttribute('href');
    if (!raw || raw.startsWith('#')) return;
    if (raw.startsWith('mailto:') || raw.startsWith('tel:') || raw.startsWith('javascript:')) return;
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
    if (!window.location.hash) return;
    const legacy = window.location.hash.replace(/^#/, '') || '/';
    if (!legacy.startsWith('/')) return;
    history.replaceState({}, '', legacy);
    renderPath();
  });

  window.addEventListener('DOMContentLoaded', () => {
    // app.js boots the catalogue too; direct paths are rendered here using the real pathname.
    setTimeout(renderPath, 0);
  });
})();
