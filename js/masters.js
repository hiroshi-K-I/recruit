const Masters = (() => {
  // マスタ定義
  const DEFS = {
    interviewers: {
      store: DB.STORES.INTERVIEWERS,
      label: '面接官',
      fields: [
        { key: 'name',       label: '氏名',   required: true },
        { key: 'division',   label: '本部',   required: true },
        { key: 'department', label: '部署',   required: false },
        { key: 'title',      label: '役職',   required: false },
      ],
    },
    universities: {
      store: DB.STORES.UNIVERSITIES,
      label: '大学',
      fields: [
        { key: 'name', label: '大学名', required: true },
        { key: 'type', label: '区分（国公立/私立）', required: false },
      ],
    },
    jobTypes: {
      store: DB.STORES.JOB_TYPES,
      label: '職種',
      fields: [{ key: 'name', label: '職種名', required: true }],
    },
    locations: {
      store: DB.STORES.LOCATIONS,
      label: '勤務地',
      fields: [
        { key: 'name',       label: '拠点名',   required: true },
        { key: 'prefecture', label: '都道府県', required: false },
      ],
    },
    hrStaff: {
      store: DB.STORES.HR_STAFF,
      label: '担当者',
      fields: [{ key: 'name', label: '担当者名', required: true }],
    },
    rooms: {
      store: DB.STORES.ROOMS,
      label: '面接場所',
      fields: [{ key: 'name', label: '場所名', required: true }],
    },
  };

  let currentMaster = 'interviewers';

  // キャッシュ
  const cache = {};

  async function loadAll() {
    const keys = Object.keys(DEFS);
    await Promise.all(keys.map(async k => {
      cache[k] = await DB.getAll(DEFS[k].store);
    }));
  }

  function get(key) { return cache[key] || []; }

  async function refresh(key) {
    cache[key] = await DB.getAll(DEFS[key].store);
  }

  // ===== 全マスタ一括エクスポート =====
  function exportAllMasters() {
    const data = { meta: { exportedAt: Utils.nowISO(), type: 'masters-only' } };
    Object.keys(DEFS).forEach(key => { data[key] = get(key); });
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `masters_${Utils.formatDate(new Date()).replace(/-/g, '')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    Utils.toast('全マスタをエクスポートしました');
  }

  // ===== 全マスタ一括インポート =====
  async function importAllMasters(file) {
    let raw;
    try { raw = JSON.parse(await file.text()); }
    catch { Utils.toast('JSONの解析に失敗しました', 'error'); return; }

    // 全体同期JSON（payload.masters）にも対応
    const src = raw.masters || raw;

    let added = 0, skipped = 0;
    for (const key of Object.keys(DEFS)) {
      const items = src[key] || [];
      if (!items.length) continue;
      const existing    = get(key);
      const existNames  = new Set(existing.map(x => x.name).filter(Boolean));
      for (const item of items) {
        const { id, ...rest } = item;
        if (rest.name && existNames.has(rest.name)) { skipped++; continue; }
        await DB.add(DEFS[key].store, rest);
        if (rest.name) existNames.add(rest.name);
        added++;
      }
      await refresh(key);
    }
    renderMasterTable(currentMaster, document.getElementById('masters-content'));
    Utils.toast(`一括インポート完了: ${added}件追加${skipped ? `（${skipped}件スキップ）` : ''}`);
  }

  // ===== マスタ設定ビュー描画 =====
  function renderView() {
    const content = document.getElementById('masters-content');
    renderMasterTable(currentMaster, content);

    document.querySelectorAll('.masters-menu-item[data-master]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.master === currentMaster);
      btn.onclick = () => {
        currentMaster = btn.dataset.master;
        document.querySelectorAll('.masters-menu-item[data-master]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderMasterTable(currentMaster, content);
      };
    });

    document.getElementById('btn-all-masters-export')?.addEventListener('click', exportAllMasters);
    document.getElementById('inp-all-masters-import')?.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      if (Utils.confirm('全マスタをインポートします。同名エントリはスキップされます。続行しますか？')) {
        importAllMasters(file);
      }
      e.target.value = '';
    });
  }

  function renderMasterTable(key, container) {
    const def = DEFS[key];
    const items = get(key);

    let html = `<div class="masters-header">
      <h2 class="masters-section-title">${def.label}マスタ</h2>
    </div>`;

    // 追加フォーム行
    html += `<div class="masters-add-row" id="add-row-${key}">`;
    def.fields.forEach(f => {
      html += `<input type="text" class="form-control" placeholder="${f.label}${f.required ? ' *' : ''}" data-field="${f.key}" style="flex:1;">`;
    });
    html += `<button class="btn btn-primary btn-sm" id="btn-master-add-${key}">追加</button></div>`;

    // テーブル
    html += `<table class="masters-table"><thead><tr>`;
    def.fields.forEach(f => { html += `<th>${f.label}</th>`; });
    html += `<th style="width:80px"></th></tr></thead><tbody>`;

    if (items.length === 0) {
      html += `<tr><td colspan="${def.fields.length + 1}" style="text-align:center;color:var(--gray-400);padding:24px;">登録なし</td></tr>`;
    } else {
      items.forEach(item => {
        html += `<tr data-id="${item.id}" data-master="${key}">`;
        def.fields.forEach(f => {
          html += `<td class="cell-val" data-field="${f.key}">${Utils.esc(item[f.key] || '')}</td>`;
        });
        html += `<td style="text-align:right;">
          <button class="btn btn-ghost btn-sm btn-edit-master" data-id="${item.id}" data-master="${key}">✏️</button>
          <button class="btn btn-ghost btn-sm btn-del-master"  data-id="${item.id}" data-master="${key}">🗑</button>
        </td></tr>`;
      });
    }
    html += `</tbody></table>`;
    container.innerHTML = html;

    // 追加ボタン
    document.getElementById(`btn-master-add-${key}`).onclick = () => addItem(key);

    // Enterキーで追加
    document.querySelectorAll(`#add-row-${key} input`).forEach(inp => {
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') addItem(key); });
    });

    // 編集ボタン
    container.querySelectorAll('.btn-edit-master').forEach(btn => {
      btn.onclick = (e) => { e.stopPropagation(); startEdit(key, Number(btn.dataset.id)); };
    });

    // 削除ボタン
    container.querySelectorAll('.btn-del-master').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        if (Utils.confirm(`この${def.label}を削除しますか？`)) deleteItem(key, Number(btn.dataset.id));
      };
    });
  }

  async function addItem(key) {
    const def = DEFS[key];
    const inputs = document.querySelectorAll(`#add-row-${key} input`);
    const data = {};
    let valid = true;
    def.fields.forEach((f, i) => {
      const val = inputs[i].value.trim();
      if (f.required && !val) { inputs[i].classList.add('error'); valid = false; }
      else { inputs[i].classList.remove('error'); }
      data[f.key] = val;
    });
    if (!valid) return;
    await DB.add(def.store, data);
    await refresh(key);
    inputs.forEach(i => { i.value = ''; i.classList.remove('error'); });
    renderMasterTable(key, document.getElementById('masters-content'));
    Utils.toast(`${def.label}を追加しました`);
  }

  function startEdit(key, id) {
    const def  = DEFS[key];
    const item = get(key).find(x => x.id === id);
    if (!item) return;

    const row = document.querySelector(`tr[data-id="${id}"][data-master="${key}"]`);
    if (!row) return;

    // セルをinputに差し替え
    row.classList.add('editing-row');
    def.fields.forEach(f => {
      const cell = row.querySelector(`.cell-val[data-field="${f.key}"]`);
      if (!cell) return;
      cell.innerHTML = `<input type="text" class="form-control" value="${Utils.esc(item[f.key] || '')}" data-field="${f.key}" style="min-width:80px;">`;
    });

    const actionCell = row.querySelector('td:last-child');
    actionCell.innerHTML = `
      <button class="btn btn-primary btn-sm btn-save-edit" data-id="${id}" data-master="${key}">保存</button>
      <button class="btn btn-ghost btn-sm btn-cancel-edit" data-id="${id}" data-master="${key}">✕</button>
    `;
    actionCell.querySelector('.btn-save-edit').onclick  = () => saveEdit(key, id);
    actionCell.querySelector('.btn-cancel-edit').onclick = () => renderMasterTable(key, document.getElementById('masters-content'));
  }

  async function saveEdit(key, id) {
    const def  = DEFS[key];
    const item = get(key).find(x => x.id === id);
    if (!item) return;

    const row = document.querySelector(`tr[data-id="${id}"][data-master="${key}"]`);
    const data = { ...item };
    def.fields.forEach(f => {
      const inp = row.querySelector(`input[data-field="${f.key}"]`);
      if (inp) data[f.key] = inp.value.trim();
    });

    await DB.put(def.store, data);
    await refresh(key);
    renderMasterTable(key, document.getElementById('masters-content'));
    Utils.toast(`${def.label}を更新しました`);
  }

  async function deleteItem(key, id) {
    const def  = DEFS[key];
    const item = get(key).find(x => x.id === id);
    if (key === 'interviewers') {
      const inUse = (typeof Interviews !== 'undefined' ? Interviews.getAll() : [])
        .some(iv => (iv.interviewerIds || []).includes(id));
      if (inUse && !Utils.confirm(`この面接官は面接枠で使用中です。削除すると担当者情報が失われます。削除しますか？`)) return;
    } else if (key === 'hrStaff') {
      const nameInUse = (typeof Candidates !== 'undefined' ? Candidates.getAll() : [])
        .some(c => c.hrStaff === item?.name);
      const idInUse   = (typeof Interviews !== 'undefined' ? Interviews.getAll() : [])
        .some(iv => (iv.guideIds || []).includes(id));
      if ((nameInUse || idInUse) && !Utils.confirm(`この担当者は候補者または面接枠（案内係）で使用中です。削除しますか？`)) return;
    } else if (key === 'rooms') {
      const inUse = (typeof Interviews !== 'undefined' ? Interviews.getAll() : [])
        .some(iv => iv.location === item?.name);
      if (inUse && !Utils.confirm(`この面接場所は面接枠で使用中です。削除しますか？`)) return;
    }
    await DB.remove(def.store, id);
    await refresh(key);
    renderMasterTable(key, document.getElementById('masters-content'));
    Utils.toast(`${def.label}を削除しました`, 'info');
  }

  // ===== 面接官セレクタ（横タブ + チップ形式）=====
  function buildInterviewerSelector(containerId, selectedIds = []) {
    const container    = document.getElementById(containerId);
    const interviewers = get('interviewers');
    const divisions    = [...new Set(interviewers.map(i => i.division).filter(Boolean))].sort();

    let activeDivision = divisions[0] || '';
    let selected = new Set(selectedIds);

    function render() {
      const divTabs = divisions.map(d =>
        `<button class="div-tab${d === activeDivision ? ' active' : ''}" data-div="${Utils.esc(d)}">${Utils.esc(d)}</button>`
      ).join('');

      const inDiv = interviewers.filter(i => i.division === activeDivision);
      const ivChips = inDiv.length
        ? inDiv.map(i =>
            `<button class="iv-chip${selected.has(i.id) ? ' selected' : ''}" data-id="${i.id}">
              ${Utils.esc(i.name)}${i.title ? `<small style="opacity:.65;font-size:10px"> ${Utils.esc(i.title)}</small>` : ''}
            </button>`
          ).join('')
        : `<span class="interviewer-empty" style="font-size:12px;color:var(--gray-400);padding:4px;">この本部に面接官が登録されていません</span>`;

      const tags = [...selected].map(id => {
        const iv = interviewers.find(x => x.id === id);
        return iv ? `<span class="tag" data-id="${id}">${Utils.esc(iv.name)}<button class="tag-remove" data-id="${id}">×</button></span>` : '';
      }).join('');

      container.innerHTML = `
        <div class="interviewer-selector">
          <div class="interviewer-tags">${tags || ''}</div>
          ${divisions.length
            ? `<div class="div-tabs">${divTabs}</div>
               <div class="iv-chip-list">${ivChips}</div>`
            : `<div style="padding:12px;font-size:12px;color:var(--gray-400);">本部が未登録です</div>`
          }
        </div>`;

      // 本部タブ
      container.querySelectorAll('.div-tab').forEach(tab => {
        tab.onclick = () => { activeDivision = tab.dataset.div; render(); };
      });

      // 面接官チップ（トグル）
      container.querySelectorAll('.iv-chip').forEach(chip => {
        chip.onclick = () => {
          const id = Number(chip.dataset.id);
          selected.has(id) ? selected.delete(id) : selected.add(id);
          render();
        };
      });

      // タグ削除
      container.querySelectorAll('.tag-remove').forEach(btn => {
        btn.onclick = () => { selected.delete(Number(btn.dataset.id)); render(); };
      });
    }

    render();
    return { getSelected: () => [...selected] };
  }

  // ===== インクリメンタルサーチ =====
  function attachAutocomplete(inputEl, items, onSelect) {
    const wrap = document.createElement('div');
    wrap.className = 'autocomplete-wrap';
    inputEl.parentNode.insertBefore(wrap, inputEl);
    wrap.appendChild(inputEl);

    const list = document.createElement('div');
    list.className = 'autocomplete-list';
    list.style.display = 'none';
    wrap.appendChild(list);

    let activeIdx = -1;

    function showList(query) {
      const q = query.toLowerCase();
      const filtered = items.filter(x => x.toLowerCase().includes(q)).slice(0, 20);
      if (!filtered.length || !query) { list.style.display = 'none'; return; }
      list.innerHTML = filtered.map((s, i) =>
        `<div class="autocomplete-item" data-idx="${i}">${Utils.esc(s)}</div>`
      ).join('');
      list.style.display = 'block';
      activeIdx = -1;

      list.querySelectorAll('.autocomplete-item').forEach(el => {
        el.onmousedown = (e) => {
          e.preventDefault();
          inputEl.value = filtered[Number(el.dataset.idx)];
          onSelect && onSelect(inputEl.value);
          list.style.display = 'none';
        };
      });
    }

    inputEl.addEventListener('input', () => showList(inputEl.value));
    inputEl.addEventListener('focus', () => showList(inputEl.value));
    inputEl.addEventListener('blur',  () => setTimeout(() => { list.style.display = 'none'; }, 150));
    inputEl.addEventListener('keydown', e => {
      const items2 = list.querySelectorAll('.autocomplete-item');
      if (!items2.length || list.style.display === 'none') return;
      if (e.key === 'ArrowDown') { activeIdx = Math.min(activeIdx + 1, items2.length - 1); }
      else if (e.key === 'ArrowUp') { activeIdx = Math.max(activeIdx - 1, 0); }
      else if (e.key === 'Enter' && activeIdx >= 0) {
        inputEl.value = items2[activeIdx].textContent;
        onSelect && onSelect(inputEl.value);
        list.style.display = 'none';
        e.preventDefault();
      } else return;
      items2.forEach((el, i) => el.classList.toggle('selected', i === activeIdx));
    });
  }

  return { loadAll, get, refresh, renderView, buildInterviewerSelector, attachAutocomplete, exportAllMasters, importAllMasters, DEFS };
})();
