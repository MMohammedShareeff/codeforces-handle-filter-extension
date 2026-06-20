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
    if (tab.dataset.tab === 'solved') renderSolvedPanel();
  });
});

// ─── List rendering ──────────────────────────────────────────────────────────
function renderLists() {
  const container = document.getElementById('listsContainer');
  const empty = document.getElementById('emptyState');
  const ids = Object.keys(state.lists).sort((a, b) => getListCreatedAt(b) - getListCreatedAt(a));

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
            Import File
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

  // Import handles from CSV, TXT, or XLSX
  container.querySelectorAll('.import-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      importHandlesFile(btn.dataset.id);
    });
  });

  updateFooter();
}

function getListCreatedAt(id) {
  const match = id.match(/^list_(\d+)$/);
  return match ? Number(match[1]) : 0;
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

// ─── Import handles ──────────────────────────────────────────────────────────
function importHandlesFile(listId) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,.txt,.xlsx';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const handles = await readHandlesFromFile(file);
      addImportedHandles(listId, handles);
    } catch (err) {
      showToast(err.message || 'Could not import file');
    }
  };
  input.click();
}

async function readHandlesFromFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'txt' || ext === 'csv') {
    return parseHandlesFromText(await file.text());
  }
  if (ext === 'xlsx') {
    return parseHandlesFromText((await readXlsxCells(file)).join('\n'));
  }

  throw new Error('Use CSV, TXT, or XLSX');
}

function addImportedHandles(listId, handles) {
  if (!state.lists[listId]) return;

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
  showToast(`Imported ${added} handle${added === 1 ? '' : 's'}`);
}

function parseHandlesFromText(text) {
  return text
    .split(/[\n,\r\t ;]+/)
    .map(h => h.trim())
    .filter(h => h && /^[a-zA-Z0-9_\-]{2,24}$/.test(h));
}

async function readXlsxCells(file) {
  const entries = await readZipEntries(await file.arrayBuffer());
  const sharedStringsXml = entries['xl/sharedStrings.xml'];
  const sheetPath = getFirstWorksheetPath(entries);
  const sheetXml = sheetPath ? entries[sheetPath] : null;

  if (!sheetXml) {
    throw new Error('No worksheet found');
  }

  const sharedStrings = sharedStringsXml ? parseSharedStrings(sharedStringsXml) : [];
  return parseWorksheetCells(sheetXml, sharedStrings);
}

function getFirstWorksheetPath(entries) {
  if (entries['xl/worksheets/sheet1.xml']) return 'xl/worksheets/sheet1.xml';
  return Object.keys(entries)
    .filter(name => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[0];
}

async function readZipEntries(buffer) {
  const bytes = new Uint8Array(buffer);
  const entries = {};
  const decoder = new TextDecoder();
  const eocdOffset = findEndOfCentralDirectory(bytes);

  if (eocdOffset < 0) {
    throw new Error('Invalid XLSX file');
  }

  const view = new DataView(buffer);
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  let offset = centralDirectoryOffset;

  for (let i = 0; i < totalEntries; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;

    const compression = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const fileName = decoder.decode(bytes.slice(offset + 46, offset + 46 + fileNameLength));

    if (fileName.endsWith('.xml')) {
      entries[fileName] = await readZipFileEntry(bytes, view, localHeaderOffset, compressedSize, compression);
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(bytes) {
  for (let i = bytes.length - 22; i >= 0 && i >= bytes.length - 65558; i--) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 &&
      bytes[i + 3] === 0x06
    ) {
      return i;
    }
  }
  return -1;
}

async function readZipFileEntry(bytes, view, localHeaderOffset, compressedSize, compression) {
  const decoder = new TextDecoder();

  if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
    throw new Error('Invalid XLSX entry');
  }

  const fileNameLength = view.getUint16(localHeaderOffset + 26, true);
  const extraLength = view.getUint16(localHeaderOffset + 28, true);
  const dataStart = localHeaderOffset + 30 + fileNameLength + extraLength;
  const compressed = bytes.slice(dataStart, dataStart + compressedSize);

  if (compression === 0) {
    return decoder.decode(compressed);
  }
  if (compression !== 8) {
    throw new Error('Unsupported XLSX compression');
  }
  if (!('DecompressionStream' in window)) {
    throw new Error('XLSX import needs a newer Chrome/Edge');
  }

  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return decoder.decode(await new Response(stream).arrayBuffer());
}

function parseSharedStrings(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return getElementsByLocalName(doc, 'si').map(item => {
    return getElementsByLocalName(item, 't').map(node => node.textContent || '').join('');
  });
}

function parseWorksheetCells(xml, sharedStrings) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return getElementsByLocalName(doc, 'c').map(cell => {
    const type = cell.getAttribute('t');
    const value = getElementsByLocalName(cell, 'v')[0];
    const inlineTextContainer = getElementsByLocalName(cell, 'is')[0];
    const inlineText = inlineTextContainer ? getElementsByLocalName(inlineTextContainer, 't')[0] : null;

    if (type === 's' && value) {
      return sharedStrings[Number(value.textContent)] || '';
    }
    if (inlineText) {
      return inlineText.textContent || '';
    }
    return value ? value.textContent || '' : '';
  });
}

function getElementsByLocalName(root, localName) {
  return Array.from(root.getElementsByTagName('*')).filter(node => node.localName === localName);
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
  state.activeListId = id;
  state.filterOn = true;
  input.value = '';
  saveState();
  renderLists();
  renderFilterPanel();
  updateFooter();
  sendFilterToTab();
  // Auto-open the new card
  setTimeout(() => {
    const body = document.getElementById('body-' + id);
    if (body) body.classList.add('open');
    const card = document.querySelector(`.list-card[data-id="${id}"]`);
    if (card) card.scrollIntoView({ block: 'nearest' });
    const handleInput = document.querySelector(`.handle-input[data-id="${id}"]`);
    if (handleInput) handleInput.focus();
  }, 50);
  showToast(`List "${name}" created and activated`);
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
        state.filterOn = true;
        saveState();
        renderFilterPanel();
        renderLists();
        updateFooter();
        sendFilterToTab();
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

// ─── Solved checker ───────────────────────────────────────────────────────────
document.getElementById('checkSolvedBtn').addEventListener('click', checkSolvedForProblem);
document.getElementById('problemCodeInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') checkSolvedForProblem();
});

function renderSolvedPanel() {
  const activeList = state.activeListId ? state.lists[state.activeListId] : null;
  const activeEl = document.getElementById('solverActiveList');
  const resultsEl = document.getElementById('solverResults');

  if (!activeList) {
    activeEl.textContent = 'No active list selected';
    resultsEl.innerHTML = '<div class="solver-empty">Set an active list first.</div>';
    return;
  }

  activeEl.innerHTML = `Active list: <strong>${escHtml(activeList.name)}</strong> (${activeList.handles.length} handles)`;
  if (!resultsEl.innerHTML.trim()) {
    resultsEl.innerHTML = '<div class="solver-empty">No checks yet.</div>';
  }
}

async function checkSolvedForProblem() {
  const activeList = state.activeListId ? state.lists[state.activeListId] : null;
  const input = document.getElementById('problemCodeInput');
  const button = document.getElementById('checkSolvedBtn');
  const summary = document.getElementById('solverSummary');
  const problemTokens = getProblemCodeTokens(input.value);
  const problems = parseProblemCodes(problemTokens);

  if (!activeList) {
    showToast('Select an active list first');
    renderSolvedPanel();
    return;
  }
  if (activeList.handles.length === 0) {
    showToast('Active list has no handles');
    return;
  }
  if (problemTokens.length === 0 || problemTokens.some(token => !parseProblemCode(token))) {
    showToast('Use codes like 123A 456B');
    input.focus();
    return;
  }

  const results = activeList.handles.map(handle => ({
    handle,
    status: 'checking',
    solved: {}
  }));
  const problemLabels = problems.map(formatProblemCode);

  button.disabled = true;
  button.textContent = 'Checking...';
  summary.textContent = `Checking ${activeList.handles.length} handles against ${problems.length} problems...`;
  renderSolvedResults(results, problemLabels);

  let finished = 0;
  await mapWithConcurrency(activeList.handles, 1, async (handle, index) => {
    const result = await fetchSolvedStatus(handle, problems);
    results[index] = result;
    finished++;
    summary.textContent = `Checked ${finished}/${activeList.handles.length} handles against ${problems.length} problems.`;
    renderSolvedResults(results, problemLabels);
    await delay(350);
  });

  summary.textContent = buildSolvedSummary(results, problemLabels);
  button.disabled = false;
  button.textContent = 'Check';
  showToast('Solved table ready');
}

function getProblemCodeTokens(value) {
  return value.trim().toUpperCase().split(/[\s,;]+/).filter(Boolean);
}

function parseProblemCodes(tokens) {
  const seen = new Set();
  return tokens
    .map(parseProblemCode)
    .filter(problem => {
      const label = formatProblemCode(problem);
      if (seen.has(label)) return false;
      seen.add(label);
      return true;
    });
}

function parseProblemCode(value) {
  const match = value.match(/^(\d+)([A-Z][A-Z0-9]*)$/);
  if (!match) return null;
  return {
    contestId: Number(match[1]),
    index: match[2]
  };
}

function formatProblemCode(problem) {
  return `${problem.contestId}${problem.index}`;
}

async function fetchSolvedStatus(handle, problems) {
  try {
    const data = await fetchCodeforcesStatus(handle);

    if (data.status !== 'OK') {
      return { handle, status: 'error', solved: {}, note: data.comment || 'API error' };
    }

    const solvedSet = new Set(
      data.result
        .filter(submission => submission.verdict === 'OK')
        .map(submission => submission.problem || {})
        .filter(problem => problem.contestId && problem.index)
        .map(problem => `${problem.contestId}${String(problem.index).toUpperCase()}`)
    );
    const solved = {};
    problems.forEach(problem => {
      solved[formatProblemCode(problem)] = solvedSet.has(formatProblemCode(problem));
    });

    return { handle, status: 'done', solved };
  } catch (err) {
    return { handle, status: 'error', solved: {}, note: 'Request failed' };
  }
}

async function fetchCodeforcesStatus(handle) {
  const url = `https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle)}&from=1&count=10000`;
  let lastData = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await delay(1600);

    const response = await fetch(url, { cache: 'no-store' });
    const data = await response.json();
    lastData = data;

    if (data.status === 'OK' || !isTemporaryCodeforcesError(data.comment)) {
      return data;
    }
  }

  return lastData || { status: 'FAILED', comment: 'API error' };
}

function isTemporaryCodeforcesError(comment) {
  return /limit|too many|temporar|try again/i.test(comment || '');
}

function renderSolvedResults(results, problemLabels) {
  const container = document.getElementById('solverResults');
  if (!results.length) {
    container.innerHTML = '<div class="solver-empty">No handles to check.</div>';
    return;
  }

  container.innerHTML = `
    <table class="solver-table">
      <thead>
        <tr>
          <th class="solver-handle-col">Handle</th>
          ${problemLabels.map(label => `<th>${escHtml(label)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${results.map(result => `
          <tr>
            <td class="solver-handle-col">${escHtml(result.handle)}</td>
            ${problemLabels.map(label => `<td>${renderSolvedStatus(result, label)}</td>`).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderSolvedStatus(result, problemLabel) {
  if (result.status === 'checking') {
    return '<span class="solved-status error">Checking</span>';
  }
  if (result.status === 'error') {
    const note = result.note ? `: ${result.note}` : '';
    return `<span class="solved-status error" title="${escHtml(result.note || '')}">Error</span><span class="solver-error-note">${escHtml(note)}</span>`;
  }
  return result.solved[problemLabel]
    ? '<span class="solved-status yes">Solved</span>'
    : '<span class="solved-status no">Not solved</span>';
}

function buildSolvedSummary(results, problemLabels) {
  const counts = problemLabels.map(label => {
    const solvedCount = results.filter(result => result.status === 'done' && result.solved[label]).length;
    return `${label}: ${solvedCount}/${results.length}`;
  });
  return `Checked ${results.length} handles against ${problemLabels.length} problems. ${counts.join(', ')}`;
}

async function mapWithConcurrency(items, limit, mapper) {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
  str = String(str ?? '');
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Init ─────────────────────────────────────────────────────────────────────
loadState(() => {
  renderLists();
  updateFooter();
});
