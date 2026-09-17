const API = 'https://novel-api.nabaikabaiaguo.workers.dev';
const SHELF_KEY = 'novelhub-shelf-v3';
const READER_PREFS_KEY = 'novelhub-reader-prefs-v1';
const READER_PROGRESS_KEY = 'novelhub-reader-progress-v1';

const $ = (s, root = document) => root.querySelector(s);
const app = $('#app');
const state = {
  home: [],
  shelf: [],
  cache: new Map(),
  hero: 0,
  timer: null,
  loadingHome: false,
};

const unsafe = /\b(18\+|adult|explicit|erotica|hentai|porn|smut|nsfw)\b/i;
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[ch]));

const readerDefaults = {
  fontSize: 19,
  lineHeight: 1.9,
  width: 'comfortable',
  theme: 'dark',
};

function loadReaderPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(READER_PREFS_KEY) || '{}');
    return {
      ...readerDefaults,
      ...saved,
      fontSize: Math.min(28, Math.max(16, Number(saved.fontSize) || readerDefaults.fontSize)),
      lineHeight: Math.min(2.2, Math.max(1.65, Number(saved.lineHeight) || readerDefaults.lineHeight)),
      width: ['narrow', 'comfortable', 'wide'].includes(saved.width) ? saved.width : readerDefaults.width,
      theme: ['dark', 'sepia', 'black'].includes(saved.theme) ? saved.theme : readerDefaults.theme,
    };
  } catch (_) {
    return { ...readerDefaults };
  }
}

function saveReaderPrefs(prefs) {
  localStorage.setItem(READER_PREFS_KEY, JSON.stringify(prefs));
}

function loadProgressMap() {
  try {
    const value = JSON.parse(localStorage.getItem(READER_PROGRESS_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch (_) {
    return {};
  }
}

function saveChapterProgress(cid, progress) {
  const map = loadProgressMap();
  map[String(cid)] = Math.max(0, Math.min(1, progress));
  localStorage.setItem(READER_PROGRESS_KEY, JSON.stringify(map));
}

function pick(obj, keys, fallback = '') {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
  }
  return fallback;
}

function unwrap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  for (const key of ['data', 'result', 'payload', 'response']) {
    if (value[key] !== undefined) return unwrap(value[key]);
  }
  return value;
}

function arrayFrom(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (const key of ['items', 'list', 'records', 'novels', 'books', 'subjects', 'content', 'rows']) {
    if (Array.isArray(value[key])) return value[key];
  }
  for (const key of Object.keys(value)) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
}

function normalizeBook(raw = {}) {
  let genre = pick(raw, ['genre', 'category', 'genres', 'type'], 'Novel');
  if (Array.isArray(genre)) genre = genre[0] || 'Novel';
  let tags = pick(raw, ['tags', 'keywords', 'keyword'], []);
  if (!Array.isArray(tags)) tags = String(tags).split(/[,，|]/).map(x => x.trim()).filter(Boolean);
  let cover = pick(raw, ['cover', 'coverUrl', 'cover_url', 'image', 'imageUrl', 'pic', 'thumb', 'poster'], '');
  if (cover && typeof cover === 'object') cover = pick(cover, ['url', 'src', 'href'], '');
  return {
    id: String(pick(raw, ['id', 'novelId', 'novel_id', 'bookId', 'nid'], '')),
    detailPath: String(pick(raw, ['detailPath', 'detail_path', 'path', 'detailUrl'], '')),
    title: String(pick(raw, ['title', 'name', 'novelName', 'bookName'], 'Untitled')),
    author: String(pick(raw, ['author', 'writer', 'authorName', 'novelAuthor'], 'Unknown author')),
    summary: String(pick(raw, ['summary', 'description', 'intro', 'story', 'desc'], 'No description available.')),
    cover: String(cover || ''),
    genre: String(genre || 'Novel'),
    tags,
    score: pick(raw, ['score', 'rating', 'rate', 'rank'], ''),
    chapters: pick(raw, ['chapters', 'chapterCount', 'chapter_count'], ''),
  };
}

function normalizeList(payload) {
  return arrayFrom(unwrap(payload))
    .map(normalizeBook)
    .filter(book => !unsafe.test([book.title, book.author, book.summary, book.genre, ...book.tags].join(' ')));
}

function normalizeChapters(payload) {
  return arrayFrom(unwrap(payload)).map((chapter, index) => ({
    id: String(pick(chapter, ['id', 'chapterId', 'chapter_id', 'cid'], '')),
    title: String(pick(chapter, ['title', 'name', 'chapterName'], 'Chapter ' + (index + 1))),
    index,
  })).filter(chapter => chapter.id);
}

async function api(path) {
  const response = await fetch(path.startsWith('http') ? path : API + path, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json();
}

const bookKey = book => book.id || book.detailPath || book.title;

function remember(books) {
  books.forEach(book => state.cache.set(bookKey(book), book));
}

function isSaved(book) {
  return state.shelf.some(item => bookKey(item) === bookKey(book));
}

function toggleShelf(book) {
  if (isSaved(book)) {
    state.shelf = state.shelf.filter(item => bookKey(item) !== bookKey(book));
    toast('Removed from My Shelf');
  } else {
    state.shelf = [book, ...state.shelf];
    toast('Added to My Shelf');
  }
  localStorage.setItem(SHELF_KEY, JSON.stringify(state.shelf));
}

function poster(book, rank = '') {
  const image = book.cover
    ? `<img src="${esc(book.cover)}" alt="${esc(book.title)}" loading="lazy" onerror="this.style.display='none'">`
    : '<div class="poster-fallback">🦊</div>';
  return `<div class="poster">${image}${rank ? `<b class="rank">${esc(rank)}</b>` : ''}</div>`;
}

function card(book, rank = '') {
  remember([book]);
  const key = bookKey(book);
  return `<article class="card">
    <a class="poster-link" href="#/novel/${encodeURIComponent(key)}">${poster(book, rank)}</a>
    <h3 title="${esc(book.title)}"><a href="#/novel/${encodeURIComponent(key)}">${esc(book.title)}</a></h3>
    <small>${esc(book.author)}</small>
    <div class="card-actions">
      <a class="more-btn" href="#/novel/${encodeURIComponent(key)}">MORE</a>
      <button type="button" class="shelf-btn ${isSaved(book) ? 'saved' : ''}" data-save="${esc(key)}">${isSaved(book) ? '✓ On shelf' : '+ My Shelf'}</button>
    </div>
  </article>`;
}

function section(label, title, books, ranked = false) {
  return `<section class="section"><div class="head"><div><div class="eyebrow">${esc(label)}</div><h2>${esc(title)}</h2></div></div><div class="row">${books.length ? books.map((book, i) => card(book, ranked ? String(i + 1).padStart(2, '0') : '')).join('') : '<div class="empty">No stories available yet.</div>'}</div></section>`;
}

function bindCommon() {
  document.querySelectorAll('[data-save]').forEach(button => button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    const book = state.cache.get(button.dataset.save);
    if (!book) return;
    toggleShelf(book);
    render();
  }));
}

function shortDescription(text, limit = 150) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

function hero(book, total) {
  if (!book) return `<section class="hero empty-hero"><div class="hero-content"><div class="hero-copy"><div class="eyebrow">NOVELHUB · FOXY EDITION</div><h1>DISCOVER YOUR NEXT <i>STORY.</i></h1><p>The catalogue is loading. Search for a title, author or genre.</p><form id="heroSearch" class="hero-search"><input id="heroInput" placeholder="Search novels, authors, genres..."><button type="submit">SEARCH</button></form></div></div></section>`;
  const max = Math.min(6, total.length);
  return `<section class="hero"><div class="hero-bg">${book.cover ? `<img src="${esc(book.cover)}" alt="">` : ''}</div><div class="hero-shade"></div><div class="hero-grid"></div><div class="hero-content"><div class="hero-copy"><div class="eyebrow">FEATURED · ${esc(book.genre || 'NOVEL')}</div><h1>${esc(book.title)}</h1><div class="hero-meta"><span>${esc(book.author)}</span>${book.score ? `<span>★ ${esc(book.score)}</span>` : ''}<span>NOVEL</span></div><p>${esc(shortDescription(book.summary))}</p><div class="hero-actions"><a class="primary" href="#/novel/${encodeURIComponent(bookKey(book))}">READ NOW</a><a class="secondary" href="#/novel/${encodeURIComponent(bookKey(book))}">DETAILS</a></div><form id="heroSearch" class="hero-search"><input id="heroInput" placeholder="Search novels, authors, genres..."><button type="submit">SEARCH</button></form></div><div class="hero-poster">${poster(book)}</div></div><div class="hero-controls"><button type="button" data-hero-prev aria-label="Previous featured novel">‹</button><div class="hero-dots">${total.slice(0, max).map((_, i) => `<button type="button" class="hero-dot ${i === state.hero ? 'active' : ''}" data-hero="${i}" aria-label="Featured ${i + 1}"></button>`).join('')}</div><button type="button" data-hero-next aria-label="Next featured novel">›</button></div></section>`;
}

function renderHome() {
  clearInterval(state.timer);
  const books = state.home;
  const current = books.length ? books[state.hero % Math.min(6, books.length)] : null;
  const genres = [...new Set(books.flatMap(book => [book.genre, ...book.tags]).filter(Boolean))].slice(0, 12);
  app.innerHTML = `<div class="home-page">${hero(current, books)}${section('HOT', 'Popular stories', books.slice(0, 12), true)}${section('DISCOVER', 'Fresh from the catalogue', books.slice(4, 16))}<section class="section"><div class="head"><div><div class="eyebrow">BROWSE</div><h2>Explore genres</h2></div><a href="#/genres">VIEW ALL →</a></div><div class="genre-list">${genres.map(g => `<a class="genre" href="#/search/${encodeURIComponent(g)}">${esc(g)}</a>`).join('') || '<span class="status">Genres will appear when catalogue data loads.</span>'}</div></section></div>`;
  bindCommon();
  $('#heroSearch')?.addEventListener('submit', e => {
    e.preventDefault();
    go($('#heroInput')?.value || '');
  });
  document.querySelectorAll('[data-hero]').forEach(button => button.addEventListener('click', () => {
    state.hero = Number(button.dataset.hero) || 0;
    renderHome();
  }));
  $('[data-hero-prev]')?.addEventListener('click', () => {
    const count = Math.min(6, books.length);
    if (count) {
      state.hero = (state.hero - 1 + count) % count;
      renderHome();
    }
  });
  $('[data-hero-next]')?.addEventListener('click', () => {
    const count = Math.min(6, books.length);
    if (count) {
      state.hero = (state.hero + 1) % count;
      renderHome();
    }
  });
  if (books.length > 1) state.timer = setInterval(() => {
    state.hero = (state.hero + 1) % Math.min(6, books.length);
    renderHome();
  }, 6000);
}

async function loadHome() {
  if (state.loadingHome) return;
  state.loadingHome = true;
  app.innerHTML = '<div class="loading-page"><div class="loader"></div><p>LOADING NOVEL HUB...</p></div>';
  const paths = ['/featured?p=1&l=18', '/rankings?rank=1&p=1&l=18', '/search?q=popular&p=1&l=18'];
  const results = await Promise.allSettled(paths.map(api));
  const merged = [];
  results.forEach(result => {
    if (result.status === 'fulfilled') merged.push(...normalizeList(result.value));
  });
  const unique = [];
  const seen = new Set();
  merged.forEach(book => {
    const key = bookKey(book);
    if (!key || seen.has(key)) return;
    seen.add(key);
    unique.push(book);
  });
  state.home = unique;
  state.hero = 0;
  remember(state.home);
  state.loadingHome = false;
  renderHome();
}

function go(query) {
  const value = String(query || '').trim();
  if (value) location.hash = '#/search/' + encodeURIComponent(value);
}

async function searchPage(encoded) {
  const term = decodeURIComponent(encoded || '').trim();
  app.innerHTML = `<div class="page search-page"><div class="head"><div><div class="eyebrow">SEARCH</div><h2>Results for “${esc(term)}”</h2></div></div><form id="searchForm" class="big-search"><input id="searchInput" value="${esc(term)}" placeholder="Search novels, authors or genres..."><button type="submit">SEARCH</button></form><div id="status" class="status">SEARCHING THE CATALOGUE...</div><div id="results" class="grid"></div></div>`;
  $('#searchForm').addEventListener('submit', e => {
    e.preventDefault();
    go($('#searchInput').value);
  });
  try {
    const books = normalizeList(await api('/search?q=' + encodeURIComponent(term) + '&p=1&l=30'));
    remember(books);
    $('#status').textContent = books.length ? `${books.length} stories found` : 'No matching stories found.';
    $('#results').innerHTML = books.length ? books.map(card).join('') : '<div class="empty">Try another title, author or genre.</div>';
    bindCommon();
  } catch (_) {
    $('#status').textContent = 'The catalogue could not be reached right now.';
    $('#results').innerHTML = '<div class="empty">Search is temporarily unavailable. Please try again.</div>';
  }
}

function genresPage() {
  const genres = [...new Set(state.home.flatMap(book => [book.genre, ...book.tags]).filter(Boolean))];
  app.innerHTML = `<div class="page search-page"><div class="head"><div><div class="eyebrow">DISCOVER</div><h2>Choose a genre</h2></div></div><div class="genre-list">${(genres.length ? genres : ['Fantasy', 'Adventure', 'Mystery', 'Drama', 'Romance', 'Science Fiction', 'History', 'Comedy']).map(g => `<a class="genre" href="#/search/${encodeURIComponent(g)}">${esc(g)}</a>`).join('')}</div></div>`;
}

function shelfPage() {
  remember(state.shelf);
  app.innerHTML = `<div class="page search-page"><div class="head"><div><div class="eyebrow">YOUR LIBRARY</div><h2>My Shelf</h2></div></div><div class="grid">${state.shelf.length ? state.shelf.map(card).join('') : '<div class="empty">Your shelf is empty.<br>Add novels from the catalogue.</div>'}</div></div>`;
  bindCommon();
}

async function loadChaptersForBook(book) {
  if (!book?.id) return [];
  try {
    return normalizeChapters(await api('/chapters?id=' + encodeURIComponent(book.id) + '&order=asc&p=1&l=100'));
  } catch (_) {
    return [];
  }
}

function chapterRoute(chapter, book, index = 0) {
  return `#/chapter/${encodeURIComponent(chapter.id)}/${encodeURIComponent(bookKey(book))}/${encodeURIComponent(book.title)}/${index}`;
}

async function novelPage(encoded) {
  const key = decodeURIComponent(encoded || '');
  const existing = state.cache.get(key) || state.home.find(book => bookKey(book) === key) || state.shelf.find(book => bookKey(book) === key);
  if (!existing) {
    app.innerHTML = '<div class="page detail"><div class="empty">Novel not found.</div></div>';
    return;
  }
  let book = existing;
  try {
    let path = book.detailPath;
    if (path && path.startsWith(API)) path = path.slice(API.length);
    if (!path) path = '/novel/' + encodeURIComponent(book.id);
    book = { ...book, ...normalizeBook(unwrap(await api(path))) };
  } catch (_) {}
  remember([book]);

  const chapters = await loadChaptersForBook(book);
  const firstChapter = chapters[0];
  const continueChapter = chapters.length
    ? (() => {
      const progress = loadProgressMap();
      const known = chapters.find(ch => progress[ch.id] && progress[ch.id] > 0);
      return known || firstChapter;
    })()
    : null;

  app.innerHTML = `<div class="page detail">
    <a class="back" href="#/">← HOME</a>
    <div class="detail-top"><div>${poster(book)}</div><div><div class="eyebrow">NOVEL</div><h1>${esc(book.title)}</h1><p class="author">${esc(book.author)}</p><p class="summary">${esc(book.summary)}</p><button type="button" class="primary" id="saveBook">${isSaved(book) ? '✓ SAVED' : '+ ADD TO SHELF'}</button>${continueChapter ? `<a class="continue-reading" href="${chapterRoute(continueChapter, book, continueChapter.index)}">${continueChapter === firstChapter ? 'START READING' : 'CONTINUE READING'} <span>→</span></a>` : ''}</div></div>
    <div class="chapters"><div class="chapters-heading"><div><div class="eyebrow">READ</div><h2>Chapters</h2></div><span>${chapters.length ? chapters.length + ' chapters' : 'No chapters'}</span></div><div id="chapterList">${chapters.length ? chapters.map((chapter, i) => `<a class="chapter" href="${chapterRoute(chapter, book, i)}"><span>${esc(chapter.title)}</span><span>${loadProgressMap()[chapter.id] > 0 ? '↗' : '→'}</span></a>`).join('') : '<div class="status">No chapters found.</div>'}</div></div>
  </div>`;
  $('#saveBook')?.addEventListener('click', () => {
    toggleShelf(book);
    $('#saveBook').textContent = isSaved(book) ? '✓ SAVED' : '+ ADD TO SHELF';
  });
}

function readerChapterNav(chapters, index, book, title) {
  const previous = index > 0 ? chapters[index - 1] : null;
  const next = index >= 0 && index < chapters.length - 1 ? chapters[index + 1] : null;
  return `<nav class="chapter-nav" aria-label="Chapter navigation">
    ${previous ? `<a class="chapter-nav-btn" href="${chapterRoute(previous, book, index - 1)}"><span>←</span><small>PREVIOUS</small><b>${esc(previous.title)}</b></a>` : '<span class="chapter-nav-btn disabled"><span>—</span><small>PREVIOUS</small><b>Beginning</b></span>'}
    <a class="chapter-nav-center" href="#/novel/${encodeURIComponent(bookKey(book))}"><span>CHAPTER</span><b>${index >= 0 ? index + 1 : '—'} / ${chapters.length || '—'}</b><small>VIEW ALL</small></a>
    ${next ? `<a class="chapter-nav-btn next" href="${chapterRoute(next, book, index + 1)}"><small>NEXT</small><b>${esc(next.title)}</b><span>→</span></a>` : '<span class="chapter-nav-btn disabled next"><small>NEXT</small><b>End of story</b><span>—</span></span>'}
  </nav>`;
}

function readerDrawer(chapters, currentIndex, book) {
  const rows = chapters.map((chapter, index) => `<a class="reader-chapter ${index === currentIndex ? 'active' : ''}" data-reader-chapter href="${chapterRoute(chapter, book, index)}"><span>${String(index + 1).padStart(2, '0')}</span><b>${esc(chapter.title)}</b></a>`).join('');
  return `<div id="readerOverlay" class="reader-overlay" hidden></div>
    <aside id="readerDrawer" class="reader-drawer" aria-label="Chapter list" aria-hidden="true">
      <div class="reader-drawer-head"><div><div class="eyebrow">NOVEL</div><h2>${esc(book.title)}</h2></div><button id="readerCloseDrawer" type="button" aria-label="Close chapters">×</button></div>
      <input id="readerChapterSearch" class="reader-chapter-search" type="search" placeholder="Find a chapter..." autocomplete="off">
      <div id="readerChapterList" class="reader-chapter-list">${rows || '<div class="status">No chapter list available.</div>'}</div>
    </aside>`;
}

function readerSettings(prefs) {
  const active = (value, current) => value === current ? 'active' : '';
  return `<div id="readerSettings" class="reader-settings" hidden>
    <div class="reader-settings-head"><b>Reader settings</b><button id="readerCloseSettings" type="button" aria-label="Close settings">×</button></div>
    <div class="reader-setting-group"><span>TEXT SIZE</span><div class="reader-stepper"><button id="fontMinus" type="button">−</button><b id="fontValue">${prefs.fontSize}px</b><button id="fontPlus" type="button">+</button></div></div>
    <div class="reader-setting-group"><span>READING WIDTH</span><div class="reader-choice"><button type="button" data-width="narrow" class="${active('narrow', prefs.width)}">NARROW</button><button type="button" data-width="comfortable" class="${active('comfortable', prefs.width)}">COMFY</button><button type="button" data-width="wide" class="${active('wide', prefs.width)}">WIDE</button></div></div>
    <div class="reader-setting-group"><span>PAGE THEME</span><div class="reader-choice"><button type="button" data-theme="dark" class="${active('dark', prefs.theme)}">DARK</button><button type="button" data-theme="sepia" class="${active('sepia', prefs.theme)}">SEPIA</button><button type="button" data-theme="black" class="${active('black', prefs.theme)}">BLACK</button></div></div>
    <div class="reader-setting-group"><span>PARAGRAPH SPACE</span><div class="reader-choice"><button type="button" data-spacing="1.7" class="${prefs.lineHeight <= 1.7 ? 'active' : ''}">TIGHT</button><button type="button" data-spacing="1.9" class="${prefs.lineHeight > 1.7 && prefs.lineHeight < 2.1 ? 'active' : ''}">COMFY</button><button type="button" data-spacing="2.1" class="${prefs.lineHeight >= 2.1 ? 'active' : ''}">OPEN</button></div></div>
  </div>`;
}

function applyReaderPrefs(root, prefs) {
  root.dataset.width = prefs.width;
  root.dataset.theme = prefs.theme;
  root.style.setProperty('--reader-font-size', prefs.fontSize + 'px');
  root.style.setProperty('--reader-line-height', prefs.lineHeight);
}

function setupReaderUI({ root, chapters, currentIndex, book, cid, chapterTitle }) {
  let prefs = loadReaderPrefs();
  applyReaderPrefs(root, prefs);
  const drawer = $('#readerDrawer');
  const overlay = $('#readerOverlay');
  const settings = $('#readerSettings');
  const progressFill = $('#readerProgressFill');
  const progressText = $('#readerProgressText');
  const article = $('#article');

  const openDrawer = () => {
    drawer?.classList.add('open');
    drawer?.setAttribute('aria-hidden', 'false');
    if (overlay) overlay.hidden = false;
    document.body.classList.add('reader-menu-open');
  };
  const closeDrawer = () => {
    drawer?.classList.remove('open');
    drawer?.setAttribute('aria-hidden', 'true');
    if (overlay) overlay.hidden = true;
    document.body.classList.remove('reader-menu-open');
  };
  const openSettings = () => { if (settings) settings.hidden = false; };
  const closeSettings = () => { if (settings) settings.hidden = true; };

  $('#readerOpenDrawer')?.addEventListener('click', openDrawer);
  $('#readerCloseDrawer')?.addEventListener('click', closeDrawer);
  overlay?.addEventListener('click', closeDrawer);
  $('#readerOpenSettings')?.addEventListener('click', openSettings);
  $('#readerCloseSettings')?.addEventListener('click', closeSettings);

  const apply = () => {
    applyReaderPrefs(root, prefs);
    const fontValue = $('#fontValue');
    if (fontValue) fontValue.textContent = prefs.fontSize + 'px';
    document.querySelectorAll('[data-width]').forEach(btn => btn.classList.toggle('active', btn.dataset.width === prefs.width));
    document.querySelectorAll('[data-theme]').forEach(btn => btn.classList.toggle('active', btn.dataset.theme === prefs.theme));
    document.querySelectorAll('[data-spacing]').forEach(btn => btn.classList.toggle('active', Number(btn.dataset.spacing) === Number(prefs.lineHeight)));
    saveReaderPrefs(prefs);
  };

  $('#fontMinus')?.addEventListener('click', () => { prefs.fontSize = Math.max(16, prefs.fontSize - 1); apply(); });
  $('#fontPlus')?.addEventListener('click', () => { prefs.fontSize = Math.min(28, prefs.fontSize + 1); apply(); });
  document.querySelectorAll('[data-width]').forEach(btn => btn.addEventListener('click', () => { prefs.width = btn.dataset.width; apply(); }));
  document.querySelectorAll('[data-theme]').forEach(btn => btn.addEventListener('click', () => { prefs.theme = btn.dataset.theme; apply(); }));
  document.querySelectorAll('[data-spacing]').forEach(btn => btn.addEventListener('click', () => { prefs.lineHeight = Number(btn.dataset.spacing); apply(); }));

  $('#readerChapterSearch')?.addEventListener('input', event => {
    const query = event.target.value.trim().toLowerCase();
    document.querySelectorAll('[data-reader-chapter]').forEach(link => {
      link.hidden = query && !link.textContent.toLowerCase().includes(query);
    });
  });

  document.querySelectorAll('[data-reader-chapter]').forEach(link => link.addEventListener('click', () => {
    closeDrawer();
  }));

  let ticking = false;
  const updateProgress = () => {
    ticking = false;
    const doc = document.documentElement;
    const max = Math.max(1, doc.scrollHeight - window.innerHeight);
    const value = Math.min(1, Math.max(0, window.scrollY / max));
    if (progressFill) progressFill.style.transform = `scaleX(${value})`;
    if (progressText) progressText.textContent = Math.round(value * 100) + '%';
    saveChapterProgress(cid, value);
    if (value > 0.08) $('#readerTop')?.classList.add('visible');
    else $('#readerTop')?.classList.remove('visible');
  };
  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(updateProgress);
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  root._readerCleanup = () => window.removeEventListener('scroll', onScroll);

  $('#readerTop')?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  $('#readerBack')?.addEventListener('click', event => {
    if (document.referrer && location.hash.startsWith('#/chapter/')) {
      event.preventDefault();
      history.back();
    }
  });

  document.addEventListener('keydown', event => {
    if (!location.hash.startsWith('#/chapter/')) return;
    if (event.key === 'Escape') { closeDrawer(); closeSettings(); }
    if (event.key === 'ArrowLeft' && currentIndex > 0 && chapters[currentIndex - 1]) location.hash = chapterRoute(chapters[currentIndex - 1], book, currentIndex - 1).slice(1);
    if (event.key === 'ArrowRight' && currentIndex >= 0 && currentIndex < chapters.length - 1 && chapters[currentIndex + 1]) location.hash = chapterRoute(chapters[currentIndex + 1], book, currentIndex + 1).slice(1);
  });

  const progress = loadProgressMap()[cid];
  if (Number(progress) > 0.06 && Number(progress) < 0.96) {
    const resume = $('#readerResume');
    if (resume) {
      resume.hidden = false;
      resume.querySelector('b').textContent = Math.round(progress * 100) + '%';
      resume.querySelector('button')?.addEventListener('click', () => {
        window.scrollTo({ top: (document.documentElement.scrollHeight - window.innerHeight) * progress, behavior: 'smooth' });
        resume.hidden = true;
      });
      resume.querySelector('[data-dismiss]')?.addEventListener('click', () => { resume.hidden = true; });
    }
  }

  apply();
  setTimeout(updateProgress, 250);
  article?.focus({ preventScroll: true });
}

async function readerPage(encodedId, encodedBookKey, encodedTitle, encodedIndex) {
  const cid = decodeURIComponent(encodedId || '');
  const key = decodeURIComponent(encodedBookKey || '');
  const title = decodeURIComponent(encodedTitle || 'Novel');
  const book = state.cache.get(key) || state.home.find(item => bookKey(item) === key) || state.shelf.find(item => bookKey(item) === key);
  if (!book) {
    app.innerHTML = '<div class="page detail"><div class="empty">Open this chapter from a novel page so the reading controls can load the full chapter list.</div></div>';
    return;
  }

  const chapters = await loadChaptersForBook(book);
  const requestedIndex = Number(encodedIndex);
  let currentIndex = Number.isInteger(requestedIndex) && requestedIndex >= 0 ? requestedIndex : chapters.findIndex(chapter => chapter.id === cid);
  if (currentIndex < 0) currentIndex = chapters.findIndex(chapter => chapter.id === cid);

  app.innerHTML = `<div class="reader-shell" id="readerRoot">
    <div class="reader-progress" aria-hidden="true"><div id="readerProgressFill"></div></div>
    <header class="reader-topbar">
      <div class="reader-top-left">
        <a id="readerBack" class="reader-back" href="#/novel/${encodeURIComponent(bookKey(book))}" aria-label="Back to novel">← <span>BACK</span></a>
        <div class="reader-book"><small>${esc(book.title)}</small><b id="readerTopChapter">${esc(chapterTitle)}</b></div>
      </div>
      <div class="reader-top-tools">
        <span id="readerProgressText" class="reader-progress-text">0%</span>
        <button id="readerOpenDrawer" type="button">☰ <span>CHAPTERS</span></button>
        <button id="readerOpenSettings" type="button" aria-label="Reader settings">Aa</button>
      </div>
    </header>
    <main class="reader-main">
      <div class="reader-kicker"><span>${esc(book.title)}</span><i>·</i><span>${currentIndex >= 0 ? `CHAPTER ${currentIndex + 1}` : 'CHAPTER'}</span></div>
      <article id="article" class="reader-article" tabindex="-1"><div class="status">OPENING CHAPTER...</div></article>
      <div id="readerResume" class="reader-resume" hidden><span>Resume at <b>0%</b>?</span><button type="button">RESUME</button><button type="button" data-dismiss aria-label="Dismiss">×</button></div>
      ${readerChapterNav(chapters, currentIndex, book, title)}
    </main>
    ${readerDrawer(chapters, currentIndex, book)}
    ${readerSettings(loadReaderPrefs())}
    <button id="readerTop" class="reader-top" type="button" aria-label="Back to top">↑</button>
  </div>`;

  try {
    const data = unwrap(await api('/chapter/' + encodeURIComponent(cid)));
    const content = String(pick(data, ['content', 'text', 'body'], 'No chapter content available.'));
    const fetchedTitle = String(pick(data, ['title', 'name', 'chapterName'], title || 'Chapter'));
    const article = $('#article');
    const paragraphs = content.replace(/\r/g, '').split(/\n{2,}/).map(part => part.trim()).filter(Boolean);
    const lines = paragraphs.length > 1 ? paragraphs : content.split(/\n+/).map(part => part.trim()).filter(Boolean);
    article.innerHTML = `<h1>${esc(fetchedTitle)}</h1>${lines.map(p => `<p>${esc(p)}</p>`).join('')}`;
    $('#readerTopChapter').textContent = fetchedTitle;
    setupReaderUI({
      root: $('#readerRoot'),
      chapters,
      currentIndex,
      book,
      cid,
      chapterTitle: fetchedTitle,
    });
  } catch (_) {
    $('#article').innerHTML = '<div class="empty">The chapter could not be loaded. Please try again.</div>';
  }
}

function toast(message) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 1800);
}

function render() {
  const route = location.hash.slice(1) || '/';
  clearInterval(state.timer);
  if (route.startsWith('/search/')) return searchPage(route.slice(8));
  if (route.startsWith('/novel/')) return novelPage(route.slice(7));
  if (route.startsWith('/chapter/')) {
    const parts = route.split('/');
    return readerPage(parts[2], parts[3], parts.slice(4, -1).join('/'), parts[parts.length - 1]);
  }
  if (route === '/genres') return genresPage();
  if (route === '/shelf') return shelfPage();
  return loadHome();
}

function setupNavigation() {
  $('#navSearch')?.addEventListener('submit', e => {
    e.preventDefault();
    go($('#navSearchInput')?.value || '');
  });
  $('#menuBtn')?.addEventListener('click', () => document.body.classList.toggle('menu-open'));
}

try {
  state.shelf = JSON.parse(localStorage.getItem(SHELF_KEY) || '[]');
  if (!Array.isArray(state.shelf)) state.shelf = [];
} catch (_) {
  state.shelf = [];
}

setupNavigation();
window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', render);
