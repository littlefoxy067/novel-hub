const API_BASE = 'https://novel-api.nabaikabaiaguo.workers.dev';
const SHELF_KEY = 'novel-hub-shelf-v1';
const THEME_KEY = 'novel-hub-theme-v1';
const SAFE_RE = /\b(18\+|adult|explicit|erotica|erotic|hentai|porn|pornographic|smut|lewd|nsfw)\b/i;

const state = {
  featured: [],
  search: [],
  shelf: [],
  activeHero: 0,
  heroTimer: null,
  currentNovel: null,
  currentChapters: [],
  currentChapterIndex: -1,
};

const $ = (selector) => document.querySelector(selector);
const esc = (value = '') => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

function unwrap(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value;
  if (typeof value !== 'object') return value;
  for (const key of ['data', 'result', 'results', 'items', 'list', 'payload']) {
    if (value[key] !== undefined) return unwrap(value[key]);
  }
  return value;
}

function first(value, keys, fallback = '') {
  for (const key of keys) {
    if (value?.[key] !== undefined && value[key] !== null && value[key] !== '') return value[key];
  }
  return fallback;
}

function normalizeImage(value) {
  if (!value) return '';
  if (typeof value === 'object') return first(value, ['url', 'src', 'cover', 'image'], '');
  return String(value);
}

function looksUnsafe(book) {
  const blob = [book.title, book.author, book.summary, book.genre, ...(book.tags || [])].join(' ');
  return SAFE_RE.test(blob);
}

function normalizeBook(raw = {}) {
  const title = first(raw, ['title', 'name', 'novelName', 'bookName'], 'Untitled story');
  const author = first(raw, ['author', 'writer', 'authorName', 'novelAuthor'], 'Unknown author');
  const summary = first(raw, ['summary', 'description', 'intro', 'story', 'desc'], 'No description available yet.');
  const cover = normalizeImage(first(raw, ['cover', 'coverUrl', 'cover_url', 'image', 'imageUrl', 'pic', 'thumb'], ''));
  const id = first(raw, ['id', 'novelId', 'novel_id', 'bookId', 'book_id', 'nid'], '');
  const detailPath = first(raw, ['detailPath', 'detail_path', 'path', 'url', 'detailUrl', 'detail_url'], '');
  let tags = first(raw, ['tags', 'keywords', 'keyword'], []);
  if (!Array.isArray(tags)) tags = String(tags || '').split(/[,，|]/).map(x => x.trim()).filter(Boolean);
  const genre = first(raw, ['genre', 'category', 'genres', 'type'], 'Story');
  return {
    raw, id: String(id || ''), detailPath: String(detailPath || ''), title: String(title), author: String(author),
    summary: String(summary), cover: String(cover || ''), genre: Array.isArray(genre) ? genre[0] || 'Story' : String(genre),
    tags: tags.map(String), score: first(raw, ['score', 'rating', 'rate'], ''), views: first(raw, ['views', 'viewCount', 'view_count'], ''),
    chapters: first(raw, ['chapters', 'chapterCount', 'chapter_count'], ''),
  };
}

function normalizeCollection(payload) {
  const value = unwrap(payload);
  if (Array.isArray(value)) return value.map(normalizeBook).filter(book => !looksUnsafe(book));
  if (value && Array.isArray(value.data)) return value.data.map(normalizeBook).filter(book => !looksUnsafe(book));
  return value ? [normalizeBook(value)].filter(book => !looksUnsafe(book)) : [];
}

function imageOrFallback(book, className = '') {
  const label = esc(book.title.slice(0, 44));
  if (book.cover) {
    return `<div class="cover ${className}"><img loading="lazy" src="${esc(book.cover)}" alt="Cover of ${esc(book.title)}" onerror="this.parentElement.innerHTML='<div class=\"cover-fallback\"><strong>${label}</strong><small>Novel Hub</small></div>'"></div>`;
  }
  return `<div class="cover ${className}"><div class="cover-fallback"><strong>${label}</strong><small>Novel Hub</small></div></div>`;
}

async function api(path) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`API ${response.status}`);
  const text = await response.text();
  try { return JSON.parse(text); } catch { return text; }
}

function bookKey(book) { return `${book.id}|${book.detailPath}|${book.title}`; }
function isSaved(book) { return state.shelf.some(item => bookKey(item) === bookKey(book)); }
function loadShelf() {
  try { state.shelf = JSON.parse(localStorage.getItem(SHELF_KEY) || '[]').map(normalizeBook); }
  catch { state.shelf = []; }
}
function saveShelf() { localStorage.setItem(SHELF_KEY, JSON.stringify(state.shelf)); renderShelf(); renderAllBookCards(); }
function toggleShelf(book) {
  if (isSaved(book)) {
    state.shelf = state.shelf.filter(item => bookKey(item) !== bookKey(book));
    toast('Removed from your shelf');
  } else {
    state.shelf.unshift(book);
    toast('Added to your shelf');
  }
  saveShelf();
}

function card(book, index = '') {
  const saved = isSaved(book);
  return `<article class="book-card" data-book="${esc(JSON.stringify(book))}">
    <button class="card-open" data-open="${esc(bookKey(book))}" style="all:unset;display:block;width:100%;cursor:pointer">${imageOrFallback(book)}</button>
    <div class="book-meta">
      <span class="kicker">${esc(book.genre)}</span>
      <h3><button class="card-open text-button" data-open="${esc(bookKey(book))}" style="font:inherit;color:inherit;text-align:left;width:100%">${esc(book.title)}</button></h3>
      <p>${esc(book.author)}</p>
      <div class="card-footer"><span>${book.score ? `★ ${esc(book.score)}` : 'A new story'}</span>
        <button class="save-button ${saved ? 'is-saved' : ''}" data-save="${esc(bookKey(book))}">${saved ? 'Saved ✓' : '+ Shelf'}</button>
      </div>
    </div>
  </article>`;
}

function renderAllBookCards() {
  document.querySelectorAll('.save-button').forEach(button => {
    const key = button.dataset.save;
    const allBooks = [...state.featured, ...state.search, ...state.shelf];
    const book = allBooks.find(item => bookKey(item) === key);
    if (!book) return;
    const saved = isSaved(book);
    button.textContent = saved ? 'Saved ✓' : '+ Shelf';
    button.classList.toggle('is-saved', saved);
  });
}

function wireBookEvents(root = document) {
  root.querySelectorAll('[data-open]').forEach(el => el.addEventListener('click', () => {
    const key = el.dataset.open;
    const book = [...state.featured, ...state.search, ...state.shelf].find(item => bookKey(item) === key);
    if (book) openNovel(book);
  }));
  root.querySelectorAll('[data-save]').forEach(el => el.addEventListener('click', (event) => {
    event.stopPropagation();
    const key = el.dataset.save;
    const book = [...state.featured, ...state.search, ...state.shelf].find(item => bookKey(item) === key);
    if (book) toggleShelf(book);
  }));
}

function renderHero() {
  const books = state.featured.slice(0, 6);
  const carousel = $('#heroCarousel');
  const dots = $('#heroDots');
  if (!books.length) {
    carousel.innerHTML = `<div class="hero-slide is-active"><div class="cover"><div class="cover-fallback"><strong>Stories are loading…</strong><small>Novel Hub</small></div></div><div class="hero-book-copy"><span class="mini-tag">Opening the catalogue</span><h2>Give us a moment.</h2><p>The live novel feed is waking up. You can still search below.</p></div></div>`;
    dots.innerHTML = '';
    return;
  }
  if (state.activeHero >= books.length) state.activeHero = 0;
  carousel.innerHTML = books.map((book, i) => `<div class="hero-slide ${i === state.activeHero ? 'is-active' : ''}">
    ${imageOrFallback(book)}
    <div class="hero-book-copy"><span class="mini-tag">${esc(book.genre)} · Featured</span><h2>${esc(book.title)}</h2><p>${esc(book.summary.slice(0, 190))}</p><div class="book-actions"><button class="outline-button" data-open="${esc(bookKey(book))}">Read about it</button><button class="save-button ${isSaved(book) ? 'is-saved' : ''}" data-save="${esc(bookKey(book))}">${isSaved(book) ? 'Saved ✓' : '+ Shelf'}</button></div></div>
  </div>`).join('');
  dots.innerHTML = books.map((_, i) => `<button class="dot ${i === state.activeHero ? 'is-active' : ''}" data-hero="${i}" aria-label="Show featured novel ${i + 1}"></button>`).join('');
  wireBookEvents(carousel);
  dots.querySelectorAll('[data-hero]').forEach(dot => dot.addEventListener('click', () => setHero(Number(dot.dataset.hero))));
}

function setHero(index) {
  if (!state.featured.length) return;
  state.activeHero = (index + state.featured.length) % state.featured.length;
  renderHero();
}
function startHeroTimer() {
  clearInterval(state.heroTimer);
  state.heroTimer = setInterval(() => setHero(state.activeHero + 1), 6000);
}

function renderFeatured() {
  const root = $('#featuredGrid');
  const books = state.featured.slice(0, 8);
  root.innerHTML = books.length ? books.map(card).join('') : `<div class="empty-state">Nothing is on the shelf yet.</div>`;
  wireBookEvents(root);
  renderAllBookCards();
}

function renderRankings() {
  const root = $('#rankingList');
  const books = state.featured.slice(0, 5);
  root.innerHTML = books.length ? books.map((book, i) => `<button class="ranking-row" data-open="${esc(bookKey(book))}">
    <span class="rank-no">0${i + 1}</span>${imageOrFallback(book, 'ranking-cover')}<span><strong>${esc(book.title)}</strong><span>${esc(book.author)}</span></span><span class="ranking-score">${book.score ? `★ ${esc(book.score)}` : 'Open'}</span>
  </button>`).join('') : `<div class="empty-state">Rankings will appear when the feed is available.</div>`;
  wireBookEvents(root);
}

function renderGenres() {
  const root = $('#genreChips');
  const genres = [...new Set([...state.featured, ...state.search].flatMap(book => [book.genre, ...book.tags]).map(x => String(x || '').trim()).filter(x => x && x.length < 28))].slice(0, 14);
  const fallback = ['Fantasy', 'Adventure', 'Mystery', 'Science Fiction', 'Drama', 'History'];
  root.innerHTML = (genres.length ? genres : fallback).map(genre => `<button class="genre-chip" data-genre="${esc(genre)}">${esc(genre)}</button>`).join('');
  root.querySelectorAll('[data-genre]').forEach(btn => btn.addEventListener('click', () => searchFor(btn.dataset.genre)));
}

function renderSearchResults() {
  const root = $('#searchResults');
  root.innerHTML = state.search.length ? state.search.map(card).join('') : `<div class="empty-state">Search for a title, author, or idea and your results will land here.</div>`;
  $('#resultCount').textContent = state.search.length ? `${state.search.length} stories` : '';
  wireBookEvents(root);
}

function renderShelf() {
  const root = $('#shelfGrid');
  root.innerHTML = state.shelf.length ? state.shelf.map(card).join('') : `<div class="empty-state">Your shelf is empty. Tap “+ Shelf” on a story to keep it here.</div>`;
  wireBookEvents(root);
}

function setSearchState(message = '', loading = false) {
  const el = $('#searchState');
  if (!message) { el.hidden = true; el.textContent = ''; return; }
  el.hidden = false; el.textContent = loading ? `${message}…` : message;
}

async function searchFor(query) {
  const clean = String(query || '').trim();
  if (!clean) return;
  $('#searchInput').value = clean;
  $('#heroSearchInput').value = clean;
  document.location.hash = `search=${encodeURIComponent(clean)}`;
  setSearchState('Looking through the catalogue', true);
  state.search = [];
  renderSearchResults();
  document.querySelector('#search').scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    const payload = await api(`/search?q=${encodeURIComponent(clean)}&p=1&l=20`);
    state.search = normalizeCollection(payload).slice(0, 20);
    setSearchState(state.search.length ? '' : 'No matching stories found.');
  } catch (error) {
    setSearchState('The live catalogue could not be reached right now. Check the API status and try again.');
  }
  renderSearchResults();
  renderGenres();
}

async function loadHome() {
  setSearchState('', false);
  try {
    const payload = await api('/featured?p=1&l=8');
    state.featured = normalizeCollection(payload).slice(0, 8);
  } catch {
    try {
      const fallback = await api('/search?q=popular&p=1&l=8');
      state.featured = normalizeCollection(fallback).slice(0, 8);
    } catch {
      state.featured = [];
    }
  }
  renderHero(); renderFeatured(); renderRankings(); renderGenres();
  startHeroTimer();
}

async function getNovelDetail(book) {
  if (!book.detailPath && !book.id) return book;
  let path = book.detailPath;
  if (path.startsWith(API_BASE)) path = path.slice(API_BASE.length);
  if (!path.startsWith('/')) path = `/novel/${encodeURIComponent(path)}`;
  const payload = await api(path);
  const value = unwrap(payload);
  return normalizeBook({ ...(typeof value === 'object' ? value : {}), ...book });
}

function formatStats(book) {
  const chunks = [];
  if (book.score) chunks.push(`★ ${book.score}`);
  if (book.views) chunks.push(`${book.views} views`);
  if (book.chapters) chunks.push(`${book.chapters} chapters`);
  return chunks.join(' · ');
}

async function openNovel(book) {
  state.currentNovel = book;
  $('#detailView').hidden = false;
  document.body.style.overflow = 'hidden';
  $('#detailContent').innerHTML = `<div class="detail-hero"><div class="cover"><div class="cover-fallback"><strong>Loading…</strong><small>Novel Hub</small></div></div><div class="detail-copy"><p class="eyebrow">Novel details</p><h1>${esc(book.title)}</h1><p class="author">by ${esc(book.author)}</p><p class="summary">Opening the full story record…</p></div></div>`;
  try {
    const detail = await getNovelDetail(book);
    state.currentNovel = { ...book, ...detail };
    const safe = state.currentNovel;
    $('#detailContent').innerHTML = `<div class="detail-hero">
      ${imageOrFallback(safe)}
      <div class="detail-copy"><p class="eyebrow">${esc(safe.genre)} · Novel</p><h1>${esc(safe.title)}</h1><p class="author">by ${esc(safe.author)}</p><p class="summary">${esc(safe.summary)}</p><p class="eyebrow" style="margin-top:24px">${esc(formatStats(safe))}</p><div class="book-actions"><button class="outline-button" id="detailShelf">${isSaved(safe) ? 'Saved ✓' : '+ Add to shelf'}</button><button class="outline-button" id="loadChapters">Show chapters</button></div></div>
    </div><div class="chapters-wrap"><h2>Chapters</h2><div id="chaptersState" class="search-state">Press “Show chapters” to load the reading list.</div><div id="chapterList" class="chapter-list"></div></div>`;
    $('#detailShelf').addEventListener('click', () => { toggleShelf(safe); $('#detailShelf').textContent = isSaved(safe) ? 'Saved ✓' : '+ Add to shelf'; });
    $('#loadChapters').addEventListener('click', () => loadChapters(safe));
  } catch {
    $('#detailContent').innerHTML = `<div class="empty-state"><h2>That story could not be opened.</h2><p>The API returned an unreadable detail response. You can go back and keep browsing.</p></div>`;
  }
}

async function loadChapters(book) {
  const stateEl = $('#chaptersState');
  stateEl.textContent = 'Loading chapters…';
  let payload;
  try {
    payload = await api(`/chapters?id=${encodeURIComponent(book.id || book.raw?.id || '')}&order=ASC&p=1&l=200`);
  } catch {
    stateEl.textContent = 'The chapter list could not be loaded.';
    return;
  }
  let value = unwrap(payload);
  let list = [];
  if (Array.isArray(value)) list = value;
  else if (value && Array.isArray(value.chapters)) list = value.chapters;
  else if (value && Array.isArray(value.items)) list = value.items;
  state.currentChapters = list;
  stateEl.textContent = list.length ? `${list.length} chapters available` : 'No chapters were returned.';
  $('#chapterList').innerHTML = list.map((chapter, i) => {
    const id = first(chapter, ['id', 'chapterId', 'chapter_id', 'cid'], '');
    const title = first(chapter, ['title', 'name', 'chapterTitle'], `Chapter ${i + 1}`);
    return `<button class="chapter-item" data-chapter="${esc(String(id))}" data-index="${i}"><span class="chapter-name">${esc(title)}</span><span class="chapter-arrow">→</span></button>`;
  }).join('');
  $('#chapterList').querySelectorAll('[data-chapter]').forEach(btn => btn.addEventListener('click', () => openChapter(Number(btn.dataset.index))));
}

async function openChapter(index) {
  const chapter = state.currentChapters[index];
  if (!chapter) return;
  state.currentChapterIndex = index;
  const id = first(chapter, ['id', 'chapterId', 'chapter_id', 'cid'], '');
  const title = first(chapter, ['title', 'name', 'chapterTitle'], `Chapter ${index + 1}`);
  $('#readerView').hidden = false;
  $('#detailView').hidden = true;
  $('#readerTitle').textContent = title;
  $('#readerContent').innerHTML = '<p>Opening the chapter…</p>';
  try {
    const payload = await api(`/chapter/${encodeURIComponent(String(id))}`);
    let value = unwrap(payload);
    let content = first(value, ['content', 'text', 'body', 'html'], '');
    let contentPath = first(value, ['contentPath', 'content_path', 'path', 'file', 'url'], '');
    if (!content && contentPath) {
      if (contentPath.startsWith(API_BASE)) contentPath = contentPath.slice(API_BASE.length);
      if (!contentPath.startsWith('/')) contentPath = `/content/${encodeURIComponent(contentPath)}`;
      const contentPayload = await api(contentPath);
      const contentValue = unwrap(contentPayload);
      content = first(contentValue, ['content', 'text', 'body', 'html'], contentValue);
    }
    $('#readerContent').innerHTML = renderReaderContent(content || 'No chapter text was returned by the API.');
    renderReaderNav();
  } catch {
    $('#readerContent').innerHTML = '<p>The chapter could not be opened right now. Please try again.</p>';
    renderReaderNav();
  }
}

function renderReaderContent(content) {
  if (typeof content === 'object') content = JSON.stringify(content, null, 2);
  const str = String(content);
  if (/<\/?(p|div|br|h1|h2|h3|article)[\s>]/i.test(str)) return str;
  return str.split(/\n{2,}|\r\n{2,}/).map(p => `<p>${esc(p).replaceAll('\n', '<br>')}</p>`).join('');
}

function renderReaderNav() {
  const i = state.currentChapterIndex;
  $('#readerNav').innerHTML = `<button id="prevChapter" ${i <= 0 ? 'disabled' : ''}>← Previous</button><button id="nextChapter" ${i >= state.currentChapters.length - 1 ? 'disabled' : ''}>Next →</button>`;
  $('#prevChapter').addEventListener('click', () => openChapter(i - 1));
  $('#nextChapter').addEventListener('click', () => openChapter(i + 1));
}

function closeDetail() { $('#detailView').hidden = true; document.body.style.overflow = ''; }
function closeReader() { $('#readerView').hidden = true; document.body.style.overflow = ''; }

function toast(message) {
  const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 1900);
}

function initTheme() {
  const theme = localStorage.getItem(THEME_KEY);
  if (theme === 'dark') document.body.classList.add('dark');
  $('#themeToggle').textContent = document.body.classList.contains('dark') ? '☾' : '☼';
}

function bindUI() {
  $('#heroSearch').addEventListener('submit', e => { e.preventDefault(); searchFor($('#heroSearchInput').value); });
  $('#searchForm').addEventListener('submit', e => { e.preventDefault(); searchFor($('#searchInput').value); });
  $('#heroPrev').addEventListener('click', () => setHero(state.activeHero - 1));
  $('#heroNext').addEventListener('click', () => setHero(state.activeHero + 1));
  $('#detailClose').addEventListener('click', closeDetail);
  $('#readerBack').addEventListener('click', () => { closeReader(); $('#detailView').hidden = false; document.body.style.overflow = 'hidden'; });
  $('#readerClose').addEventListener('click', closeReader);
  $('#clearShelf').addEventListener('click', () => { state.shelf = []; saveShelf(); toast('Shelf cleared'); });
  $('#themeToggle').addEventListener('click', () => {
    document.body.classList.toggle('dark');
    localStorage.setItem(THEME_KEY, document.body.classList.contains('dark') ? 'dark' : 'light');
    $('#themeToggle').textContent = document.body.classList.contains('dark') ? '☾' : '☼';
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeReader(); closeDetail(); }
    if (e.key === 'ArrowLeft' && !$('#readerView').hidden) openChapter(state.currentChapterIndex - 1);
    if (e.key === 'ArrowRight' && !$('#readerView').hidden) openChapter(state.currentChapterIndex + 1);
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  loadShelf(); initTheme(); bindUI(); renderShelf();
  await loadHome();
  const hash = location.hash.slice(1);
  if (hash.startsWith('search=')) searchFor(decodeURIComponent(hash.slice(7)));
});
