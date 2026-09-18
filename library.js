(() => {
  'use strict';

  const STORE_KEY = 'novelhub-local-library-v1';
  const SEARCH_KEY = 'novelhub-local-searches-v1';
  const USER_KEY = 'novelhub-local-user-v1';
  const MAX_HISTORY = 80;
  const MAX_BOOKS = 160;
  const MAX_BOOKMARKS = 40;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const now = () => Date.now();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));

  function makeId() {
    try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (_) {}
    return 'local-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function getUserId() {
    let id = localStorage.getItem(USER_KEY);
    if (!id) { id = makeId(); localStorage.setItem(USER_KEY, id); }
    return id;
  }

  function load() {
    try {
      const value = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      return {
        userId: String(value.userId || getUserId()),
        books: value.books && typeof value.books === 'object' ? value.books : {},
        history: Array.isArray(value.history) ? value.history : [],
      };
    } catch (_) {
      return { userId: getUserId(), books: {}, history: [] };
    }
  }

  function save(data) {
    try {
      const keys = Object.keys(data.books || {});
      if (keys.length > MAX_BOOKS) {
        keys.sort((a, b) => Number(data.books[b]?.lastOpened || 0) - Number(data.books[a]?.lastOpened || 0));
        for (const key of keys.slice(MAX_BOOKS)) delete data.books[key];
      }
      data.history = (data.history || []).slice(0, MAX_HISTORY);
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
    } catch (_) {}
  }

  function searchesLoad() {
    try {
      const value = JSON.parse(localStorage.getItem(SEARCH_KEY) || '[]');
      return Array.isArray(value) ? value.slice(0, 12) : [];
    } catch (_) { return []; }
  }

  function rememberSearch(term) {
    const value = String(term || '').trim();
    if (!value) return;
    const list = searchesLoad().filter(item => item.toLowerCase() !== value.toLowerCase());
    list.unshift(value);
    try { localStorage.setItem(SEARCH_KEY, JSON.stringify(list.slice(0, 12))); } catch (_) {}
  }

  function normalizeBook(book = {}) {
    const id = String(book.id || book.novelId || book.novel_id || '').trim();
    if (!id) return null;
    return {
      id,
      title: String(book.title || 'Untitled').trim().slice(0, 180),
      author: String(book.author || 'Unknown author').trim().slice(0, 140),
      cover: String(book.cover || '').trim().slice(0, 600),
      detailPath: String(book.detailPath || '').trim().slice(0, 600),
      genre: String(book.genre || '').trim().slice(0, 100),
    };
  }

  function bookFromNovelUrl(url) {
    try {
      const value = new URL(url, location.origin);
      const parts = value.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      if (parts[0] !== 'novel' || !parts[1]) return null;
      return { id: parts[1], detailPath: value.searchParams.get('source') || '' };
    } catch (_) { return null; }
  }

  function bookFromChapterUrl(url) {
    try {
      const value = new URL(url, location.origin);
      const parts = value.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      if (parts[0] !== 'chapter' || !parts[1] || !parts[2]) return null;
      return { chapterId: parts[1], id: parts[2], index: Number(parts[3] || 0), detailPath: value.searchParams.get('source') || '' };
    } catch (_) { return null; }
  }

  function upsertBook(book, patch = {}) {
    const normalized = normalizeBook(book || {});
    if (!normalized) return null;
    const data = load();
    const current = data.books[normalized.id] || {};
    data.books[normalized.id] = { ...current, ...normalized, ...patch, lastOpened: now() };
    save(data);
    return data.books[normalized.id];
  }

  function touchHistory(id) {
    const data = load();
    data.history = [String(id), ...data.history.filter(item => String(item) !== String(id))].slice(0, MAX_HISTORY);
    save(data);
  }

  function currentBookFromDetail() {
    const match = bookFromNovelUrl(location.href);
    if (!match) return null;
    const title = $('.detail h1')?.textContent?.trim();
    const author = $('.detail .author')?.textContent?.trim();
    const img = $('.detail .poster img')?.getAttribute('src') || '';
    return upsertBook({ id: match.id, title, author, cover: img, detailPath: match.detailPath }, { status: load().books[match.id]?.status || 'want' });
  }

  function currentBookFromReader() {
    const match = bookFromChapterUrl(location.href);
    if (!match) return null;
    const data = load();
    const old = data.books[match.id] || {};
    const title = $('#readerRoot .reader-book small')?.textContent?.trim() || old.title || 'Novel';
    const chapterTitle = $('#readerRoot .reader-article h1')?.textContent?.trim() || 'Chapter';
    return upsertBook({ id: match.id, title, author: old.author, cover: old.cover, detailPath: match.detailPath || old.detailPath }, {
      status: old.status === 'completed' ? 'completed' : 'reading',
      lastChapterId: match.chapterId,
      lastChapterIndex: Number.isFinite(match.index) ? match.index : 0,
      lastChapterTitle: chapterTitle,
      lastOpened: now(),
    });
  }

  function getReadingData(id) {
    return load().books[String(id)] || null;
  }

  function setProgressFromReader() {
    const match = bookFromChapterUrl(location.href);
    const article = $('#readerArticle');
    if (!match || !article) return;
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const progress = Math.max(0, Math.min(1, window.scrollY / max));
    const data = load();
    const current = data.books[match.id];
    if (!current) return;
    current.progress = progress;
    current.lastChapterId = match.chapterId;
    current.lastChapterIndex = Number.isFinite(match.index) ? match.index : 0;
    current.lastOpened = now();
    if (progress >= 0.96 && current.isLastChapter) current.status = 'completed';
    data.books[match.id] = current;
    save(data);
    updateContinueBars();
  }

  function captureChapterList() {
    if (!location.pathname.startsWith('/novel/')) return;
    const match = bookFromNovelUrl(location.href);
    if (!match) return;
    const data = load();
    const record = data.books[match.id];
    if (!record) return;
    const chapters = $$('.detail .chapter');
    if (!chapters.length) return;
    record.chapterCount = chapters.length;
    const lastHref = chapters[chapters.length - 1]?.getAttribute('href') || '';
    const last = bookFromChapterUrl(lastHref);
    record.lastChapterIdKnown = last?.chapterId || '';
    data.books[match.id] = record;
    save(data);
  }

  function setLastChapterFlag() {
    const match = bookFromChapterUrl(location.href);
    if (!match) return;
    const data = load();
    const record = data.books[match.id];
    if (!record) return;
    if (record.chapterCount && Number(match.index) >= record.chapterCount - 1) record.isLastChapter = true;
    data.books[match.id] = record;
    save(data);
  }

  function markCompleted(id) {
    const data = load();
    const record = data.books[String(id)];
    if (!record) return;
    record.status = 'completed';
    record.progress = 1;
    record.completedAt = now();
    data.books[String(id)] = record;
    save(data);
    toast('Marked as completed');
    refreshPageEnhancements();
  }

  function setWantToRead(id, value = true) {
    const data = load();
    const record = data.books[String(id)];
    if (!record) return;
    if (value && record.status === 'completed') record.status = 'want';
    if (value && !record.status) record.status = 'want';
    record.want = Boolean(value);
    data.books[String(id)] = record;
    save(data);
  }

  function toggleFavorite(id) {
    const data = load();
    const record = data.books[String(id)];
    if (!record) return false;
    record.favorite = !record.favorite;
    data.books[String(id)] = record;
    save(data);
    return record.favorite;
  }

  function toggleBookmark(id, chapterId, chapterTitle, index, progress = 0) {
    const data = load();
    const record = data.books[String(id)];
    if (!record) return false;
    record.bookmarks = Array.isArray(record.bookmarks) ? record.bookmarks : [];
    const found = record.bookmarks.findIndex(item => String(item.chapterId) === String(chapterId));
    if (found >= 0) {
      record.bookmarks.splice(found, 1);
      data.books[String(id)] = record;
      save(data);
      return false;
    }
    record.bookmarks.unshift({ chapterId: String(chapterId), title: String(chapterTitle || 'Chapter').slice(0, 180), index: Number(index || 0), progress: Number(progress || 0), savedAt: now() });
    record.bookmarks = record.bookmarks.slice(0, MAX_BOOKMARKS);
    data.books[String(id)] = record;
    save(data);
    return true;
  }

  function notifyParentShelfClick(button) {
    const key = button.dataset.save || '';
    if (!key) return;
    setTimeout(() => {
      const detail = bookFromNovelUrl(location.href);
      if (detail && detail.id === key) {
        const record = currentBookFromDetail();
        if (record) record.want = document.getElementById('saveBook')?.textContent?.includes('SAVED');
        return;
      }
      const data = load();
      const record = data.books[key];
      if (record) {
        record.want = !record.want;
        if (record.want && record.status !== 'completed') record.status = 'want';
        data.books[key] = record;
        save(data);
      }
    }, 50);
  }

  function scanVisibleCards() {
    $$('.card').forEach(card => {
      const link = card.querySelector('a[href*="/novel/"]');
      if (!link) return;
      const parsed = bookFromNovelUrl(link.getAttribute('href'));
      if (!parsed?.id) return;
      const img = card.querySelector('img')?.getAttribute('src') || '';
      const title = card.querySelector('h3')?.textContent?.trim() || 'Untitled';
      const author = card.querySelector('small')?.textContent?.trim() || 'Unknown author';
      upsertBook({ ...parsed, title, author, cover: img }, {});
    });
  }

  function formatPct(value) { return Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100) + '%'; }

  function localBookHref(book) {
    if (!book?.id) return '/';
    const source = book.detailPath ? '?source=' + encodeURIComponent(book.detailPath) : '';
    return '/novel/' + encodeURIComponent(book.id) + source;
  }

  function localChapterHref(book, bookmark) {
    if (!book?.id || !bookmark?.chapterId) return localBookHref(book);
    const source = book.detailPath ? '&source=' + encodeURIComponent(book.detailPath) : '';
    return '/chapter/' + encodeURIComponent(bookmark.chapterId) + '/' + encodeURIComponent(book.id) + '/' + encodeURIComponent(bookmark.index || 0) + (source ? '?' + source.slice(1) : '');
  }

  function compactCard(book, mode = 'continue') {
    const progress = Number(book.progress || 0);
    const action = mode === 'continue' && book.lastChapterId
      ? `/chapter/${encodeURIComponent(book.lastChapterId)}/${encodeURIComponent(book.id)}/${encodeURIComponent(book.lastChapterIndex || 0)}${book.detailPath ? '?source=' + encodeURIComponent(book.detailPath) : ''}`
      : localBookHref(book);
    const label = mode === 'continue' ? (progress > 0 ? 'CONTINUE' : 'START') : 'DETAILS';
    return `<article class="local-card"><a class="local-poster" href="${action}">${book.cover ? `<img src="${esc(book.cover)}" alt="${esc(book.title)}" loading="lazy" onerror="this.style.display='none'">` : '<span>🦊</span>'}</a><div class="local-card-copy"><div class="eyebrow">${mode === 'continue' ? 'CONTINUE READING' : 'FOXY PICK'}</div><h3><a href="${action}">${esc(book.title)}</a></h3><small>${esc(book.author || 'Unknown author')}</small>${mode === 'continue' ? `<div class="local-progress"><span style="width:${formatPct(progress)}"></span></div><div class="local-card-meta"><span>${formatPct(progress)} read${book.lastChapterTitle ? ' · ' + esc(book.lastChapterTitle) : ''}</span><a href="${action}">${label} →</a></div>` : `<div class="local-card-meta"><span>${book.favorite ? '♥ Favorite' : 'Picked for you'}</span><a href="${action}">OPEN →</a></div>`}</div></article>`;
  }

  function ensureLocalSection(id, className, html) {
    if (!$('#app') || document.getElementById(id)) return;
    const node = document.createElement('section');
    node.id = id;
    node.className = `section local-section ${className}`;
    node.innerHTML = html;
    const firstSection = $('.home-page .section');
    if (firstSection) firstSection.before(node);
    else $('#app').appendChild(node);
  }

  function homeEnhancements() {
    scanVisibleCards();
    const data = load();
    const books = Object.values(data.books || {});
    const continuing = books.filter(book => book.status === 'reading' && book.lastChapterId && book.status !== 'completed').sort((a,b) => Number(b.lastOpened||0) - Number(a.lastOpened||0)).slice(0, 6);
    if (continuing.length) {
      ensureLocalSection('continueReadingSection', 'continue-section', `<div class="head"><div><div class="eyebrow">YOUR STORY</div><h2>Continue Reading</h2></div><a href="/shelf">VIEW SHELF →</a></div><div class="local-row">${continuing.map(book => compactCard(book, 'continue')).join('')}</div>`);
    }

    const favorites = books.filter(book => book.favorite);
    const visible = $$('.home-page .card').map(card => {
      const link = card.querySelector('a[href*="/novel/"]');
      const p = link ? bookFromNovelUrl(link.getAttribute('href')) : null;
      return p ? { id:p.id, detailPath:p.detailPath, title:card.querySelector('h3')?.textContent?.trim()||'Untitled', author:card.querySelector('small')?.textContent?.trim()||'Unknown author', cover:card.querySelector('img')?.getAttribute('src')||'' } : null;
    }).filter(Boolean);
    const favAuthors = new Set(favorites.map(book => (book.author || '').toLowerCase()).filter(Boolean));
    const picks = visible.filter(book => !continuing.some(item => item.id === book.id)).sort((a,b) => Number(favAuthors.has((b.author||'').toLowerCase())) - Number(favAuthors.has((a.author||'').toLowerCase()))).slice(0, 5);
    if (picks.length) ensureLocalSection('foxyPicksSection', 'picks-section', `<div class="head"><div><div class="eyebrow">FOXY AI — LOCAL PICKS</div><h2>Foxy Picks</h2></div><span class="status">Based on your local library</span></div><div class="local-row">${picks.map(book => compactCard(book, 'picks')).join('')}</div>`);
  }

  function detailEnhancements() {
    const book = currentBookFromDetail();
    if (!book || document.getElementById('localDetailTools')) return;
    touchHistory(book.id);
    captureChapterList();
    const host = $('.detail .detail-top > div:last-child');
    if (!host) return;
    const tools = document.createElement('div');
    tools.id = 'localDetailTools';
    tools.className = 'local-tools';
    tools.innerHTML = `<button type="button" class="local-tool" data-local-favorite>${book.favorite ? '♥ FAVORITED' : '♥ FAVORITE'}</button><button type="button" class="local-tool" data-local-share>↗ SHARE</button><button type="button" class="local-tool" data-local-complete>${book.status === 'completed' ? '✓ COMPLETED' : 'MARK COMPLETED'}</button>`;
    host.appendChild(tools);
    tools.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.hasAttribute('data-local-favorite')) {
        const favorite = toggleFavorite(book.id);
        button.textContent = favorite ? '♥ FAVORITED' : '♥ FAVORITE';
        toast(favorite ? 'Added to favorites' : 'Removed from favorites');
      } else if (button.hasAttribute('data-local-share')) shareNovel(book);
      else if (button.hasAttribute('data-local-complete')) { markCompleted(book.id); button.textContent = '✓ COMPLETED'; }
    });
  }

  function readerEnhancements() {
    const match = bookFromChapterUrl(location.href);
    if (!match || !$('#readerRoot') || document.getElementById('localReaderTools')) return;
    const book = currentBookFromReader();
    if (!book) return;
    touchHistory(book.id);
    setLastChapterFlag();
    const tools = document.createElement('div');
    tools.id = 'localReaderTools';
    tools.className = 'local-reader-tools';
    const data = load().books[book.id] || book;
    const currentBookmark = (data.bookmarks || []).some(item => String(item.chapterId) === String(match.chapterId));
    tools.innerHTML = `<button type="button" class="reader-tool" data-local-bookmark>${currentBookmark ? '🔖 SAVED' : '🔖 SAVE'}</button><button type="button" class="reader-tool" data-local-complete>${data.status === 'completed' ? '✓ DONE' : '✓ COMPLETE'}</button>`;
    $('.reader-top-tools')?.prepend(tools);
    tools.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.hasAttribute('data-local-bookmark')) {
        const article = $('#readerArticle');
        const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        const progress = Math.max(0, Math.min(1, window.scrollY / max));
        const chapterTitle = article?.querySelector('h1')?.textContent?.trim() || 'Chapter';
        const added = toggleBookmark(book.id, match.chapterId, chapterTitle, match.index, progress);
        button.textContent = added ? '🔖 SAVED' : '🔖 SAVE';
        toast(added ? 'Chapter bookmarked' : 'Bookmark removed');
      } else if (button.hasAttribute('data-local-complete')) {
        markCompleted(book.id);
        button.textContent = '✓ DONE';
      }
    });
  }

  function shelfEnhancements() {
    scanVisibleCards();
    const data = load();
    $$('.card').forEach(card => {
      const link = card.querySelector('a[href*="/novel/"]');
      const parsed = link ? bookFromNovelUrl(link.getAttribute('href')) : null;
      if (parsed?.id) setWantToRead(parsed.id, true);
    });
    if (document.getElementById('localShelfDashboard')) return;
    const books = Object.values(load().books || {});
    const reading = books.filter(book => book.status === 'reading' && book.lastChapterId).sort((a,b) => Number(b.lastOpened||0)-Number(a.lastOpened||0));
    const completed = books.filter(book => book.status === 'completed');
    const favorites = books.filter(book => book.favorite);
    const wanted = books.filter(book => book.want && book.status !== 'completed');
    const history = books.filter(book => (load().history || []).includes(book.id)).sort((a,b) => Number(b.lastOpened||0)-Number(a.lastOpened||0));
    const bookmarks = books.flatMap(book => (book.bookmarks || []).map(item => ({ book, item }))).sort((a,b) => Number(b.item.savedAt||0)-Number(a.item.savedAt||0)).slice(0, 12);
    const dashboard = document.createElement('section');
    dashboard.id = 'localShelfDashboard';
    dashboard.className = 'local-library-dashboard';
    dashboard.innerHTML = `<div class="library-intro"><div><div class="eyebrow">LOCAL LIBRARY</div><h2>Your reading space</h2><p>This library lives on this device for speed and privacy. It stores lightweight references, not the novel text.</p></div><div class="local-id">LOCAL ID<br><b>${esc(getUserId().slice(0, 12))}</b></div></div><div class="library-tabs" role="tablist"><button class="active" data-tab="all">ALL <span>${books.length}</span></button><button data-tab="reading">READING <span>${reading.length}</span></button><button data-tab="want">WANT TO READ <span>${wanted.length}</span></button><button data-tab="completed">COMPLETED <span>${completed.length}</span></button><button data-tab="favorites">FAVORITES <span>${favorites.length}</span></button><button data-tab="history">HISTORY <span>${history.length}</span></button><button data-tab="bookmarks">BOOKMARKS <span>${bookmarks.length}</span></button></div><div class="library-tab-body" data-tab-body="all"></div>`;
    $('#app')?.prepend(dashboard);
    const body = $('[data-tab-body]', dashboard);
    const renderTab = type => {
      const currentBooks = type === 'reading' ? reading : type === 'want' ? wanted : type === 'completed' ? completed : type === 'favorites' ? favorites : type === 'history' ? history : books;
      if (type === 'bookmarks') {
        body.innerHTML = bookmarks.length ? `<div class="bookmark-list">${bookmarks.map(({book,item}) => `<a class="bookmark-item" href="${localChapterHref(book,item)}"><span>🔖</span><div><b>${esc(item.title)}</b><small>${esc(book.title)} · ${formatPct(item.progress)}</small></div><strong>→</strong></a>`).join('')}</div>` : '<div class="empty">No chapter bookmarks yet.</div>';
      } else {
        body.innerHTML = currentBooks.length ? `<div class="local-library-grid">${currentBooks.slice(0, 40).map(book => compactCard(book, 'picks')).join('')}</div>` : '<div class="empty">Nothing here yet. Keep reading and your local library will grow.</div>';
      }
      $$('.library-tabs button', dashboard).forEach(button => button.classList.toggle('active', button.dataset.tab === type));
      body.dataset.tabBody = type;
    };
    $$('.library-tabs button', dashboard).forEach(button => button.addEventListener('click', () => renderTab(button.dataset.tab)));
    renderTab('all');
  }

  function updateContinueBars() {
    $$('#continueReadingSection .local-card').forEach(card => {
      const link = card.querySelector('a[href*="/chapter/"]');
      if (!link) return;
      const match = bookFromChapterUrl(link.href);
      if (!match) return;
      const record = getReadingData(match.id);
      if (!record) return;
      const bar = card.querySelector('.local-progress span');
      if (bar) bar.style.width = formatPct(record.progress);
      const meta = card.querySelector('.local-card-meta span');
      if (meta) meta.textContent = `${formatPct(record.progress)} read${record.lastChapterTitle ? ' · ' + record.lastChapterTitle : ''}`;
    });
  }

  async function shareNovel(book) {
    const url = new URL('/share/' + encodeURIComponent(book.id), location.origin).href;
    try {
      if (navigator.share) await navigator.share({ title: book.title, text: `Read ${book.title} on Novel Hub`, url });
      else if (navigator.clipboard) { await navigator.clipboard.writeText(url); toast('Novel link copied'); }
    } catch (_) {}
  }

  function toast(message) {
    const node = $('#toast');
    if (!node) return;
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(node._localTimer);
    node._localTimer = setTimeout(() => node.classList.remove('show'), 1900);
  }

  function refreshPageEnhancements() {
    const path = location.pathname;
    if (path === '/') homeEnhancements();
    else if (path === '/novel/' || path.startsWith('/novel/')) detailEnhancements();
    else if (path.startsWith('/chapter/')) readerEnhancements();
    else if (path === '/shelf') shelfEnhancements();
    bindSearchMemory();
    updateContinueBars();
  }

  let refreshTimer = null;
  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshPageEnhancements, 60);
  }

  function bindSearchMemory() {
    $$('form').forEach(form => {
      if (form.dataset.localSearchBound) return;
      const input = form.querySelector('input[type="search"]');
      if (!input) return;
      form.dataset.localSearchBound = '1';
      form.addEventListener('submit', () => rememberSearch(input.value), true);
    });
    const pathParts = location.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (pathParts[0] === 'search' && pathParts[1]) rememberSearch(pathParts[1]);
  }

  document.addEventListener('click', event => {
    const saveButton = event.target.closest('[data-save]');
    if (saveButton) notifyParentShelfClick(saveButton);
    const novelLink = event.target.closest('a[href*="/novel/"]');
    if (novelLink) {
      const parsed = bookFromNovelUrl(novelLink.getAttribute('href'));
      if (parsed?.id) {
        const card = novelLink.closest('.card');
        const title = card?.querySelector('h3')?.textContent?.trim() || '';
        const author = card?.querySelector('small')?.textContent?.trim() || '';
        const cover = card?.querySelector('img')?.getAttribute('src') || '';
        upsertBook({ ...parsed, title, author, cover });
        touchHistory(parsed.id);
      }
    }
    const chapterLink = event.target.closest('a[href*="/chapter/"]');
    if (chapterLink) {
      const parsed = bookFromChapterUrl(chapterLink.href);
      if (parsed?.id) {
        const data = load();
        const current = data.books[parsed.id] || { id: parsed.id, title: 'Novel' };
        current.status = current.status === 'completed' ? 'completed' : 'reading';
        current.lastChapterId = parsed.chapterId;
        current.lastChapterIndex = parsed.index || 0;
        current.lastOpened = now();
        data.books[parsed.id] = current;
        data.history = [parsed.id, ...data.history.filter(id => id !== parsed.id)].slice(0, MAX_HISTORY);
        save(data);
      }
    }
  }, true);

  window.addEventListener('scroll', () => {
    if (location.pathname.startsWith('/chapter/')) setProgressFromReader();
  }, { passive: true });

  window.addEventListener('popstate', scheduleRefresh);
  window.addEventListener('pageshow', scheduleRefresh);

  const observer = new MutationObserver(scheduleRefresh);
  observer.observe($('#app') || document.body, { childList: true, subtree: true });

  try { getUserId(); } catch (_) {}

  // Safe PWA registration. The service worker never caches API responses.
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}), { once: true });
  }
})();
