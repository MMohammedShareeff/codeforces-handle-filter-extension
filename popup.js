// ─── State ───────────────────────────────────────────────────────────────────
let state = {
  lists: {},          // { id: { name, handles: [] } }
  activeListId: null,
  filterOn: false,
  settings: { highlight: true, hide: false, badge: true }
};

// ─── Storage helpers ─────────────────────────────────────────────────────────
function saveState() {
  chrome.storage.sync.set({ cfFilterState: state });
}

function loadState(cb) {
  chrome.storage.sync.get('cfFilterState', (res) => {
    if (res.cfFilterState) {
      state = { ...state, ...res.cfFilterState };
      // Ensure settings exists (migration safety)
      if (!state.settings) state.settings = { highlight: true, hide: false, badge: true };
    }
    cb();
  });
}

// ─── Toast ───────────────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1800);
}

// ─── Tabs ────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'filter') renderFilterPanel();
  });
});

// ─── List rendering ──────────────────────────────────────────────────────────
function renderLists() {
  const container = document.getElementById('listsContainer');
  const empty = document.getElementById('emptyState');
  const ids = Object.keys(state.lists);

  if (ids.length === 0) {
    empty.style.display = 'block';
    container.innerHTML = '';
    container.appendChild(empty);
    updateFooter();
    return;
  }
  empty.style.display = 'none';
  container.innerHTML = '';

  ids.forEach(id => {
    const list = state.lists[id];
    const isActive = state.activeListId === id;
    const card = document.createElement('div');
    card.className = 'list-card' + (isActive ? ' active-list' : '');
    card.dataset.id = id;

    card.innerHTML = `
      <div class="list-card-header">
        <span class="list-name">${escHtml(list.name)}</span>
        <span class="list-count">${list.handles.length} handles</span>
        ${isActive ? '<span class="active-badge">Active</span>' : ''}
        <span style="color:var(--text3);margin-left:4px;font-size:12px" class="chevron">▾</span>
      </div>
      <div class="list-card-body" id="body-${id}">
        <div class="handles-area" id="tags-${id}"></div>
        <div class="add-handle-row">
          <input type="text" placeholder="Add handle…" class="handle-input" data-id="${id}" maxlength="24">
          <button class="btn btn-primary btn-sm add-handle-btn" data-id="${id}">Add</button>
        </div>
        <div class="list-actions">
          <button class="btn btn-primary btn-sm activate-btn" data-id="${id}">
            ${isActive ? '✓ Active' : 'Set Active'}
          </button>
          <button class="btn btn-sm import-btn" data-id="${id}" 
            style="background:var(--bg3);color:var(--text2);border:1px solid var(--border)">
            Import CSV
          </button>
          <button class="btn btn-danger btn-sm delete-list-btn" data-id="${id}">Delete</button>
        </div>
      </div>
    `;
    container.appendChild(card);
    renderTags(id);
  });

  // Header toggle
  container.querySelectorAll('.list-card-header').forEach(header => {
    header.addEventListener('click', () => {
      const id = header.closest('.list-card').dataset.id;
      const body = document.getElementById('body-' + id);
      body.classList.toggle('open');
    });
  });

  // Add handle
  container.querySelectorAll('.add-handle-btn').forEach(btn => {
    btn.addEventListener('click', () => addHandle(btn.dataset.id));
  });
  container.querySelectorAll('.handle-input').forEach(input => {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') addHandle(input.dataset.id, input);
    });
  });

  // Activate
  container.querySelectorAll('.activate-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.activeListId = btn.dataset.id;
      state.filterOn = true;
      saveState();
      renderLists();
      updateFooter();
      sendFilterToTab();
      showToast(`"${state.lists[btn.dataset.id].name}" is now active`);
    });
  });

  // Delete list
  container.querySelectorAll('.delete-list-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (!confirm(`Delete list "${state.lists[id].name}"?`)) return;
      delete state.lists[id];
      if (state.activeListId === id) {
        state.activeListId = null;
        state.filterOn = false;
        sendFilterToTab();
      }
      saveState();
      renderLists();
      showToast('List deleted');
    });
  });

  // Import CSV
  container.querySelectorAll('.import-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      importCSV(btn.dataset.id);
    });
  });

  updateFooter();
}

function renderTags(id) {
  const area = document.getElementById('tags-' + id);
  if (!area) return;
  area.innerHTML = '';
  const list = state.lists[id];
  if (!list || list.handles.length === 0) {
    area.innerHTML = '<span style="color:var(--text3);font-size:11px">No handles yet</span>';
    return;
  }
  list.handles.forEach(handle => {
    const tag = document.createElement('span');
    tag.className = 'handle-tag';
    tag.innerHTML = `${escHtml(handle)}<button data-handle="${escHtml(handle)}" data-id="${id}" title="Remove">×</button>`;
    tag.querySelector('button').addEventListener('click', () => {
      removeHandle(id, handle);
    });
    area.appendChild(tag);
  });
}

// ─── Handle management ───────────────────────────────────────────────────────
function addHandle(listId, inputEl) {
  const input = inputEl || document.querySelector(`.handle-input[data-id="${listId}"]`);
  const val = input.value.trim();
  if (!val) return;
  if (!state.lists[listId]) return;

  // Support comma-separated bulk add
  const handles = val.split(/[,\s]+/).map(h => h.trim()).filter(Boolean);
  handles.forEach(h => {
    if (!state.lists[listId].handles.includes(h)) {
      state.lists[listId].handles.push(h);
    }
  });
  input.value = '';
  saveState();
  renderTags(listId);
  updateListCard(listId);
  if (state.activeListId === listId) sendFilterToTab();
  showToast(handles.length === 1 ? `Added "${handles[0]}"` : `Added ${handles.length} handles`);
}

function removeHandle(listId, handle) {
  const list = state.lists[listId];
  if (!list) return;
  list.handles = list.handles.filter(h => h !== handle);
  saveState();
  renderTags(listId);
  updateListCard(listId);
  if (state.activeListId === listId) sendFilterToTab();
}

function updateListCard(id) {
  const card = document.querySelector(`.list-card[data-id="${id}"]`);
  if (!card) return;
  const countEl = card.querySelector('.list-count');
  if (countEl) countEl.textContent = `${state.lists[id].handles.length} handles`;
  updateFooter();
}

// ─── Import CSV ──────────────────────────────────────────────────────────────
function importCSV(listId) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,.txt';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const handles = ev.target.result
        .split(/[\n,\r\t]+/)
        .map(h => h.trim())
        .filter(h => h && /^[a-zA-Z0-9_\-]{2,24}$/.test(h));
      let added = 0;
      handles.forEach(h => {
        if (!state.lists[listId].handles.includes(h)) {
          state.lists[listId].handles.push(h);
          added++;
        }
      });
      saveState();
      renderTags(listId);
      updateListCard(listId);
      if (state.activeListId === listId) sendFilterToTab();
      showToast(`Imported ${added} handles`);
    };
    reader.readAsText(file);
  };
  input.click();
}

// ─── Create list ─────────────────────────────────────────────────────────────
document.getElementById('createListBtn').addEventListener('click', createList);
document.getElementById('newListName').addEventListener('keydown', e => {
  if (e.key === 'Enter') createList();
});

function createList() {
  const input = document.getElementById('newListName');
  const name = input.value.trim();
  if (!name) { showToast('Enter a list name'); return; }
  const id = 'list_' + Date.now();
  state.lists[id] = { name, handles: [] };
  input.value = '';
  saveState();
  renderLists();
  // Auto-open the new card
  setTimeout(() => {
    const body = document.getElementById('body-' + id);
    if (body) body.classList.add('open');
  }, 50);
  showToast(`List "${name}" created`);
}

// ─── Filter panel ─────────────────────────────────────────────────────────────
function renderFilterPanel() {
  const selector = document.getElementById('listSelector');
  const ids = Object.keys(state.lists);

  if (ids.length === 0) {
    selector.innerHTML = '<p style="color:var(--text3);font-size:12px;text-align:center;padding:6px 0">No lists created yet</p>';
  } else {
    selector.innerHTML = ids.map(id => {
      const list = state.lists[id];
      const sel = state.activeListId === id;
      return `
        <div class="list-selector-item ${sel ? 'selected' : ''}" data-id="${id}">
          <div class="radio-dot"></div>
          <span class="selector-name">${escHtml(list.name)}</span>
          <span class="selector-count">${list.handles.length}</span>
        </div>`;
    }).join('');

    selector.querySelectorAll('.list-selector-item').forEach(item => {
      item.addEventListener('click', () => {
        state.activeListId = item.dataset.id;
        saveState();
        renderFilterPanel();
        renderLists();
      });
    });
  }

  // Settings
  document.getElementById('toggleHighlight').checked = state.settings.highlight;
  document.getElementById('toggleHide').checked = state.settings.hide;
  document.getElementById('toggleBadge').checked = state.settings.badge;
}

['toggleHighlight','toggleHide','toggleBadge'].forEach(id => {
  const key = id.replace('toggle', '').toLowerCase();
  document.getElementById(id).addEventListener('change', e => {
    state.settings[key] = e.target.checked;
    saveState();
  });
});

// ─── Apply / Clear ────────────────────────────────────────────────────────────
document.getElementById('applyBtn').addEventListener('click', () => {
  if (!state.activeListId || !state.lists[state.activeListId]) {
    showToast('Select a list first'); return;
  }
  state.filterOn = true;
  saveState();
  sendFilterToTab();
  updateFooter();
  showToast('Filter applied!');
});

document.getElementById('clearBtn').addEventListener('click', () => {
  state.filterOn = false;
  saveState();
  sendFilterToTab();
  updateFooter();
  showToast('Filter cleared');
});

// ─── Send to content script ───────────────────────────────────────────────────
function sendFilterToTab() {
  const activeList = state.activeListId ? state.lists[state.activeListId] : null;
  const payload = {
    type: 'CF_FILTER_UPDATE',
    filterOn: state.filterOn,
    handles: (activeList && state.filterOn) ? activeList.handles : [],
    settings: state.settings
  };
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url && tabs[0].url.includes('codeforces.com')) {
      chrome.tabs.sendMessage(tabs[0].id, payload).catch(() => {
        // Content script might not be ready; background will handle it
      });
    }
  });
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function updateFooter() {
  const ids = Object.keys(state.lists);
  const totalHandles = ids.reduce((sum, id) => sum + state.lists[id].handles.length, 0);
  document.getElementById('footerInfo').textContent =
    `${ids.length} list${ids.length !== 1 ? 's' : ''} · ${totalHandles} handles`;

  const badge = document.getElementById('filterStatusBadge');
  badge.textContent = state.filterOn ? 'ACTIVE' : 'OFF';
  badge.className = 'filter-status ' + (state.filterOn ? 'on' : 'off');

  const statusDot = document.getElementById('statusDot');
  statusDot.style.background = state.filterOn ? '#22c55e' : '#64748b';
  statusDot.style.boxShadow = state.filterOn ? '0 0 6px #22c55e' : 'none';
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Init ─────────────────────────────────────────────────────────────────────
loadState(() => {
  renderLists();
  updateFooter();
});
