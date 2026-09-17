(() => {
  'use strict';

  let deferredInstallPrompt = null;
  let installInFlight = false;

  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>\"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[ch]));

  function toast(message) {
    const node = $('#toast');
    if (!node) return;
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(node._uiFixTimer);
    node._uiFixTimer = setTimeout(() => node.classList.remove('show'), 2200);
  }

  function createMenu() {
    const button = $('#menuBtn');
    const nav = document.querySelector('.topbar nav');
    if (!button || document.getElementById('mobileNavPanel')) return;

    const panel = document.createElement('div');
    panel.id = 'mobileNavPanel';
    panel.innerHTML = `
      <div class="mobile-nav-backdrop" data-close-menu></div>
      <aside class="mobile-nav-panel" aria-label="Site menu">
        <div class="mobile-nav-head"><div><div class="eyebrow">NOVELHUB</div><b>MENU</b></div><button type="button" data-close-menu aria-label="Close menu">×</button></div>
        <nav class="mobile-nav-links">
          <a href="/">⌂ <span>Home</span></a>
          <a href="/genres">▦ <span>Genres</span></a>
          <a href="/shelf">▣ <span>My Shelf</span></a>
          <button type="button" data-open-install>＋ <span>Install Novel Hub</span></button>
        </nav>
        <div class="mobile-nav-note">Your library stays on this device.</div>
      </aside>`;
    document.body.appendChild(panel);

    const open = () => {
      panel.classList.add('open');
      document.body.classList.add('menu-open');
      button.setAttribute('aria-expanded', 'true');
    };
    const close = () => {
      panel.classList.remove('open');
      document.body.classList.remove('menu-open');
      button.setAttribute('aria-expanded', 'false');
    };

    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      panel.classList.contains('open') ? close() : open();
    }, true);

    panel.addEventListener('click', event => {
      if (event.target.closest('[data-close-menu]')) close();
      const link = event.target.closest('a');
      if (link) close();
      const install = event.target.closest('[data-open-install]');
      if (install) { close(); requestInstall(); }
    });

    nav?.addEventListener('click', event => {
      if (panel.classList.contains('open')) {
        event.preventDefault();
        close();
      }
    }, true);
  }

  function injectMenuStyles() {
    if ($('#uiFixStyles')) return;
    const style = document.createElement('style');
    style.id = 'uiFixStyles';
    style.textContent = `
      body.menu-open{overflow:hidden}
      #mobileNavPanel{position:fixed;inset:0;z-index:99999;display:none}
      #mobileNavPanel.open{display:block}
      .mobile-nav-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.64);backdrop-filter:blur(5px)}
      .mobile-nav-panel{position:absolute;top:0;right:0;width:min(360px,88vw);height:100%;padding:24px 22px;background:#0b0e15;border-left:1px solid #252c38;box-shadow:-24px 0 60px rgba(0,0,0,.35)}
      .mobile-nav-head{display:flex;align-items:center;justify-content:space-between;padding-bottom:18px;border-bottom:1px solid #252c38}
      .mobile-nav-head b{display:block;margin-top:3px;color:#f5f7fb;letter-spacing:.08em}
      .mobile-nav-head button{border:1px solid #252c38;background:transparent;color:#f5f7fb;width:38px;height:38px;border-radius:9px;font-size:24px;cursor:pointer}
      .mobile-nav-links{display:grid;gap:8px;padding-top:18px}
      .mobile-nav-links a,.mobile-nav-links button{display:flex;align-items:center;gap:12px;width:100%;padding:13px 12px;border:1px solid #252c38;background:rgba(255,255,255,.025);color:#f5f7fb;text-decoration:none;border-radius:10px;font:inherit;font-weight:700;text-align:left;cursor:pointer}
      .mobile-nav-links a:hover,.mobile-nav-links button:hover{border-color:rgba(41,231,255,.45);background:rgba(41,231,255,.06)}
      .mobile-nav-note{margin-top:18px;color:#8d95a5;font-size:12px;line-height:1.55}
      @media(min-width:761px){#mobileNavPanel{display:none!important}.mobile-nav-backdrop{display:none}}
    `;
    document.head.appendChild(style);
  }

  function isStandalone() {
    return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function detectInstallability() {
    if (isStandalone()) return 'installed';
    if (deferredInstallPrompt) return 'prompt';
    return 'manual';
  }

  async function requestInstall() {
    if (installInFlight) return;
    if (isStandalone()) { toast('Novel Hub is already installed'); return; }
    if (deferredInstallPrompt) {
      installInFlight = true;
      try {
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        if (choice?.outcome === 'accepted') toast('Novel Hub installed');
        else toast('Installation cancelled');
      } catch (_) {
        toast('Chrome could not open the install prompt. Use Chrome menu → Add to Home screen.');
      } finally {
        deferredInstallPrompt = null;
        installInFlight = false;
        updateInstallButtons();
      }
      return;
    }
    showManualInstallGuide();
  }

  function showManualInstallGuide() {
    if ($('#installGuide')) return;
    const box = document.createElement('div');
    box.id = 'installGuide';
    box.innerHTML = `<div class="install-guide-backdrop" data-close-install></div><div class="install-guide" role="dialog" aria-modal="true" aria-labelledby="installTitle"><div class="install-guide-head"><div><div class="eyebrow">NOVELHUB</div><h2 id="installTitle">Install Novel Hub</h2></div><button type="button" data-close-install aria-label="Close">×</button></div><p>${navigator.userAgent.includes('Chrome') ? 'Chrome is not offering the automatic install prompt on this visit. Use the browser menu and choose “Add to Home screen” or “Install app” when it appears.' : 'This browser is not exposing the automatic install prompt yet. Use its install or Add to Home screen option.'}</p><button type="button" class="install-guide-primary" data-close-install>GOT IT</button></div>`;
    document.body.appendChild(box);
    const style = document.createElement('style');
    style.textContent = '#installGuide{position:fixed;inset:0;z-index:100000}.install-guide-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.68);backdrop-filter:blur(5px)}.install-guide{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(440px,88vw);padding:22px;background:#0b0e15;border:1px solid #252c38;border-radius:14px;box-shadow:0 30px 90px rgba(0,0,0,.45);color:#f5f7fb}.install-guide-head{display:flex;justify-content:space-between;gap:16px;align-items:start}.install-guide-head h2{margin:4px 0 0}.install-guide-head button{border:1px solid #252c38;background:transparent;color:#f5f7fb;width:36px;height:36px;border-radius:8px;font-size:22px;cursor:pointer}.install-guide p{color:#8d95a5;line-height:1.6;font-size:14px}.install-guide-primary{border:1px solid #252c38;background:rgba(41,231,255,.08);color:#f5f7fb;padding:10px 14px;border-radius:8px;font:inherit;font-weight:800;cursor:pointer}';
    document.head.appendChild(style);
    box.addEventListener('click', event => { if (event.target.closest('[data-close-install]')) box.remove(); });
  }

  function addInstallButton() {
    const footer = document.querySelector('.footer');
    if (!footer || document.getElementById('footerInstallApp')) return;
    const button = document.createElement('button');
    button.id = 'footerInstallApp';
    button.type = 'button';
    button.textContent = 'INSTALL APP';
    button.addEventListener('click', requestInstall);
    footer.appendChild(button);
  }

  function updateInstallButtons() {
    const button = $('#footerInstallApp');
    if (!button) return;
    const mode = detectInstallability();
    button.textContent = mode === 'installed' ? 'APP INSTALLED' : 'INSTALL APP';
    button.disabled = mode === 'installed';
    button.title = mode === 'installed' ? 'Novel Hub is already installed' : '';
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updateInstallButtons();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    toast('Novel Hub installed successfully');
    updateInstallButtons();
  });

  window.addEventListener('pageshow', () => {
    createMenu();
    addInstallButton();
    updateInstallButtons();
  });

  window.addEventListener('load', () => {
    createMenu();
    addInstallButton();
    updateInstallButtons();
  }, { once: true });

  injectMenuStyles();
  createMenu();
  addInstallButton();
  updateInstallButtons();
})();
