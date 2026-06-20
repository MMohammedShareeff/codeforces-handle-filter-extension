(function () {
  "use strict";

  let currentHandles = new Set();
  let settings = { highlight: true, hide: false, badge: true };
  let filterOn = false;
  let observer = null;

  const styleEl = document.createElement("style");
  styleEl.id = "cf-filter-styles";
  styleEl.textContent = `
    .cf-filter-highlight {
      background: rgba(59, 130, 246, 0.12) !important;
      outline: 2px solid rgba(59, 130, 246, 0.5) !important;
      outline-offset: -2px;
    }
    .cf-filter-hidden {
      display: none !important;
    }
    .cf-filter-badge {
      display: inline-block;
      background: #1e3a5f;
      color: #93c5fd;
      font-size: 10px;
      font-weight: 600;
      padding: 1px 5px;
      border-radius: 3px;
      margin-left: 5px;
      vertical-align: middle;
      font-family: 'JetBrains Mono', monospace;
    }
    .cf-filter-rank-badge {
      display: inline-block;
      background: #14532d;
      color: #86efac;
      font-size: 10px;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 3px;
      margin-left: 5px;
      vertical-align: middle;
    }
    .cf-filter-toolbar {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #0e1117;
      border: 1px solid #2a3347;
      border-radius: 10px;
      padding: 10px 14px;
      font-family: 'Space Grotesk', 'Segoe UI', sans-serif;
      font-size: 12px;
      color: #94a3b8;
      z-index: 99999;
      display: flex;
      align-items: center;
      gap: 10px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.4);
      transition: opacity 0.3s;
    }
    .cf-filter-toolbar .cf-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: #22c55e;
      box-shadow: 0 0 6px #22c55e;
      animation: cfPulse 2s ease-in-out infinite;
    }
    @keyframes cfPulse { 0%,100%{opacity:1} 50%{opacity:.4} }
    .cf-filter-toolbar strong { color: #60a5fa; }
    .cf-filter-toolbar .cf-close {
      cursor: pointer; color: #64748b; font-size: 14px; line-height: 1;
    }
    .cf-filter-toolbar .cf-close:hover { color: #ef4444; }
  `;
  document.head.appendChild(styleEl);

  function getPageType() {
    const path = location.pathname;
    if (/\/contest\/\d+\/standings/.test(path)) return "standings";
    if (/\/contest\/\d+\/submission/.test(path)) return "submissions";
    if (/\/contests/.test(path)) return "contests";
    if (/\/problemset/.test(path)) return "problemset";
    if (/\/profile\//.test(path)) return "profile";
    if (/\/blog\/entry/.test(path)) return "blog";
    return "other";
  }

  function applyFilter() {
    clearFilter();
    if (!filterOn || currentHandles.size === 0) {
      removeToolbar();
      return;
    }

    const type = getPageType();
    switch (type) {
      case "standings":
        filterStandings();
        break;
      case "contests":
        filterContests();
        break;
      case "problemset":
        filterProblemset();
        break;
      case "submissions":
        filterSubmissions();
        break;
      default:
        highlightGeneric();
        break;
    }

    showToolbar(type);
  }

  function clearFilter() {
    document.querySelectorAll(".cf-filter-highlight").forEach((el) => {
      el.classList.remove("cf-filter-highlight");
    });
    document.querySelectorAll(".cf-filter-hidden").forEach((el) => {
      el.classList.remove("cf-filter-hidden");
    });
    document
      .querySelectorAll(".cf-filter-badge, .cf-filter-rank-badge")
      .forEach((el) => el.remove());
  }

  function filterStandings() {
    const table = document.querySelector(
      ".standings table, table.standings, #pageContent table"
    );
    if (!table) return;

    const rows = table.querySelectorAll("tbody tr");
    let matchCount = 0;

    rows.forEach((row) => {
      const handle = extractHandleFromRow(row);
      if (!handle) return;

      const matched = isMatch(handle);
      if (matched) {
        matchCount++;
        if (settings.highlight) row.classList.add("cf-filter-highlight");
        if (settings.badge) addRankBadge(row, matchCount);
      } else {
        if (settings.hide) row.classList.add("cf-filter-hidden");
      }
    });

    return matchCount;
  }

  function extractHandleFromRow(row) {
    const link = row.querySelector('a[href*="/profile/"]');
    if (link) {
      const match = link.href.match(/\/profile\/([^/?#]+)/);
      if (match) return match[1];
    }
    const cell = row.querySelector(".contestant-cell");
    if (cell) return cell.textContent.trim().split(/\s/)[0];
    return null;
  }

  function addRankBadge(row, rank) {
    const handleCell = row.querySelector('a[href*="/profile/"]');
    if (!handleCell) return;
    const badge = document.createElement("span");
    badge.className = "cf-filter-rank-badge";
    badge.textContent = `#${rank}`;
    handleCell.after(badge);
  }

  function filterContests() {
    highlightGeneric();
  }

  function filterProblemset() {
    highlightGeneric();
  }

  function filterSubmissions() {
    const rows = document.querySelectorAll("table.status-frame-datatable tr");
    rows.forEach((row) => {
      const link = row.querySelector('a[href*="/profile/"]');
      if (!link) return;
      const match = link.href.match(/\/profile\/([^/?#]+)/);
      if (!match) return;
      const handle = match[1];
      if (isMatch(handle)) {
        if (settings.highlight) row.classList.add("cf-filter-highlight");
      } else {
        if (settings.hide) row.classList.add("cf-filter-hidden");
      }
    });
  }

  // ─── Generic: highlight any matching handle links ─────────────────────────
  function highlightGeneric() {
    const links = document.querySelectorAll('a[href*="/profile/"]');
    links.forEach((link) => {
      const match = link.href.match(/\/profile\/([^/?#]+)/);
      if (!match) return;
      const handle = match[1];
      if (isMatch(handle)) {
        if (settings.highlight) {
          link.style.background = "rgba(59,130,246,0.2)";
          link.style.borderRadius = "3px";
          link.style.padding = "0 3px";
          link.style.outline = "1px solid rgba(59,130,246,0.5)";
        }
        if (
          settings.badge &&
          !link.nextSibling?.classList?.contains("cf-filter-badge")
        ) {
          const badge = document.createElement("span");
          badge.className = "cf-filter-badge";
          badge.textContent = "★";
          link.after(badge);
        }
        const row = link.closest("tr");
        if (row && settings.hide) {
          // In generic mode with hide ON: hide rows that DON'T match (inverse)
        }
      }
    });
  }

  // ─── Case-insensitive match ───────────────────────────────────────────────
  function isMatch(handle) {
    const lower = handle.toLowerCase();
    for (const h of currentHandles) {
      if (h.toLowerCase() === lower) return true;
    }
    return false;
  }

  // ─── Toolbar ─────────────────────────────────────────────────────────────
  function showToolbar(pageType) {
    removeToolbar();
    const bar = document.createElement("div");
    bar.className = "cf-filter-toolbar";
    bar.id = "cf-filter-toolbar";
    bar.innerHTML = `
      <div class="cf-dot"></div>
      <span>Filter active · <strong>${currentHandles.size} handle${
      currentHandles.size !== 1 ? "s" : ""
    }</strong></span>
      <span style="color:var(--text3);opacity:.5">|</span>
      <span style="font-size:10px;opacity:.7">${pageType}</span>
      <span class="cf-close" title="Hide toolbar">×</span>
    `;
    bar.querySelector(".cf-close").addEventListener("click", removeToolbar);
    document.body.appendChild(bar);
  }

  function removeToolbar() {
    const el = document.getElementById("cf-filter-toolbar");
    if (el) el.remove();
  }

  // ─── MutationObserver for dynamic pages ──────────────────────────────────
  function startObserver() {
    if (observer) observer.disconnect();
    // CF uses AJAX for some page loads; re-apply filter when DOM changes
    let debounceTimer;
    observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (filterOn && currentHandles.size > 0) applyFilter();
      }, 400);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ─── Message listener (from popup / background) ────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== "CF_FILTER_UPDATE") return;
    filterOn = msg.filterOn;
    currentHandles = new Set(msg.handles || []);
    settings = msg.settings || { highlight: true, hide: false, badge: true };
    applyFilter();
  });

  // ─── Init: pull state from storage on first load ──────────────────────────
  chrome.storage.sync.get("cfFilterState", (res) => {
    if (!res.cfFilterState) return;
    const s = res.cfFilterState;
    const activeList =
      s.activeListId && s.lists ? s.lists[s.activeListId] : null;
    filterOn = s.filterOn || false;
    currentHandles = new Set(
      activeList && s.filterOn ? activeList.handles : []
    );
    settings = s.settings || { highlight: true, hide: false, badge: true };
    applyFilter();
    startObserver();
  });
})();
