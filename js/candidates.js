const Candidates = (() => {
  const SELECTION_STATUSES = [
    '書類選考中','1次面接待ち','1次面接済','2次面接待ち','2次面接済',
    '役員面接待ち','役員面接済',
    '最終面接待ち','最終面接済','内定','内定承諾','辞退','不採用',
  ];

  const STATUS_COLOR = {
    '書類選考中':  'badge-gray',
    '1次面接待ち': 'badge-blue',
    '1次面接済':   'badge-blue',
    '2次面接待ち': 'badge-blue',
    '2次面接済':   'badge-blue',
    '役員面接待ち':'badge-yellow',
    '役員面接済':  'badge-yellow',
    '最終面接待ち':'badge-purple',
    '最終面接済':  'badge-purple',
    '内定':        'badge-green',
    '内定承諾':    'badge-green',
    '辞退':        'badge-gray',
    '不採用':      'badge-red',
  };

  let allCandidates = [];
  let editingId = null;

  // ===== データ読み込み =====
  async function load() {
    allCandidates = await DB.getAll(DB.STORES.CANDIDATES);
    allCandidates.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    renderList();
    updateFilterOptions();
  }

  // ===== フィルタ =====
  function getFiltered() {
    const q      = document.getElementById('cand-search')?.value.toLowerCase() || '';
    const rtype  = document.getElementById('filter-recruit-type')?.value || '';
    const status = document.getElementById('filter-status')?.value || '';
    const staff  = document.getElementById('filter-staff')?.value || '';
    const jtype  = document.getElementById('filter-jobtype')?.value || '';

    return allCandidates.filter(c => {
      if (rtype  && c.recruitType     !== rtype)  return false;
      if (status && c.selectionStatus !== status) return false;
      if (staff  && c.hrStaff         !== staff)  return false;
      if (jtype  && c.jobType         !== jtype)  return false;
      if (q) {
        const hay = `${c.name} ${c.notes || ''} ${c.remarks || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function updateFilterOptions() {
    const staffSel  = document.getElementById('filter-staff');
    const jtypeSel  = document.getElementById('filter-jobtype');
    if (!staffSel || !jtypeSel) return;

    const staffSet  = [...new Set(allCandidates.map(c => c.hrStaff).filter(Boolean))];
    const jtypeSet  = [...new Set(allCandidates.map(c => c.jobType).filter(Boolean))];

    const prevStaff  = staffSel.value;
    const prevJtype  = jtypeSel.value;

    staffSel.innerHTML  = '<option value="">担当者: すべて</option>' +
      staffSet.map(s => `<option ${s === prevStaff ? 'selected' : ''}>${Utils.esc(s)}</option>`).join('');
    jtypeSel.innerHTML  = '<option value="">職種: すべて</option>' +
      jtypeSet.map(s => `<option ${s === prevJtype ? 'selected' : ''}>${Utils.esc(s)}</option>`).join('');
  }

  // ===== 一覧描画 =====
  function renderList() {
    const tbody  = document.getElementById('candidates-tbody');
    const count  = document.getElementById('cand-count');
    const items  = getFiltered();
    if (count) count.textContent = `${items.length}件`;

    if (items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="table-empty">該当する候補者がいません</td></tr>`;
      return;
    }

    tbody.innerHTML = items.map(c => `
      <tr data-id="${c.id}">
        <td class="td-name">${Utils.esc(c.name)}</td>
        <td><span class="badge ${c.recruitType === '新卒' ? 'badge-blue' : 'badge-yellow'}">${Utils.esc(c.recruitType || '')}</span></td>
        <td>${Utils.esc(c.university || '')}</td>
        <td>${Utils.esc(c.facultyType || '')}</td>
        <td>${Utils.esc(c.jobType || '')}</td>
        <td>${Utils.esc(c.hrStaff || '')}</td>
        <td><span class="badge ${STATUS_COLOR[c.selectionStatus] || 'badge-gray'}">${Utils.esc(c.selectionStatus || '')}</span></td>
        <td class="stars">${Utils.motivationLabel(c.motivation)}</td>
        <td style="font-size:12px;color:var(--gray-400);">${Utils.formatDateTime(c.createdAt)}</td>
      </tr>`).join('');

    tbody.querySelectorAll('tr[data-id]').forEach(row => {
      row.onclick = () => openModal(Number(row.dataset.id));
    });
  }

  // ===== フィルタイベント設定 =====
  function bindFilters() {
    ['cand-search','filter-recruit-type','filter-status','filter-staff','filter-jobtype'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', renderList);
    });
  }

  // ===== モーダル開く =====
  function openModal(id = null) {
    editingId = id;
    const isNew = id === null;
    const c = isNew ? {} : allCandidates.find(x => x.id === id) || {};

    document.getElementById('modal-cand-title').textContent = isNew ? '候補者登録' : '候補者編集';
    const deleteBtn = document.getElementById('btn-delete-candidate');
    deleteBtn.style.display = isNew ? 'none' : '';

    const universities = Masters.get('universities').map(u => u.name);
    const jobTypes     = Masters.get('jobTypes').map(j => j.name);
    const locations    = Masters.get('locations').map(l => l.name);
    const hrStaffs     = Masters.get('hrStaff').map(s => s.name);

    // 希望勤務地チェックボックス
    const prefLocs = (c.preferredLocations || []);
    const locChecks = locations.map(l =>
      `<label class="check-group" style="margin:0">
        <input type="checkbox" name="pref-loc" value="${Utils.esc(l)}" ${prefLocs.includes(l) ? 'checked' : ''}> ${Utils.esc(l)}
      </label>`
    ).join('');

    // 志望度スター
    const stars = [5,4,3,2,1].map(n =>
      `<input type="radio" name="motivation" id="star${n}" value="${n}" ${(c.motivation || 0) === n ? 'checked' : ''}>
       <label for="star${n}" title="${n}">★</label>`
    ).join('');

    document.getElementById('modal-cand-body').innerHTML = `
      <div class="form-row">
        <div class="form-group" style="flex:2">
          <label class="required">氏名</label>
          <input type="text" id="f-name" class="form-control" value="${Utils.esc(c.name || '')}" placeholder="山田 太郎">
          <div class="form-error" id="err-name"></div>
        </div>
        <div class="form-group">
          <label>採用種別</label>
          <div class="toggle-btn-group" id="f-recruit-btns">
            ${['', '新卒', 'キャリア'].map(v =>
              `<button class="toggle-btn${(c.recruitType || '') === v ? ' active' : ''}" data-val="${Utils.esc(v)}">${v || '未設定'}</button>`
            ).join('')}
          </div>
          <input type="hidden" id="f-recruit-type" value="${Utils.esc(c.recruitType || '')}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>大学</label>
          <input type="text" id="f-university" class="form-control" value="${Utils.esc(c.university || '')}" placeholder="大学名">
        </div>
        <div class="form-group">
          <label>文理</label>
          <div class="radio-group">
            ${['文系','理系','その他'].map(v =>
              `<label><input type="radio" name="faculty" value="${v}" ${c.facultyType === v ? 'checked' : ''}> ${v}</label>`
            ).join('')}
          </div>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>職種</label>
          <input type="text" id="f-jobtype" class="form-control" value="${Utils.esc(c.jobType || '')}" placeholder="職種">
        </div>
        <div class="form-group">
          <label>担当者</label>
          ${hrStaffs.length
            ? `<div class="chip-toggle-group" id="f-hrstaff-chips">
                 ${hrStaffs.map(s =>
                   `<button class="chip-toggle${c.hrStaff === s ? ' selected' : ''}" data-val="${Utils.esc(s)}">${Utils.esc(s)}</button>`
                 ).join('')}
               </div>
               <input type="hidden" id="f-hrstaff" value="${Utils.esc(c.hrStaff || '')}">`
            : `<select id="f-hrstaff" class="form-control">
                 <option value="">--</option>
                 ${hrStaffs.map(s => `<option ${c.hrStaff === s ? 'selected' : ''}>${Utils.esc(s)}</option>`).join('')}
               </select>`
          }
        </div>
      </div>
      <div class="form-group">
        <label>希望勤務地</label>
        <div class="check-group">${locChecks || '<span style="color:var(--gray-400);font-size:12px;">（勤務地マスタ未登録）</span>'}</div>
      </div>
      <div class="form-group">
        <label>選考状況</label>
        <div class="status-grid">
          ${SELECTION_STATUSES.map(s =>
            `<button class="status-chip${c.selectionStatus === s ? ' active' : ''}" data-val="${Utils.esc(s)}">${Utils.esc(s)}</button>`
          ).join('')}
        </div>
        <input type="hidden" id="f-status" value="${Utils.esc(c.selectionStatus || '')}">
      </div>
      <div class="form-group">
        <label>志望度</label>
        <div class="star-rating">${stars}</div>
      </div>
      <div class="form-group">
        <label>申送り</label>
        <textarea id="f-notes" class="form-control">${Utils.esc(c.notes || '')}</textarea>
      </div>
      <div class="form-group">
        <label>特記事項</label>
        <textarea id="f-remarks" class="form-control">${Utils.esc(c.remarks || '')}</textarea>
      </div>`;

    // ===== 採用種別ボタン =====
    document.querySelectorAll('#f-recruit-btns .toggle-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('#f-recruit-btns .toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('f-recruit-type').value = btn.dataset.val;
      };
    });

    // ===== 選考状況チップ =====
    document.querySelectorAll('.status-grid .status-chip').forEach(chip => {
      chip.onclick = () => {
        document.querySelectorAll('.status-grid .status-chip').forEach(ch => ch.classList.remove('active'));
        chip.classList.add('active');
        document.getElementById('f-status').value = chip.dataset.val;
      };
    });

    // ===== 担当者チップ（単一選択）=====
    document.querySelectorAll('#f-hrstaff-chips .chip-toggle').forEach(btn => {
      btn.onclick = () => {
        const wasSelected = btn.classList.contains('selected');
        document.querySelectorAll('#f-hrstaff-chips .chip-toggle').forEach(b => b.classList.remove('selected'));
        if (!wasSelected) {
          btn.classList.add('selected');
          document.getElementById('f-hrstaff').value = btn.dataset.val;
        } else {
          document.getElementById('f-hrstaff').value = '';
        }
      };
    });

    // オートコンプリート
    Masters.attachAutocomplete(document.getElementById('f-university'), universities);
    Masters.attachAutocomplete(document.getElementById('f-jobtype'),    jobTypes);

    openBackdrop('modal-candidate');
  }

  // ===== 保存 =====
  async function save() {
    const name = document.getElementById('f-name').value.trim();
    if (!name) {
      document.getElementById('f-name').classList.add('error');
      document.getElementById('err-name').textContent = '氏名は必須です';
      return;
    }
    document.getElementById('f-name').classList.remove('error');
    document.getElementById('err-name').textContent = '';

    const prefLocs = [...document.querySelectorAll('input[name="pref-loc"]:checked')].map(el => el.value);
    const faculty  = document.querySelector('input[name="faculty"]:checked')?.value || '';
    const motiv    = Number(document.querySelector('input[name="motivation"]:checked')?.value || 0);

    const data = {
      name,
      recruitType:        document.getElementById('f-recruit-type').value,
      university:         document.getElementById('f-university').value.trim(),
      facultyType:        faculty,
      jobType:            document.getElementById('f-jobtype').value.trim(),
      hrStaff:            document.getElementById('f-hrstaff').value,
      preferredLocations: prefLocs,
      selectionStatus:    document.getElementById('f-status').value,
      motivation:         motiv,
      notes:              document.getElementById('f-notes').value.trim(),
      remarks:            document.getElementById('f-remarks').value.trim(),
    };

    if (editingId !== null) {
      const existing = allCandidates.find(x => x.id === editingId);
      await DB.put(DB.STORES.CANDIDATES, Sync.stamp({ ...existing, ...data }));
      Utils.toast('候補者情報を更新しました');
    } else {
      data.createdAt = Utils.nowISO();
      await DB.add(DB.STORES.CANDIDATES, Sync.stamp(data));
      Utils.toast('候補者を登録しました');
    }

    closeBackdrop('modal-candidate');
    await load();
  }

  // ===== 削除 =====
  async function del() {
    if (!editingId) return;
    const c = allCandidates.find(x => x.id === editingId);
    if (!Utils.confirm(`「${c?.name}」を削除しますか？この操作は取り消せません。`)) return;
    await DB.remove(DB.STORES.CANDIDATES, editingId);
    Utils.toast('候補者を削除しました', 'info');
    closeBackdrop('modal-candidate');
    await load();
  }

  function getAll() { return allCandidates; }

  return { load, renderList, openModal, save, del, getAll, bindFilters, SELECTION_STATUSES };
})();

// モーダル開閉ヘルパー（グローバル）
function openBackdrop(id)  { document.getElementById(id)?.classList.add('open'); }
function closeBackdrop(id) { document.getElementById(id)?.classList.remove('open'); }
