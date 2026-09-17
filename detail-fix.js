(() => {
  const LIMIT = 180;
  let observer;

  function shortenStoryDetails() {
    if (!location.hash.startsWith('#/novel/')) return;
    const summary = document.querySelector('.detail .summary');
    if (!summary || summary.dataset.shortened === 'true') return;

    const fullText = summary.textContent.trim();
    if (fullText.length <= LIMIT) {
      summary.dataset.shortened = 'true';
      return;
    }

    const cut = fullText.slice(0, LIMIT);
    const lastSpace = cut.lastIndexOf(' ');
    const shortText = (lastSpace > 100 ? cut.slice(0, lastSpace) : cut).trim() + '…';

    summary.dataset.fullText = fullText;
    summary.dataset.shortText = shortText;
    summary.textContent = shortText;
    summary.dataset.shortened = 'true';

    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'detail-more-btn';
    more.textContent = 'MORE';
    more.setAttribute('aria-expanded', 'false');
    summary.insertAdjacentElement('afterend', more);

    more.addEventListener('click', () => {
      const expanded = more.getAttribute('aria-expanded') === 'true';
      summary.textContent = expanded ? summary.dataset.shortText : summary.dataset.fullText;
      more.textContent = expanded ? 'MORE' : 'LESS';
      more.setAttribute('aria-expanded', String(!expanded));
    });
  }

  function watch() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(shortenStoryDetails);
    observer.observe(document.getElementById('app') || document.body, { childList: true, subtree: true });
    shortenStoryDetails();
  }

  window.addEventListener('DOMContentLoaded', watch);
  window.addEventListener('hashchange', () => setTimeout(watch, 0));
})();
