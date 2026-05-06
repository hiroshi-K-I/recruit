const Candidates = (() => {
  const SELECTION_STATUSES = [
    '書類選考中','1次面接待ち','1次面接済','2次面接待ち','2次面接済',
    '役員面接待ち','役員面接済','内定','内定承諾','辞退','不採用',
  ];

  const JOB_TYPES = ['SE', 'IE', '営業', 'その他'];

  const STATUS_COLOR = {
    '書類選考中':  'badge-gray',
    '1次面接待ち': 'badge-blue',
    '1次面接済':   'badge-blue',
    '2次面接待ち': 'badge-blue',
    '2次面接済':   'badge-blue',
    '役員面接待ち':'badge-yellow',
    '役員面接済':  'badge-yellow',
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
    const locations    = Masters.get('locations').map(l => l.name);
    const hrStaffs     = Masters.get('hrStaff').map(s => s.name);

    const prefLocs = (c.preferredLocations || []);

    // 志望度スター
    const stars = [5,4,3,2,1].map(n =>
      `<input type="radio" name="motivation" id="star${n}" value="${n}" ${(c.motivation || 0) === n ? 'checked' : ''}>
       <label for="star${n}" title="${n}">★</label>`
    ).join('');

    const candInterviews = !isNew
      ? (typeof Interviews !== 'undefined' ? Interviews.getAll().filter(iv => (iv.candidateIds||[]).includes(id)).sort((a,b) => b.date.localeCompare(a.date)) : [])
      : [];

    document.getElementById('modal-cand-body').innerHTML = `
      <div class="modal-2col">
        <div class="modal-col">
          <div class="form-group">
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
          <div class="form-group">
            <label>大学</label>
            <input type="text" id="f-university" class="form-control"
              value="${Utils.esc(c.university || '')}"
              placeholder="${universities.length ? '絞り込み入力、または直接入力...' : '大学名を入力'}">
            ${universities.length
              ? `<div class="chip-toggle-group" id="univ-chip-list"
                   style="max-height:64px;overflow-y:auto;margin-top:6px;"></div>`
              : ''}
          </div>
          <div class="form-group">
            <label>文理</label>
            <div class="toggle-btn-group" id="f-faculty-btns">
              ${['', '文系', '理系', 'その他'].map(v =>
                `<button class="toggle-btn${(c.facultyType || '') === v ? ' active' : ''}" data-val="${Utils.esc(v)}">${v || '未設定'}</button>`
              ).join('')}
            </div>
            <input type="hidden" id="f-faculty" value="${Utils.esc(c.facultyType || '')}">
          </div>
          <div class="form-group">
            <label>職種</label>
            <div class="toggle-btn-group" id="f-jobtype-btns">
              ${JOB_TYPES.map(v =>
                `<button class="toggle-btn${c.jobType === v ? ' active' : ''}" data-val="${Utils.esc(v)}">${Utils.esc(v)}</button>`
              ).join('')}
            </div>
            <input type="hidden" id="f-jobtype" value="${Utils.esc(c.jobType || '')}">
          </div>
        </div>

        <div class="modal-col">
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
          <div class="form-group">
            <label>希望勤務地</label>
            ${locations.length
              ? `<div class="chip-toggle-group" id="f-loc-chips">
                   ${locations.map(l =>
                     `<button class="chip-toggle${prefLocs.includes(l) ? ' selected' : ''}" data-val="${Utils.esc(l)}">${Utils.esc(l)}</button>`
                   ).join('')}
                 </div>`
              : `<span style="font-size:12px;color:var(--gray-400);">（勤務地マスタ未登録）</span>`
            }
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
          <div class="form-group" style="margin-bottom:0">
            <label>特記事項</label>
            <textarea id="f-remarks" class="form-control">${Utils.esc(c.remarks || '')}</textarea>
          </div>
        </div>

        ${candInterviews.length > 0 ? `
        <div class="modal-span2" style="margin-top:6px">
          <hr class="section-divider" style="margin:8px 0 10px">
          <div class="form-group" style="margin-bottom:0">
            <label>面接履歴</label>
            <div style="overflow-y:auto;max-height:72px;border:1px solid var(--gray-200);border-radius:var(--radius);">
              ${candInterviews.slice(0,6).map(iv => {
                const rCls = {'合格':'badge-green','不合格':'badge-red','辞退':'badge-gray','保留':'badge-purple'}[iv.result]||'badge-gray';
                return `<div style="display:flex;gap:8px;padding:4px 10px;border-bottom:1px solid var(--gray-100);align-items:center;font-size:12px">
                  <span style="color:var(--gray-500);white-space:nowrap">${Utils.esc(iv.date)}</span>
                  <span class="badge badge-blue">${Utils.esc(iv.round||'')}</span>
                  <span>${Utils.esc(iv.startTime||'')}〜${Utils.esc(iv.endTime||'')}</span>
                  <span style="margin-left:auto" class="badge ${rCls}">${Utils.esc(iv.result||'未実施')}</span>
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>` : ''}
      </div>`;

    // ===== 採用種別ボタン =====
    document.querySelectorAll('#f-recruit-btns .toggle-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('#f-recruit-btns .toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('f-recruit-type').value = btn.dataset.val;
      };
    });

    // ===== 文理ボタン =====
    document.querySelectorAll('#f-faculty-btns .toggle-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('#f-faculty-btns .toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('f-faculty').value = btn.dataset.val;
      };
    });

    // ===== 職種ボタン =====
    document.querySelectorAll('#f-jobtype-btns .toggle-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('#f-jobtype-btns .toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('f-jobtype').value = btn.dataset.val;
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

    // ===== 希望勤務地チップ（複数選択）=====
    document.querySelectorAll('#f-loc-chips .chip-toggle').forEach(btn => {
      btn.onclick = () => {
        btn.classList.toggle('selected');
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

    // ===== 大学チップフィルタ =====
    const univInput = document.getElementById('f-university');
    const univChipList = document.getElementById('univ-chip-list');
    if (univInput && univChipList) {
      let selectedUniv = c.university || '';

      function renderUnivChips() {
        const q = univInput.value.toLowerCase();
        const shown = universities
          .filter(u => !q || u.toLowerCase().includes(q))
          .slice(0, 40);
        univChipList.innerHTML = shown.map(u =>
          `<button class="chip-toggle${selectedUniv === u ? ' selected' : ''}" data-val="${Utils.esc(u)}">${Utils.esc(u)}</button>`
        ).join('') || (q ? '<span style="font-size:12px;color:var(--gray-400);">該当なし（直接入力可）</span>' : '');

        univChipList.querySelectorAll('.chip-toggle').forEach(btn => {
          btn.addEventListener('mousedown', e => {
            e.preventDefault();
            selectedUniv = btn.dataset.val;
            univInput.value = selectedUniv;
            renderUnivChips();
          });
        });
      }

      renderUnivChips();
      univInput.addEventListener('input', () => {
        selectedUniv = '';
        renderUnivChips();
      });
    }

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

    const prefLocs = [...document.querySelectorAll('#f-loc-chips .chip-toggle.selected')].map(btn => btn.dataset.val);
    const motiv    = Number(document.querySelector('input[name="motivation"]:checked')?.value || 0);

    const data = {
      name,
      recruitType:        document.getElementById('f-recruit-type').value,
      university:         document.getElementById('f-university').value.trim(),
      facultyType:        document.getElementById('f-faculty').value,
      jobType:            document.getElementById('f-jobtype').value,
      hrStaff:            document.getElementById('f-hrstaff').value,
      preferredLocations: prefLocs,
      selectionStatus:    document.getElementById('f-status').value,
      motivation:         motiv,
      notes:              document.getElementById('f-notes')?.value.trim() || '',
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
    if (typeof Dashboard !== 'undefined') Dashboard.render();
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
    if (typeof Dashboard !== 'undefined') Dashboard.render();
  }

  function getAll() { return allCandidates; }

  return { load, renderList, openModal, save, del, getAll, bindFilters, SELECTION_STATUSES };
})();

// モーダル開閉ヘルパー（グローバル）
function openBackdrop(id)  { document.getElementById(id)?.classList.add('open'); }
function closeBackdrop(id) { document.getElementById(id)?.classList.remove('open'); }
