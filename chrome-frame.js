(function() {
  'use strict';

  const path = location.pathname;
  let pageTitle = document.title || 'TOPCIT 학습';
  let fakeUrl = 'learning.corp-portal.internal/training/topcit';

  if (path.includes('quiz'))      fakeUrl = 'learning.corp-portal.internal/training/assessment/topcit';
  else if (path.includes('concept')) fakeUrl = 'learning.corp-portal.internal/training/reference/topcit';
  else if (path.includes('hankuksa')) fakeUrl = 'learning.corp-portal.internal/training/history/kpsc';
  else if (path.includes('lesson')) {
    const m = path.match(/\/(\d+)\/(\d+)\//);
    if (m) fakeUrl = `learning.corp-portal.internal/training/topcit/ch${m[1]}-${m[2]}`;
    else   fakeUrl = 'learning.corp-portal.internal/training/topcit/chapters';
  }

  const TABS = [
    { title: pageTitle, favicon: '📘', active: true },
    { title: 'Jira – DEV Sprint 47', favicon: '🔵', active: false },
    { title: 'Confluence – 기술 문서', favicon: '📄', active: false },
    { title: 'GitHub – aingan/main', favicon: '⚫', active: false },
  ];

  const html = `
<div id="chrome-frame">
  <div id="chrome-tabbar">
    ${TABS.map(t => `
      <div class="chrome-tab${t.active ? ' active' : ''}">
        <span class="chrome-tab-favicon">${t.favicon}</span>
        <span class="chrome-tab-title">${t.title}</span>
        <button class="chrome-tab-close">✕</button>
      </div>`).join('')}
    <button class="chrome-tab-new">+</button>
    <div id="chrome-winctrl">
      <div class="chrome-winbtn"><svg viewBox="0 0 10 10" fill="currentColor" width="10" height="10"><rect y="4.5" width="10" height="1"/></svg></div>
      <div class="chrome-winbtn"><svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.2" width="10" height="10"><rect x="1" y="1" width="8" height="8" rx="0.5"/></svg></div>
      <div class="chrome-winbtn close"><svg viewBox="0 0 10 10" stroke="currentColor" stroke-width="1.4" width="10" height="10"><line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/></svg></div>
    </div>
  </div>
  <div id="chrome-toolbar">
    <button class="chrome-nav-btn" onclick="history.back()"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg></button>
    <button class="chrome-nav-btn disabled"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg></button>
    <button class="chrome-nav-btn" onclick="location.reload()"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4C7.58 4 4.01 7.58 4.01 12S7.58 20 12 20c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg></button>
    <div id="chrome-omnibox">
      <span class="omni-lock"><svg width="12" height="15" viewBox="0 0 12 15" fill="#5f6368"><path d="M10 6H9V4.5C9 2.57 7.43 1 5.5 1S2 2.57 2 4.5V6H1C.45 6 0 6.45 0 7v7c0 .55.45 1 1 1h10c.55 0 1-.45 1-1V7c0-.55-.45-1-1-1zm-4.5 5.73V13h-2v-1.27C3.19 11.47 3 11 3 10.5 3 9.67 3.67 9 4.5 9S6 9.67 6 10.5c0 .5-.19.97-.5 1.23zM7.5 6h-4V4.5C3.5 3.4 4.4 2.5 5.5 2.5S7.5 3.4 7.5 4.5V6z"/></svg></span>
      <span class="omni-url"><span class="omni-scheme">https://</span><span class="omni-domain">${fakeUrl}</span></span>
      <span class="omni-star">☆</span>
    </div>
    <div class="chrome-toolbar-right">
      <div class="chrome-ext-btn">⋮</div>
      <div class="chrome-avatar">J</div>
    </div>
  </div>
  <div id="chrome-bookmarks">
    <div class="chrome-bm">🏠 Corp Portal</div>
    <div class="chrome-bm">📊 Analytics</div>
    <div class="chrome-bm">🔵 Jira</div>
    <div class="chrome-bm">📄 Confluence</div>
    <div class="chrome-bm">💬 Slack</div>
    <div class="chrome-bm">⚫ GitHub</div>
    <div class="chrome-bm">📧 Gmail</div>
    <div class="chrome-bm">📅 Calendar</div>
    <div class="chrome-bm">☁️ AWS Console</div>
  </div>
</div>`;

  // CSS 경로: 슬래시 개수로 깊이 계산
  const slashes = (path.match(/\//g) || []).length;
  const depth = Math.max(slashes - 1, 0);
  const cssPrefix = '../'.repeat(depth);

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = cssPrefix + 'chrome-frame.css';
  document.head.appendChild(link);

  document.addEventListener('DOMContentLoaded', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    document.body.prepend(wrap.firstElementChild);
    document.body.classList.add('chrome-framed');
  });
})();
