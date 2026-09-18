const API = 'https://novel-api.nabaikabaiaguo.workers.dev';
const SHELF_KEY = 'novelhub-shelf-v4';
const READER_PREFS_KEY = 'novelhub-reader-prefs-v2';
const READER_PROGRESS_KEY = 'novelhub-reader-progress-v2';
const BOOK_INDEX_KEY = 'novelhub-book-index-v1';

const $ = (selector, root = document) => root.querySelector(selector);
const app = $('#app');

const state = { home: [], shelf: [], hero: 0, timer: null, loading: false, routeToken: 0 };
const unsafe = /\b(18\+|adult|explicit|erotica|hentai|porn|smut|nsfw)\b/i;

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

const pick = (obj, keys, fallback = '') => {
  for (const key of keys) if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
  return fallback;
};

function unwrap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  for (const key of ['data', 'result', 'payload', 'response', 'novel', 'book']) {
    if (value[key] !== undefined) return unwrap(value[key]);
  }
  return value;
}

function arrayFrom(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (const key of ['items', 'list', 'records', 'novels', 'books', 'subjects', 'rows', 'chapters']) {
    if (Array.isArray(value[key])) return value[key];
  }
  for (const key of Object.keys(value)) if (Array.isArray(value[key])) return value[key];
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
    detailPath: String(pick(raw, ['detailPath', 'detail_path', 'path', 'detailUrl', 'detail_url'], '')),
    title: String(pick(raw, ['title', 'name', 'novelName', 'bookName'], 'Untitled')),
    author: String(pick(raw, ['author', 'writer', 'authorName', 'novelAuthor'], 'Unknown author')),
    summary: String(pick(raw, ['summary', 'description', 'intro', 'story', 'desc'], 'No description available.')),
    cover: String(cover || ''),
    genre: String(genre || 'Novel'),
    tags,
    score: pick(raw, ['score', 'rating', 'rate', 'rank'], ''),
    chapters: pick(raw, ['chapters', 'chapterList', 'chapter_list', 'chapterCount', 'chapter_count'], ''),
  };
}

function normalizeList(payload) {
  return arrayFrom(unwrap(payload)).map(normalizeBook).filter(book => book.id && !unsafe.test([book.title, book.author, book.summary, book.genre, ...book.tags].join(' ')));
}

function normalizeChapters(payload) {
  return arrayFrom(unwrap(payload)).map((chapter, index) => ({
    id: String(pick(chapter, ['id', 'chapterId', 'chapter_id', 'cid'], '')),
    title: String(pick(chapter, ['title', 'name', 'chapterName'], 'Chapter ' + (index + 1))),
    index,
  })).filter(chapter => chapter.id);
}

async function api(path) {
  const response = await fetch(/^https?:\/\//i.test(path) ? path : API + path, { headers: { Accept: 'application/json' }, cache: 'no-store' });
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json();
}

function shelfLoad() {
  try {
    const value = JSON.parse(localStorage.getItem(SHELF_KEY) || '[]');
    return Array.isArray(value) ? value.map(normalizeBook) : [];
  } catch (_) { return []; }
}

function progressLoad() {
  try {
    const value = JSON.parse(localStorage.getItem(READER_PROGRESS_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch (_) { return {}; }
}

function progressSave(id, value) {
  const map = progressLoad();
  map[String(id)] = Math.max(0, Math.min(1, Number(value) || 0));
  localStorage.setItem(READER_PROGRESS_KEY, JSON.stringify(map));
}

function bookKey(book) { return String(book?.id || book?.detailPath || book?.title || ''); }

function rememberBooks(books) {
  try {
    const map = JSON.parse(localStorage.getItem(BOOK_INDEX_KEY) || '{}');
    for (const raw of books || []) {
      const book = normalizeBook(raw);
      if (book.id) map[book.id] = { ...map[book.id], ...book };
    }
    localStorage.setItem(BOOK_INDEX_KEY, JSON.stringify(map));
  } catch (_) {}
}

function rememberedBook(id) {
  try {
    const map = JSON.parse(localStorage.getItem(BOOK_INDEX_KEY) || '{}');
    return map[id] ? normalizeBook(map[id]) : null;
  } catch (_) { return null; }
}

function isSaved(book) { return state.shelf.some(item => bookKey(item) === bookKey(book)); }

function toggleShelf(book) {
  const alreadySaved = isSaved(book);
  state.shelf = alreadySaved ? state.shelf.filter(item => bookKey(item) !== bookKey(book)) : [book, ...state.shelf];
  localStorage.setItem(SHELF_KEY, JSON.stringify(state.shelf));
  toast(alreadySaved ? 'Removed from My Shelf' : 'Added to My Shelf');
}

function toast(message) {
  const node = $('#toast');
  if (!node) return;
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(node._timer);
  node._timer = setTimeout(() => node.classList.remove('show'), 1800);
}

function poster(book, rank = '') {
  const image = book.cover ? `<img src="${esc(book.cover)}" alt="${esc(book.title)}" loading="lazy" onerror="this.style.display='none'">` : '<div class="poster-fallback">🦊</div>';
  return `<div class="poster">${image}${rank ? `<b class="rank">${esc(rank)}</b>` : ''}</div>`;
}

function shortDescription(text, limit = 150) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

function sourceQuery(book) { return book.detailPath ? `?source=${encodeURIComponent(book.detailPath)}` : ''; }
function novelHref(book) { return `/novel/${encodeURIComponent(book.id)}${sourceQuery(book)}`; }
function chapterHref(chapter, book, index = 0) { return `/chapter/${encodeURIComponent(chapter.id)}/${encodeURIComponent(book.id)}/${index}${sourceQuery(book)}`; }

function card(book, rank = '') {
  rememberBooks([book]);
  return `<article class="card"><a class="poster-link" href="${novelHref(book)}">${poster(book, rank)}</a><h3 title="${esc(book.title)}"><a href="${novelHref(book)}">${esc(book.title)}</a></h3><small>${esc(book.author)}</small><div class="card-actions"><a class="more-btn" href="${novelHref(book)}">MORE</a><button type="button" class="shelf-btn ${isSaved(book) ? 'saved' : ''}" data-save="${esc(bookKey(book))}">${isSaved(book) ? '✓ On shelf' : '+ My Shelf'}</button></div></article>`;
}

function section(label, title, books, ranked = false) {
  return `<section class="section"><div class="head"><div><div class="eyebrow">${esc(label)}</div><h2>${esc(title)}</h2></div></div><div class="row">${books.length ? books.map((book, i) => card(book, ranked ? String(i + 1).padStart(2, '0') : '')).join('') : '<div class="empty">No stories available yet.</div>'}</div></section>`;
}

function hero(book, total) {
  if (!book) return `<section class="hero empty-hero"><div class="hero-content"><div class="hero-copy"><div class="eyebrow">NOVELHUB · FOXY EDITION</div><h1>DISCOVER YOUR NEXT <i>STORY.</i></h1><p>The catalogue is loading. Search for a title, author or genre.</p><form id="heroSearch" class="hero-search"><input id="heroInput" type="search" placeholder="Search novels, authors, genres..."><button type="submit">SEARCH</button></form></div></div></section>`;
  const max = Math.min(6, total.length);
  return `<section class="hero"><div class="hero-bg">${book.cover ? `<img src="${esc(book.cover)}" alt="">` : ''}</div><div class="hero-shade"></div><div class="hero-grid"></div><div class="hero-content"><div class="hero-copy"><div class="eyebrow">FEATURED · ${esc(book.genre || 'NOVEL')}</div><h1>${esc(book.title)}</h1><div class="hero-meta"><span>${esc(book.author)}</span>${book.score ? `<span>★ ${esc(book.score)}</span>` : ''}<span>NOVEL</span></div><p>${esc(shortDescription(book.summary))}</p><div class="hero-actions"><a class="primary" href="${novelHref(book)}">READ NOW</a><a class="secondary" href="${novelHref(book)}">DETAILS</a></div><form id="heroSearch" class="hero-search"><input id="heroInput" type="search" placeholder="Search novels, authors, genres..."><button type="submit">SEARCH</button></form></div><div class="hero-poster">${poster(book)}</div></div><div class="hero-controls"><button type="button" data-hero-prev aria-label="Previous featured novel">‹</button><div class="hero-dots">${total.slice(0, max).map((_, i) => `<button type="button" class="hero-dot ${i === state.hero ? 'active' : ''}" data-hero="${i}" aria-label="Featured ${i + 1}"></button>`).join('')}</div><button type="button" data-hero-next aria-label="Next featured novel">›</button></div></section>`;
}

function renderHome() {
  clearInterval(state.timer);
  const books = state.home;
  const current = books.length ? books[state.hero % Math.min(6, books.length)] : null;
  const genres = [...new Set(books.flatMap(book => [book.genre, ...book.tags]).filter(Boolean))].slice(0, 12);
  app.innerHTML = `<div class="home-page">${hero(current, books)}${section('HOT', 'Popular stories', books.slice(0, 12), true)}${section('DISCOVER', 'Fresh from the catalogue', books.slice(4, 16))}<section class="section"><div class="head"><div><div class="eyebrow">BROWSE</div><h2>Explore genres</h2></div><a href="/genres">VIEW ALL →</a></div><div class="genre-list">${genres.map(g => `<a class="genre" href="/search/${encodeURIComponent(g)}">${esc(g)}</a>`).join('') || '<span class="status">Genres will appear when catalogue data loads.</span>'}</div></section></div>`;
  bindShelfButtons();
  $('#heroSearch')?.addEventListener('submit', event => { event.preventDefault(); const value = $('#heroInput')?.value.trim(); if (value) navigate('/search/' + encodeURIComponent(value)); });
  document.querySelectorAll('[data-hero]').forEach(button => button.addEventListener('click', () => { state.hero = Number(button.dataset.hero) || 0; renderHome(); }));
  $('[data-hero-prev]')?.addEventListener('click', () => { const count = Math.min(6, books.length); if (!count) return; state.hero = (state.hero - 1 + count) % count; renderHome(); });
  $('[data-hero-next]')?.addEventListener('click', () => { const count = Math.min(6, books.length); if (!count) return; state.hero = (state.hero + 1) % count; renderHome(); });
  if (books.length > 1) state.timer = setInterval(() => { state.hero = (state.hero + 1) % Math.min(6, books.length); renderHome(); }, 6000);
}

async function loadHome(token) {
  if (state.loading) return;
  state.loading = true;
  app.innerHTML = '<div class="loading-page"><div class="loader"></div><p>LOADING NOVEL HUB...</p></div>';
  try {
    const paths = ['/featured?p=1&l=18', '/rankings?rank=1&p=1&l=18', '/search?q=popular&p=1&l=18'];
    const results = await Promise.allSettled(paths.map(api));
    if (token !== state.routeToken) return;
    const merged = results.flatMap(result => result.status === 'fulfilled' ? normalizeList(result.value) : []);
    const unique = [];
    const seen = new Set();
    for (const book of merged) { if (!book.id || seen.has(book.id)) continue; seen.add(book.id); unique.push(book); }
    state.home = unique;
    state.hero = 0;
    rememberBooks(unique);
    renderHome();
  } finally {
    state.loading = false;
  }
}

function getReaderPrefs() {
  const defaults = { fontSize: 19, lineHeight: 1.9, width: 'comfortable', theme: 'dark' };
  try {
    const saved = JSON.parse(localStorage.getItem(READER_PREFS_KEY) || '{}');
    return { ...defaults, ...saved, fontSize: Math.max(16, Math.min(28, Number(saved.fontSize) || defaults.fontSize)), lineHeight: Math.max(1.65, Math.min(2.2, Number(saved.lineHeight) || defaults.lineHeight)), width: ['narrow', 'comfortable', 'wide'].includes(saved.width) ? saved.width : defaults.width, theme: ['dark', 'sepia', 'black'].includes(saved.theme) ? saved.theme : defaults.theme };
  } catch (_) { return defaults; }
}

function saveReaderPrefs(value) { localStorage.setItem(READER_PREFS_KEY, JSON.stringify(value)); }

function normalizeDetailPath(path, id) {
  const value = String(path || '').trim();
  if (!value) return '/novel/' + encodeURIComponent(id);
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/')) return value;
  return '/novel/' + encodeURIComponent(value);
}

async function getBook(id, source = '') {
  const candidates = [];
  if (source) candidates.push(normalizeDetailPath(source, id));
  const remembered = rememberedBook(id);
  if (remembered?.detailPath) candidates.push(normalizeDetailPath(remembered.detailPath, id));
  candidates.push('/novel/' + encodeURIComponent(id));
  let lastError = null;

  for (const candidate of [...new Set(candidates)]) {
    try {
      const book = normalizeBook(unwrap(await api(candidate)));
      if (book.id || book.title !== 'Untitled') {
        book.id = book.id || String(id);
        if (!book.detailPath && candidate !== '/novel/' + encodeURIComponent(id)) book.detailPath = candidate;
        rememberBooks([book]);
        return book;
      }
    } catch (error) { lastError = error; }
  }

  try {
    const matches = normalizeList(await api('/search?q=' + encodeURIComponent(id) + '&p=1&l=10'));
    const found = matches.find(book => book.id === String(id));
    if (found) {
      rememberBooks([found]);
      if (found.detailPath) {
        const book = normalizeBook(unwrap(await api(normalizeDetailPath(found.detailPath, id))));
        book.id = book.id || String(id);
        book.detailPath = book.detailPath || found.detailPath;
        rememberBooks([book]);
        return book;
      }
      return found;
    }
  } catch (error) { lastError = error; }
  throw lastError || new Error('Novel could not be resolved.');
}

async function getChapters(id, book = null) {
  try {
    return normalizeChapters(await api('/chapters?id=' + encodeURIComponent(id) + '&order=asc&p=1&l=100'));
  } catch (_) {
    const embedded = book && Array.isArray(book.chapters) ? normalizeChapters(book.chapters) : [];
    return embedded;
  }
}

function inlineSummaryMore() {
  document.querySelectorAll('.detail .summary').forEach(summary => {
    if (summary.dataset.inlineMore === 'true') return;
    const full = summary.textContent.trim();
    const limit = 180;
    if (!full || full.length <= limit) { summary.dataset.inlineMore = 'true'; return; }
    const cut = full.slice(0, limit);
    const lastSpace = cut.lastIndexOf(' ');
    const shortText = (lastSpace > 100 ? cut.slice(0, lastSpace) : cut).trim();
    const text = document.createElement('span');
    const button = document.createElement('button');
    text.textContent = shortText + '… ';
    button.type = 'button';
    button.className = 'detail-more-btn';
    button.textContent = 'MORE';
    button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); const expanded = button.dataset.open === 'true'; button.dataset.open = String(!expanded); button.textContent = expanded ? 'MORE' : 'LESS'; text.textContent = expanded ? shortText + '… ' : full + ' '; });
    summary.textContent = '';
    summary.append(text, button);
    summary.dataset.inlineMore = 'true';
  });
}

function renderNovel(book, chapters) {
  const progress = progressLoad();
  const first = chapters[0];
  const continueChapter = chapters.find(ch => Number(progress[ch.id]) > 0) || first;
  app.innerHTML = `<div class="page detail"><a class="back" href="/">← HOME</a><div class="detail-top"><div>${poster(book)}</div><div><div class="eyebrow">NOVEL</div><h1>${esc(book.title)}</h1><p class="author">${esc(book.author)}</p><p class="summary">${esc(book.summary)}</p><button type="button" class="primary" id="saveBook">${isSaved(book) ? '✓ SAVED' : '+ ADD TO SHELF'}</button>${continueChapter ? `<a class="continue-reading" href="${chapterHref(continueChapter, book, continueChapter.index)}">${continueChapter === first ? 'START READING' : 'CONTINUE READING'} <span>→</span></a>` : ''}</div></div><div class="chapters"><div class="chapters-heading"><div><div class="eyebrow">READ</div><h2>Chapters</h2></div><span>${chapters.length ? chapters.length + ' chapters' : 'No chapters'}</span></div><div id="chapterList">${chapters.length ? chapters.map((chapter, index) => `<a class="chapter" href="${chapterHref(chapter, book, index)}"><span>${esc(chapter.title)}</span><span>${Number(progress[chapter.id]) > 0 ? '↗' : '→'}</span></a>`).join('') : '<div class="status">No chapters found.</div>'}</div></div></div>`;
  inlineSummaryMore();
  $('#saveBook')?.addEventListener('click', () => { toggleShelf(book); const button = $('#saveBook'); if (button) button.textContent = isSaved(book) ? '✓ SAVED' : '+ ADD TO SHELF'; });
}

async function renderNovelRoute(parts, params, token) {
  const id = parts[1];
  if (!id) throw new Error('Missing novel ID.');
  const book = await getBook(id, params.get('source') || '');
  if (token !== state.routeToken) return;
  const chapters = await getChapters(book.id, book);
  if (token !== state.routeToken) return;
  renderNovel(book, chapters);
}

async function getChapterContent(id) {
  const raw = unwrap(await api('/chapter/' + encodeURIComponent(id)));
  let content = pick(raw, ['content', 'text', 'body', 'chapterContent', 'chapter_content'], '');
  const contentPath = pick(raw, ['contentPath', 'content_path', 'contentUrl', 'content_url'], '');
  const candidate = contentPath || (typeof content === 'string' ? content : '');
  if (candidate && typeof candidate === 'string' && (/^https?:\/\//i.test(candidate) || /^\/?content\//i.test(candidate))) {
    try { const loaded = unwrap(await api(candidate)); content = pick(loaded, ['content', 'text', 'body', 'value'], loaded); } catch (_) {}
  }
  if (content && typeof content === 'object') content = pick(content, ['content', 'text', 'body', 'value'], '');
  return { title: String(pick(raw, ['title', 'name', 'chapterName'], 'Chapter')), content: String(content || 'No chapter content available.') };
}

function readerSettings(prefs) {
  const active = (value, current) => value === current ? 'active' : '';
  return `<div id="readerSettings" class="reader-settings" hidden><div class="reader-settings-head"><b>Reader settings</b><button id="readerCloseSettings" type="button">×</button></div><div class="reader-setting-group"><span>TEXT SIZE</span><div class="reader-stepper"><button id="fontMinus" type="button">−</button><b id="fontValue">${prefs.fontSize}px</b><button id="fontPlus" type="button">+</button></div></div><div class="reader-setting-group"><span>READING WIDTH</span><div class="reader-choice"><button type="button" data-width="narrow" class="${active('narrow', prefs.width)}">NARROW</button><button type="button" data-width="comfortable" class="${active('comfortable', prefs.width)}">COMFY</button><button type="button" data-width="wide" class="${active('wide', prefs.width)}">WIDE</button></div></div><div class="reader-setting-group"><span>PAGE THEME</span><div class="reader-choice"><button type="button" data-theme="dark" class="${active('dark', prefs.theme)}">DARK</button><button type="button" data-theme="sepia" class="${active('sepia', prefs.theme)}">SEPIA</button><button type="button" data-theme="black" class="${active('black', prefs.theme)}">BLACK</button></div></div><div class="reader-setting-group"><span>PARAGRAPH SPACE</span><div class="reader-choice"><button type="button" data-spacing="1.7" class="${prefs.lineHeight <= 1.7 ? 'active' : ''}">TIGHT</button><button type="button" data-spacing="1.9" class="${prefs.lineHeight > 1.7 && prefs.lineHeight < 2.1 ? 'active' : ''}">COMFY</button><button type="button" data-spacing="2.1" class="${prefs.lineHeight >= 2.1 ? 'active' : ''}">OPEN</button></div></div></div>`;
}

function renderReader(book, chapters, current, chapter) {
  const currentIndex = Math.max(0, chapters.findIndex(ch => ch.id === current.id));
  const previous = currentIndex > 0 ? chapters[currentIndex - 1] : null;
  const next = currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;
  const prefs = getReaderPrefs();
  const content = chapter.content.replace(/\r/g, '').trim();
  const blocks = content.split(/\n{2,}/).map(x => x.trim()).filter(Boolean);
  const paragraphs = blocks.length > 1 ? blocks : content.split(/\n+/).map(x => x.trim()).filter(Boolean);

  app.innerHTML = `<div class="reader-shell" id="readerRoot" data-width="${prefs.width}" data-theme="${prefs.theme}"><div class="reader-progress"><div id="readerProgressFill"></div></div><header class="reader-topbar"><div class="reader-top-left"><a class="reader-back" href="${novelHref(book)}">← <span>BACK</span></a><div class="reader-book"><small>${esc(book.title)}</small><b>${esc(chapter.title === 'Chapter' ? current.title : chapter.title)}</b></div></div><div class="reader-top-tools"><span id="readerProgressText" class="reader-progress-text">0%</span><button id="readerOpenSettings" class="reader-tool" type="button">Aa</button><button id="readerOpenChapters" class="reader-tool" type="button">☰</button></div></header>${readerSettings(prefs)}<main class="reader-main"><div class="reader-kicker"><span>${esc(book.title)}</span><i>·</i><span>CHAPTER ${currentIndex + 1}</span></div><article class="reader-article" id="readerArticle" tabindex="-1"><h1>${esc(chapter.title === 'Chapter' ? current.title : chapter.title)}</h1>${paragraphs.map(p => `<p>${esc(p)}</p>`).join('')}</article><nav class="chapter-nav" aria-label="Chapter navigation">${previous ? `<a class="chapter-nav-btn" href="${chapterHref(previous, book, currentIndex - 1)}"><span>←</span><small>PREVIOUS</small><b>${esc(previous.title)}</b></a>` : '<span class="chapter-nav-btn disabled"><span>—</span><small>PREVIOUS</small><b>Beginning</b></span>'}<a class="chapter-nav-center" href="${novelHref(book)}"><span>CHAPTER</span><b>${currentIndex + 1} / ${chapters.length || '—'}</b><small>VIEW ALL</small></a>${next ? `<a class="chapter-nav-btn next" href="${chapterHref(next, book, currentIndex + 1)}"><small>NEXT</small><b>${esc(next.title)}</b><span>→</span></a>` : '<span class="chapter-nav-btn disabled next"><small>NEXT</small><b>End of story</b><span>—</span></span>'}</nav></main><button id="readerTop" class="reader-top" type="button">↑</button><div id="readerOverlay" class="reader-overlay" hidden></div><aside id="readerDrawer" class="reader-drawer" aria-hidden="true"><div class="reader-drawer-head"><div><div class="eyebrow">NOVEL</div><h2>${esc(book.title)}</h2></div><button id="readerCloseChapters" type="button">×</button></div><input id="readerChapterSearch" class="reader-chapter-search" type="search" placeholder="Find a chapter..."><div id="readerChapterList" class="reader-chapter-list">${chapters.map((item, index) => `<a class="reader-chapter ${index === currentIndex ? 'active' : ''}" href="${chapterHref(item, book, index)}"><span>${String(index + 1).padStart(2, '0')}</span><b>${esc(item.title)}</b></a>`).join('')}</div></aside></div>`;

  const root = $('#readerRoot');
  const applyPrefs = () => {
    root.dataset.width = prefs.width;
    root.dataset.theme = prefs.theme;
    root.style.setProperty('--reader-font-size', prefs.fontSize + 'px');
    root.style.setProperty('--reader-line-height', prefs.lineHeight);
    const value = $('#fontValue');
    if (value) value.textContent = prefs.fontSize + 'px';
    document.querySelectorAll('[data-width]').forEach(btn => btn.classList.toggle('active', btn.dataset.width === prefs.width));
    document.querySelectorAll('[data-theme]').forEach(btn => btn.classList.toggle('active', btn.dataset.theme === prefs.theme));
    document.querySelectorAll('[data-spacing]').forEach(btn => btn.classList.toggle('active', Number(btn.dataset.spacing) === Number(prefs.lineHeight)));
    saveReaderPrefs(prefs);
  };
  applyPrefs();

  $('#fontMinus')?.addEventListener('click', () => { prefs.fontSize = Math.max(16, prefs.fontSize - 1); applyPrefs(); });
  $('#fontPlus')?.addEventListener('click', () => { prefs.fontSize = Math.min(28, prefs.fontSize + 1); applyPrefs(); });
  document.querySelectorAll('[data-width]').forEach(btn => btn.addEventListener('click', () => { prefs.width = btn.dataset.width; applyPrefs(); }));
  document.querySelectorAll('[data-theme]').forEach(btn => btn.addEventListener('click', () => { prefs.theme = btn.dataset.theme; applyPrefs(); }));
  document.querySelectorAll('[data-spacing]').forEach(btn => btn.addEventListener('click', () => { prefs.lineHeight = Number(btn.dataset.spacing); applyPrefs(); }));

  const settings = $('#readerSettings');
  const drawer = $('#readerDrawer');
  const overlay = $('#readerOverlay');
  $('#readerOpenSettings')?.addEventListener('click', () => { if (settings) settings.hidden = false; });
  $('#readerCloseSettings')?.addEventListener('click', () => { if (settings) settings.hidden = true; });
  const closeDrawer = () => { drawer?.classList.remove('open'); drawer?.setAttribute('aria-hidden', 'true'); if (overlay) overlay.hidden = true; };
  $('#readerOpenChapters')?.addEventListener('click', () => { drawer?.classList.add('open'); drawer?.setAttribute('aria-hidden', 'false'); if (overlay) overlay.hidden = false; });
  $('#readerCloseChapters')?.addEventListener('click', closeDrawer);
  overlay?.addEventListener('click', closeDrawer);
  $('#readerChapterSearch')?.addEventListener('input', event => { const q = event.target.value.toLowerCase().trim(); document.querySelectorAll('.reader-chapter').forEach(link => { link.hidden = Boolean(q) && !link.textContent.toLowerCase().includes(q); }); });

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const value = Math.max(0, Math.min(1, window.scrollY / max));
      const fill = $('#readerProgressFill');
      if (fill) fill.style.transform = `scaleX(${value})`;
      const label = $('#readerProgressText');
      if (label) label.textContent = Math.round(value * 100) + '%';
      progressSave(current.id, value);
      $('#readerTop')?.classList.toggle('visible', value > 0.08);
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  $('#readerTop')?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  const savedProgress = Number(progressLoad()[current.id] || 0);
  if (savedProgress > 0.06 && savedProgress < 0.96) setTimeout(() => window.scrollTo({ top: (document.documentElement.scrollHeight - window.innerHeight) * savedProgress }), 30);
  onScroll();
}

async function renderChapterRoute(parts, params, token) {
  const chapterId = parts[1];
  const bookId = parts[2];
  const requestedIndex = Number(parts[3]);
  if (!chapterId || !bookId) throw new Error('Invalid chapter URL.');
  const book = await getBook(bookId, params.get('source') || '');
  if (token !== state.routeToken) return;
  const chapters = await getChapters(book.id, book);
  if (token !== state.routeToken) return;
  const found = chapters.find(ch => ch.id === chapterId);
  const index = found ? found.index : (Number.isInteger(requestedIndex) && requestedIndex >= 0 ? requestedIndex : 0);
  const current = found || chapters[index];
  if (!current) throw new Error('Chapter list is unavailable.');
  const chapter = await getChapterContent(chapterId);
  if (token !== state.routeToken) return;
  renderReader(book, chapters, current, chapter);
}

async function searchPage(term, token) {
  const safeTerm = String(term || '').trim();
  app.innerHTML = `<div class="page search-page"><div class="head"><div><div class="eyebrow">SEARCH</div><h2>Results for “${esc(safeTerm)}”</h2></div></div><form id="searchForm" class="big-search"><input id="searchInput" type="search" value="${esc(safeTerm)}" placeholder="Search novels, authors or genres..."><button type="submit">SEARCH</button></form><div id="status" class="status">SEARCHING THE CATALOGUE...</div><div id="results" class="grid"></div></div>`;
  try {
    const books = normalizeList(await api('/search?q=' + encodeURIComponent(safeTerm) + '&p=1&l=30'));
    if (token !== state.routeToken) return;
    rememberBooks(books);
    $('#status').textContent = books.length ? `${books.length} stories found` : 'No matching stories found.';
    $('#results').innerHTML = books.length ? books.map(card).join('') : '<div class="empty">Try another title, author or genre.</div>';
    bindShelfButtons();
  } catch (_) {
    if (token !== state.routeToken) return;
    $('#status').textContent = 'The catalogue could not be reached right now.';
    $('#results').innerHTML = '<div class="empty">Search is temporarily unavailable. Please try again.</div>';
  }
}

function genresPage() {
  const genres = [...new Set(state.home.flatMap(book => [book.genre, ...book.tags]).filter(Boolean))];
  const fallback = ['Fantasy', 'Adventure', 'Mystery', 'Drama', 'Romance', 'Science Fiction', 'History', 'Comedy'];
  app.innerHTML = `<div class="page search-page"><div class="head"><div><div class="eyebrow">DISCOVER</div><h2>Choose a genre</h2></div></div><div class="genre-list">${(genres.length ? genres : fallback).map(g => `<a class="genre" href="/search/${encodeURIComponent(g)}">${esc(g)}</a>`).join('')}</div></div>`;
}

function shelfPage() {
  state.shelf = shelfLoad();
  rememberBooks(state.shelf);
  app.innerHTML = `<div class="page search-page"><div class="head"><div><div class="eyebrow">YOUR LIBRARY</div><h2>My Shelf</h2></div></div><div class="grid">${state.shelf.length ? state.shelf.map(card).join('') : '<div class="empty">Your shelf is empty.<br>Add novels from the catalogue.</div>'}</div></div>`;
  bindShelfButtons();
}

function bindShelfButtons() {
  document.querySelectorAll('[data-save]').forEach(button => button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    const key = button.dataset.save;
    const book = state.home.find(item => bookKey(item) === key) || state.shelf.find(item => bookKey(item) === key) || rememberedBook(key);
    if (!book) return;
    toggleShelf(book);
    renderCurrent();
  }));
}

function navigate(url) {
  const target = url.startsWith('/') ? url : '/' + url;
  if (target === window.location.pathname + window.location.search) return renderCurrent();
  history.pushState({}, '', target);
  window.scrollTo(0, 0);
  renderCurrent();
}

function renderError(error) {
  const text = error instanceof Error ? error.message : 'Unable to load this page.';
  app.innerHTML = `<div class="page detail"><div class="empty"><h2>Could not open this page</h2><p>${esc(text)}</p><a class="primary" href="/">RETURN HOME</a></div></div>`;
}

function renderCurrent() {
  const token = ++state.routeToken;
  const url = new URL(window.location.href);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const parts = path.split('/').filter(Boolean).map(x => { try { return decodeURIComponent(x); } catch (_) { return x; } });
  clearInterval(state.timer);

  (async () => {
    try {
      if (path === '/') await loadHome(token);
      else if (parts[0] === 'search') await searchPage(parts.slice(1).join('/'), token);
      else if (path === '/genres') genresPage();
      else if (path === '/shelf') shelfPage();
      else if (parts[0] === 'novel') await renderNovelRoute(parts, url.searchParams, token);
      else if (parts[0] === 'chapter') await renderChapterRoute(parts, url.searchParams, token);
      else { history.replaceState({}, '', '/'); await loadHome(token); return; }
      if (token === state.routeToken) app.focus?.({ preventScroll: true });
    } catch (error) {
      if (token === state.routeToken) renderError(error);
    }
  })();
}

document.addEventListener('click', event => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest('a[href]');
  if (!link) return;
  const raw = link.getAttribute('href');
  if (!raw || raw.startsWith('#') || /^(mailto:|tel:|javascript:)/i.test(raw)) return;
  let target;
  try { target = new URL(raw, window.location.origin); } catch (_) { return; }
  if (target.origin !== window.location.origin) return;
  event.preventDefault();
  navigate(target.pathname + target.search);
}, true);

document.addEventListener('submit', event => {
  const form = event.target;
  if (!form || !form.matches('#navSearch, #heroSearch, #searchForm')) return;
  event.preventDefault();
  const input = form.querySelector('input[type="search"], input');
  const value = String(input?.value || '').trim();
  if (value) navigate('/search/' + encodeURIComponent(value));
}, true);

window.addEventListener('popstate', () => { window.scrollTo(0, 0); renderCurrent(); });

function migrateLegacyHash() {
  const hash = window.location.hash.replace(/^#/, '');
  if (hash.startsWith('/')) history.replaceState({}, '', hash);
}

function setupMenu() {
  const menu = $('#menuBtn');
  const nav = document.querySelector('.topbar nav');
  if (!menu || !nav) return;
  const close = () => {
    document.body.classList.remove('menu-open');
    menu.setAttribute('aria-expanded', 'false');
  };
  menu.setAttribute('aria-expanded', 'false');
  menu.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    const open = document.body.classList.toggle('menu-open');
    menu.setAttribute('aria-expanded', String(open));
  });
  nav.addEventListener('click', event => {
    if (event.target.closest('a')) close();
  });
  document.addEventListener('click', event => {
    if (!document.body.classList.contains('menu-open')) return;
    if (!event.target.closest('.topbar')) close();
  });
  window.addEventListener('popstate', close);
}

state.shelf = shelfLoad();
migrateLegacyHash();
setupMenu();
window.addEventListener('DOMContentLoaded', renderCurrent, { once: true });
