const Interviews = (() => {
  const RESULTS = ['未実施','合格','不合格','辞退','保留'];
  const ROUNDS  = ['1次面接','2次面接','役員面接','その他'];
  const RESULT_CSS = { '未実施': 'neutral', '合格': 'pass', '不合格': 'fail', '辞退': 'cancel', '保留': 'hold' };

  // 面接回次 → 自動絞り込む選考状況
  const ROUND_STATUS = {
    '1次面接': '1次面接待ち',
    '2次面接': '2次面接待ち',
    '役員面接': '最終面接待ち',
  };

  function maxByRound(round) {
    if (round === '1次面接') return 4;
    return 2;
  }

  function needsGuide(round) {
    return ['2次面接','役員面接'].includes(round);
  }

  let allInterviews = [];
  let editingId     = null;
  let ivSelector    = null;

  // ===== 読み込み・正規化 =====
  async function load() {
    const raw   = await DB.getAll(DB.STORES.INTERVIEWS);
    const cands = Candidates.getAll();

    allInterviews = raw.map(iv => {
      if (!iv.candidateIds)        iv.candidateIds = iv.candidateId ? [iv.candidateId] : [];
      if (!iv.round)               iv.round = '1次面接';
      if (!iv.guideIds)            iv.guideIds = [];
      if (!iv.arrangementsChecked) iv.arrangementsChecked = { interviewer: false, room: false, guide: false };
      iv._candidateNames = iv.candidateIds.map(id => cands.find(x => x.id === id)?.name).filter(Boolean);
      iv._candidateName  = iv._candidateNames[0] || '';
      return iv;
    });

    Calendar.setInterviews(allInterviews);
    Calendar.render();
  }

  // ===== カレンダー初期化 =====
  function initCalendar() {
    Calendar.init({
      onClickSlot:  (date, start, end) => openModal(null, date, start, end),
      onClickBlock: (iv)               => openModal(iv.id),
      onMoveBlock:  async (iv, newDate, newStart, newEnd) => {
        const data = { ...iv, date: newDate, updatedAt: Utils.nowISO() };
        if (newStart) { data.startTime = newStart; data.endTime = newEnd; }
        await DB.put(DB.STORES.INTERVIEWS, data);
        Utils.toast('面接枠を移動しました');
        await load();
      },
      onResizeBlock: async (iv, newEnd) => {
        await DB.put(DB.STORES.INTERVIEWS, { ...iv, endTime: newEnd, updatedAt: Utils.nowISO() });
        Utils.toast('終了時刻を変更しました');
        await load();
      },
      onToggleArrangement: async (iv, field) => {
        const prev    = iv.arrangementsChecked || {};
        const checked = { ...prev, [field]: !prev[field] };
        await DB.put(DB.STORES.INTERVIEWS, { ...iv, arrangementsChecked: checked, updatedAt: Utils.nowISO() });
        await load();
      },
    });

    document.querySelectorAll('.cal-view-btn').forEach(btn => {
      btn.onclick = () => Calendar.setView(btn.dataset.calview);
    });
    document.getElementById('cal-prev')?.addEventListener('click',  () => Calendar.navigate(-1));
    document.getElementById('cal-next')?.addEventListener('click',  () => Calendar.navigate(1));
    document.getElementById('cal-today')?.addEventListener('click', () => Calendar.goToday());
    document.getElementById('btn-add-interview')?.addEventListener('click', () => {
      openModal(null, Utils.formatDate(new Date()), '10:00', '10:45');
    });
  }

  // ===== モーダル開く =====
  function openModal(id = null, defaultDate = null, defaultStart = '10:00', defaultEnd = '10:45') {
    editingId = id;
    const isNew = id === null;
    const iv = isNew ? {} : allInterviews.find(x => x.id === id) || {};

    document.getElementById('modal-iv-title').textContent = isNew ? '面接枠登録' : '面接枠編集';
    document.getElementById('btn-delete-interview').style.display = isNew ? 'none' : '';

    const date   = iv.date      || defaultDate || Utils.formatDate(new Date());
    const start  = iv.startTime || defaultStart;
    const end    = iv.endTime   || defaultEnd;
    const format = iv.format    || 'リアル';
    const result = iv.result    || '未実施';
    const round  = iv.round     || '1次面接';
    const ac     = iv.arrangementsChecked || {};

    const cands    = Candidates.getAll();
    const rooms    = Masters.get('rooms').map(r => r.name);
    const hrStaffs = Masters.get('hrStaff');

    // 面接場所 HTML 生成
    const isCustomLocation = !!(iv.location && !rooms.includes(iv.location));
    const locationBodyHtml = rooms.length
      ? `<div class="chip-toggle-group" id="iv-room-chips">
           ${rooms.map(r =>
             `<button class="chip-toggle${iv.location === r ? ' selected' : ''}" data-val="${Utils.esc(r)}">${Utils.esc(r)}</button>`
           ).join('')}
           <button class="chip-toggle${isCustomLocation ? ' selected' : ''}" data-val="__other__">その他</button>
         </div>
         <div id="iv-location-custom-wrap" style="margin-top:6px;${isCustomLocation ? '' : 'display:none'}">
           <input type="text" id="iv-location-custom" class="form-control"
             placeholder="場所名を直接入力..."
             value="${isCustomLocation ? Utils.esc(iv.location) : ''}">
         </div>
         <input type="hidden" id="iv-location" value="${Utils.esc(iv.location || '')}">`
      : `<input type="text" id="iv-location" class="form-control"
           value="${Utils.esc(iv.location || '')}" placeholder="会議室名など">`;

    document.getElementById('modal-iv-body').innerHTML = `
      <div class="form-row">
        <div class="form-group">
          <label class="required">面接日</label>
          <input type="date" id="iv-date" class="form-control" value="${Utils.esc(date)}">
        </div>
        <div class="form-group">
          <label class="required">開始時刻</label>
          <input type="text" id="iv-start" class="form-control" value="${Utils.esc(start)}" placeholder="--:--">
        </div>
        <div class="form-group">
          <label class="required">終了時刻</label>
          <input type="text" id="iv-end" class="form-control" value="${Utils.esc(end)}" placeholder="--:--">
        </div>
      </div>

      <div class="form-group">
        <label>面接回次</label>
        <div class="toggle-btn-group" id="iv-round-btns">
          ${ROUNDS.map(r =>
            `<button class="toggle-btn${round === r ? ' active' : ''}" data-val="${Utils.esc(r)}">${Utils.esc(r)}</button>`
          ).join('')}
        </div>
        <input type="hidden" id="iv-round" value="${Utils.esc(round)}">
      </div>

      <div class="form-group">
        <label>候補者
          <span id="iv-cap-label" class="cap-label" style="margin-left:8px;font-size:12px;color:var(--gray-500)">（0/${maxByRound(round)}名）</span>
        </label>
        <div id="iv-candidate-area"></div>
      </div>

      <div class="form-group">
        <label>面接官</label>
        <div id="iv-interviewer-selector"></div>
      </div>

      <div class="form-group" id="iv-guide-wrap" style="${needsGuide(round) ? '' : 'display:none'}">
        <label>案内係 <span style="font-size:11px;color:var(--gray-400)">（2次・役員面接のみ）</span></label>
        <div class="chip-toggle-group" id="iv-guide-area"></div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>面接形式</label>
          <div class="toggle-btn-group" id="iv-format-btns">
            <button class="toggle-btn${format === 'リアル'    ? ' active' : ''}" data-val="リアル">リアル</button>
            <button class="toggle-btn${format === 'オンライン' ? ' active' : ''}" data-val="オンライン">オンライン</button>
          </div>
          <input type="hidden" id="iv-format" value="${Utils.esc(format)}">
        </div>
        <div class="form-group">
          <label>面接結果</label>
          <div class="result-btn-group">
            ${RESULTS.map(r =>
              `<button class="result-btn result-btn-${RESULT_CSS[r]}${result === r ? ' active' : ''}" data-val="${Utils.esc(r)}">${Utils.esc(r)}</button>`
            ).join('')}
          </div>
          <input type="hidden" id="iv-result" value="${Utils.esc(result)}">
        </div>
      </div>

      <div class="form-group" id="iv-location-wrap" style="${format === 'オンライン' ? 'display:none' : ''}">
        <label>面接場所</label>
        ${locationBodyHtml}
      </div>
      <div class="form-group" id="iv-url-wrap" style="${format === 'リアル' ? 'display:none' : ''}">
        <label>オンラインURL</label>
        <input type="text" id="iv-online-url" class="form-control" value="${Utils.esc(iv.onlineUrl || '')}" placeholder="https://...">
      </div>

      <hr class="section-divider">
      <div class="form-group">
        <label>手配確認状況</label>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:4px;">
          <label style="display:inline-flex;align-items:center;gap:6px;font-weight:normal;cursor:pointer">
            <input type="checkbox" id="arr-interviewer" ${ac.interviewer ? 'checked' : ''}> 面接官 確認済み
          </label>
          <label style="display:inline-flex;align-items:center;gap:6px;font-weight:normal;cursor:pointer">
            <input type="checkbox" id="arr-room" ${ac.room ? 'checked' : ''}> 会議室 確認済み
          </label>
          <label id="arr-guide-lbl" style="display:${needsGuide(round) ? 'inline-flex' : 'none'};align-items:center;gap:6px;font-weight:normal;cursor:pointer">
            <input type="checkbox" id="arr-guide" ${ac.guide ? 'checked' : ''}> 案内係 確認済み
          </label>
        </div>
      </div>

      <div class="form-group">
        <label>申送り</label>
        <textarea id="iv-notes" class="form-control">${Utils.esc(iv.notes || '')}</textarea>
      </div>`;

    // ===== タイムピッカー =====
    let endPicker;
    const startPicker = Utils.buildTimePicker(
      document.getElementById('iv-start'), start,
      val => {
        const newEnd = Utils.minutesToTime(Math.min(Utils.timeToMinutes(val) + 45, 22 * 60));
        endPicker.setValue(newEnd);
      }
    );
    endPicker = Utils.buildTimePicker(document.getElementById('iv-end'), end);

    // ===== 回次ボタン =====
    document.querySelectorAll('#iv-round-btns .toggle-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('#iv-round-btns .toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const r = btn.dataset.val;
        document.getElementById('iv-round').value = r;
        const ng = needsGuide(r);
        document.getElementById('iv-guide-wrap').style.display  = ng ? '' : 'none';
        document.getElementById('arr-guide-lbl').style.display  = ng ? 'inline-flex' : 'none';
        const currentIds = [...document.querySelectorAll('#iv-candidate-area .tag')].map(t => Number(t.dataset.id)).filter(Boolean);
        buildCandidateSelector('iv-candidate-area', cands, currentIds, r);
      };
    });

    // ===== 面接形式ボタン =====
    document.querySelectorAll('#iv-format-btns .toggle-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('#iv-format-btns .toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('iv-format').value = btn.dataset.val;
        const online = btn.dataset.val === 'オンライン';
        document.getElementById('iv-location-wrap').style.display = online ? 'none' : '';
        document.getElementById('iv-url-wrap').style.display      = online ? '' : 'none';
      };
    });

    // ===== 面接場所チップ =====
    document.querySelectorAll('#iv-room-chips .chip-toggle').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('#iv-room-chips .chip-toggle').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        const customWrap = document.getElementById('iv-location-custom-wrap');
        if (btn.dataset.val === '__other__') {
          if (customWrap) customWrap.style.display = '';
          const custom = document.getElementById('iv-location-custom');
          if (custom) { custom.focus(); document.getElementById('iv-location').value = custom.value; }
        } else {
          if (customWrap) customWrap.style.display = 'none';
          document.getElementById('iv-location').value = btn.dataset.val;
        }
      };
    });
    document.getElementById('iv-location-custom')?.addEventListener('input', () => {
      document.getElementById('iv-location').value = document.getElementById('iv-location-custom').value.trim();
    });

    // ===== 結果ボタン =====
    document.querySelectorAll('.result-btn-group .result-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.result-btn-group .result-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('iv-result').value = btn.dataset.val;
      };
    });

    buildCandidateSelector('iv-candidate-area', cands, iv.candidateIds || [], round);
    ivSelector = Masters.buildInterviewerSelector('iv-interviewer-selector', iv.interviewerIds || []);
    buildGuideSelector('iv-guide-area', hrStaffs, iv.guideIds || []);

    openBackdrop('modal-interview');
  }

  // ===== 候補者セレクタ（選考状況フィルタ + インクリメンタルサーチ）=====
  function buildCandidateSelector(containerId, cands, selectedIds, round) {
    const container = document.getElementById(containerId);
    if (!container) return;
    let selected  = new Set(selectedIds);
    let statusVal = ROUND_STATUS[round] || '';  // 面接回次から自動セット

    function getMax() {
      return maxByRound(document.getElementById('iv-round')?.value || round);
    }

    function render() {
      const max  = getMax();
      const cnt  = selected.size;
      const full = cnt >= max;
      const capLabel = document.getElementById('iv-cap-label');
      if (capLabel) {
        capLabel.textContent = `（${cnt}/${max}名）`;
        capLabel.style.color = full ? 'var(--danger)' : 'var(--gray-500)';
      }

      const dots = Array.from({ length: max }, (_, i) =>
        `<span class="cap-dot ${i < cnt ? 'filled' : ''}"></span>`).join('');
      const tags = [...selected].map(id => {
        const c = cands.find(x => x.id === id);
        return c ? `<span class="tag" data-id="${id}">${Utils.esc(c.name)}<button class="tag-remove" data-id="${id}">×</button></span>` : '';
      }).join('');

      container.innerHTML = `
        <div class="cap-dots">${dots}</div>
        <div class="interviewer-tags">${tags}</div>
        ${!full
          ? `<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">
               <select id="cand-status-filter" class="form-control"
                 style="flex:0 0 auto;width:150px;font-size:12px;padding:6px 28px 6px 8px;">
                 <option value="">選考状況: すべて</option>
                 ${(Candidates.SELECTION_STATUSES || []).map(s =>
                   `<option value="${Utils.esc(s)}"${s === statusVal ? ' selected' : ''}>${Utils.esc(s)}</option>`
                 ).join('')}
               </select>
               <div style="position:relative;flex:1;min-width:120px;">
                 <input type="text" id="cand-search-input" class="form-control"
                   placeholder="名前で検索..." autocomplete="off">
                 <div id="cand-search-results" class="autocomplete-list" style="display:none;"></div>
               </div>
             </div>`
          : `<p style="font-size:12px;color:var(--danger);margin-top:6px;">定員に達しました</p>`
        }`;

      container.querySelectorAll('.tag-remove').forEach(btn =>
        btn.onclick = () => { selected.delete(Number(btn.dataset.id)); render(); });

      const searchInput  = document.getElementById('cand-search-input');
      const statusFilter = document.getElementById('cand-status-filter');
      const resultsList  = document.getElementById('cand-search-results');

      if (searchInput) {
        function getRemaining() {
          return cands.filter(c => {
            if (selected.has(c.id)) return false;
            if (statusVal && c.selectionStatus !== statusVal) return false;
            return true;
          });
        }

        function showResults() {
          const remaining = getRemaining();
          const q = searchInput.value.toLowerCase();
          const matches = remaining
            .filter(c => !q || `${c.name} ${c.selectionStatus || ''}`.toLowerCase().includes(q))
            .slice(0, 15);
          if (!matches.length && !statusVal && !q) {
            resultsList.style.display = 'none';
            return;
          }
          resultsList.innerHTML = matches.length
            ? matches.map(c =>
                `<div class="autocomplete-item" data-id="${c.id}">${Utils.esc(c.name)}（${Utils.esc(c.selectionStatus || '')}）</div>`
              ).join('')
            : `<div style="padding:8px 12px;font-size:13px;color:var(--gray-400);">該当なし</div>`;
          resultsList.style.display = 'block';
          resultsList.querySelectorAll('.autocomplete-item').forEach(item => {
            item.addEventListener('mousedown', e => {
              e.preventDefault();
              selected.add(Number(item.dataset.id));
              render();
            });
          });
        }

        searchInput.addEventListener('input', showResults);
        statusFilter?.addEventListener('change', () => {
          statusVal = statusFilter.value;
          searchInput.value = '';
          showResults();
        });
        searchInput.addEventListener('blur', () =>
          setTimeout(() => { if (resultsList) resultsList.style.display = 'none'; }, 150));

        // 面接回次に対応する選考状況で初期表示を自動絞り込み
        if (statusVal) showResults();
      }
    }

    render();
    return { getSelected: () => [...selected] };
  }

  // ===== 案内係セレクタ（チップトグル）=====
  function buildGuideSelector(containerId, hrStaffs, selectedIds) {
    const container = document.getElementById(containerId);
    if (!container) return;
    let selected = new Set((selectedIds || []).map(Number));

    function render() {
      container.innerHTML = hrStaffs.length
        ? hrStaffs.map(s =>
            `<button class="chip-toggle${selected.has(s.id) ? ' selected' : ''}" data-id="${s.id}">${Utils.esc(s.name)}</button>`
          ).join('')
        : '<span style="font-size:12px;color:var(--gray-400)">（担当者マスタ未登録）</span>';

      container.querySelectorAll('.chip-toggle').forEach(btn => {
        btn.onclick = e => {
          e.preventDefault();
          const id = Number(btn.dataset.id);
          selected.has(id) ? selected.delete(id) : selected.add(id);
          render();
        };
      });
    }

    render();
    return { getSelected: () => [...selected] };
  }

  // ===== 保存 =====
  async function save() {
    const date  = document.getElementById('iv-date').value;
    const start = document.getElementById('iv-start').value;
    const end   = document.getElementById('iv-end').value;

    if (!date) { Utils.toast('面接日を入力してください', 'error'); return; }
    if (Utils.timeToMinutes(start) >= Utils.timeToMinutes(end)) {
      Utils.toast('終了時刻は開始時刻より後にしてください', 'error'); return;
    }

    const candIds  = [...document.querySelectorAll('#iv-candidate-area .tag')].map(t => Number(t.dataset.id)).filter(Boolean);
    const ivIds    = ivSelector ? ivSelector.getSelected() : [];
    const guideIds = [...document.querySelectorAll('#iv-guide-area .chip-toggle.selected')].map(t => Number(t.dataset.id)).filter(Boolean);
    const round    = document.getElementById('iv-round').value;

    const data = {
      date,
      startTime:      start,
      endTime:        end,
      round,
      candidateIds:   candIds,
      interviewerIds: ivIds,
      guideIds,
      format:         document.getElementById('iv-format').value || 'リアル',
      location:       document.getElementById('iv-location').value.trim(),
      onlineUrl:      document.getElementById('iv-online-url').value.trim(),
      result:         document.getElementById('iv-result').value,
      notes:          document.getElementById('iv-notes').value.trim(),
      arrangementsChecked: {
        interviewer: document.getElementById('arr-interviewer')?.checked || false,
        room:        document.getElementById('arr-room')?.checked        || false,
        guide:       document.getElementById('arr-guide')?.checked       || false,
      },
      updatedAt: Utils.nowISO(),
    };

    if (editingId !== null) {
      const existing = allInterviews.find(x => x.id === editingId);
      await DB.put(DB.STORES.INTERVIEWS, Sync.stamp({ ...existing, ...data }));
      Utils.toast('面接枠を更新しました');
    } else {
      data.createdAt = Utils.nowISO();
      await DB.add(DB.STORES.INTERVIEWS, Sync.stamp(data));
      Utils.toast('面接枠を登録しました');
    }

    closeBackdrop('modal-interview');
    await load();
  }

  // ===== 削除 =====
  async function del() {
    if (!editingId) return;
    const iv = allInterviews.find(x => x.id === editingId);
    const label = iv ? `${iv.date} ${iv.startTime}〜${iv.endTime}` : '選択した面接枠';
    if (!Utils.confirm(`「${label}」を削除しますか？`)) return;
    await DB.remove(DB.STORES.INTERVIEWS, editingId);
    Utils.toast('面接枠を削除しました', 'info');
    closeBackdrop('modal-interview');
    await load();
  }

  function getAll() { return allInterviews; }

  return { load, initCalendar, openModal, save, del, getAll, maxByRound, needsGuide };
})();
