const Interviews = (() => {
  const RESULTS = ['未実施','合格','不合格','辞退','保留'];
  const ROUNDS  = ['1次面接','2次面接','役員面接','その他'];
  const RESULT_CSS = { '未実施': 'neutral', '合格': 'pass', '不合格': 'fail', '辞退': 'cancel', '保留': 'hold', '混在': 'mixed' };

  // 面接回次 → 自動絞り込む選考状況
  const ROUND_STATUS = {
    '1次面接': '1次面接待ち',
    '2次面接': '2次面接待ち',
    '役員面接': '役員面接待ち',
  };

  // 面接結果 → 候補者選考状況の自動更新マッピング
  const RESULT_TO_NEXT_STATUS = {
    '1次面接':  { '合格': '2次面接待ち',  '不合格': '不採用', '辞退': '辞退' },
    '2次面接':  { '合格': '役員面接待ち', '不合格': '不採用', '辞退': '辞退' },
    '役員面接': { '合格': '内定',         '不合格': '不採用', '辞退': '辞退' },
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
      if (!iv.candidateResults) {
        iv.candidateResults = {};
        iv.candidateIds.forEach(cid => { iv.candidateResults[cid] = iv.result || '未実施'; });
      }
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
    const round  = iv.round     || '1次面接';
    const ac     = iv.arrangementsChecked || {};

    // 候補者ごとの結果ステート（モーダルが開いている間保持）
    const candidateResults = {};
    (iv.candidateIds || []).forEach(cid => {
      candidateResults[cid] = (iv.candidateResults || {})[cid] || iv.result || '未実施';
    });

    function refreshResultSection() {
      const selIds = [...document.querySelectorAll('#iv-candidate-area .tag')]
        .map(t => Number(t.dataset.id)).filter(Boolean);
      selIds.forEach(sid => { if (!(sid in candidateResults)) candidateResults[sid] = '未実施'; });
      buildResultSection('iv-result-area', selIds, candidateResults, cands);
    }

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
      <div class="modal-2col modal-iv-2col">
        <div class="modal-col">
          <div class="form-row">
            <div class="form-group">
              <label class="required">面接日</label>
              <input type="date" id="iv-date" class="form-control" value="${Utils.esc(date)}">
            </div>
            <div class="form-group">
              <label class="required">開始</label>
              <input type="text" id="iv-start" class="form-control" value="${Utils.esc(start)}" placeholder="--:--">
            </div>
            <div class="form-group">
              <label class="required">終了</label>
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
        </div>

        <div class="modal-col">
          <div class="form-group">
            <label>面接官</label>
            <div id="iv-interviewer-selector"></div>
          </div>

          <div class="form-group" id="iv-guide-wrap" style="${needsGuide(round) ? '' : 'display:none'}">
            <label>案内係 <span style="font-size:11px;color:var(--gray-400)">（2次・役員のみ）</span></label>
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
              <div id="iv-result-area"></div>
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

          <div class="form-group">
            <label>手配確認</label>
            <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:4px;">
              <label style="display:inline-flex;align-items:center;gap:5px;font-weight:normal;cursor:pointer;font-size:13px">
                <input type="checkbox" id="arr-interviewer" ${ac.interviewer ? 'checked' : ''}> 面接官済
              </label>
              <label style="display:inline-flex;align-items:center;gap:5px;font-weight:normal;cursor:pointer;font-size:13px">
                <input type="checkbox" id="arr-room" ${ac.room ? 'checked' : ''}> 会議室済
              </label>
              <label id="arr-guide-lbl" style="display:${needsGuide(round) ? 'inline-flex' : 'none'};align-items:center;gap:5px;font-weight:normal;cursor:pointer;font-size:13px">
                <input type="checkbox" id="arr-guide" ${ac.guide ? 'checked' : ''}> 案内係済
              </label>
            </div>
          </div>

          <div class="form-group" style="margin-bottom:0">
            <label>申送り</label>
            <textarea id="iv-notes" class="form-control">${Utils.esc(iv.notes || '')}</textarea>
          </div>
        </div>
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
        const prevRound = document.getElementById('iv-round').value;
        const r = btn.dataset.val;
        if (r === prevRound) return;

        const currentIds = [...document.querySelectorAll('#iv-candidate-area .tag')].map(t => Number(t.dataset.id)).filter(Boolean);
        if (currentIds.length > 0 && !Utils.confirm('面接回次を変更すると、選択済みの候補者がリセットされます。続行しますか？')) return;

        document.querySelectorAll('#iv-round-btns .toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('iv-round').value = r;
        const ng = needsGuide(r);
        document.getElementById('iv-guide-wrap').style.display  = ng ? '' : 'none';
        document.getElementById('arr-guide-lbl').style.display  = ng ? 'inline-flex' : 'none';
        buildCandidateSelector('iv-candidate-area', cands, [], r);
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

    buildCandidateSelector('iv-candidate-area', cands, iv.candidateIds || [], round, refreshResultSection);
    refreshResultSection();
    ivSelector = Masters.buildInterviewerSelector('iv-interviewer-selector', iv.interviewerIds || []);
    buildGuideSelector('iv-guide-area', hrStaffs, iv.guideIds || []);

    openBackdrop('modal-interview');
  }

  // ===== 候補者ごとの結果セクション =====
  function buildResultSection(areaId, selectedIds, resultsState, cands) {
    const area = document.getElementById(areaId);
    if (!area) return;
    if (selectedIds.length === 0) {
      area.innerHTML = '<p style="font-size:12px;color:var(--gray-400);margin:4px 0;">候補者を選択してください</p>';
      return;
    }
    area.innerHTML = selectedIds.map(id => {
      const cand = cands.find(c => c.id === id);
      const name = cand ? Utils.esc(cand.name) : `ID:${id}`;
      const cur  = resultsState[id] || '未実施';
      const btns = RESULTS.map(r =>
        `<button class="result-btn result-btn-${RESULT_CSS[r]}${cur === r ? ' active' : ''}" data-val="${Utils.esc(r)}">${Utils.esc(r)}</button>`
      ).join('');
      return `<div class="candidate-result-row" data-id="${id}"
        style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
        <span style="flex:0 0 76px;font-size:13px;font-weight:500;overflow:hidden;
          text-overflow:ellipsis;white-space:nowrap;" title="${name}">${name}</span>
        <div class="result-btn-group">${btns}</div>
      </div>`;
    }).join('');
    area.querySelectorAll('.candidate-result-row').forEach(row => {
      const cid = Number(row.dataset.id);
      row.querySelectorAll('.result-btn').forEach(btn => {
        btn.onclick = () => {
          row.querySelectorAll('.result-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          resultsState[cid] = btn.dataset.val;
        };
      });
    });
  }

  // ===== 候補者セレクタ（選考状況フィルタ + インクリメンタルサーチ）=====
  function buildCandidateSelector(containerId, cands, selectedIds, round, onSelectionChange) {
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
          ? `<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;align-items:center;">
               ${statusVal
                 ? `<span style="flex:0 0 auto;font-size:12px;color:var(--gray-600);padding:4px 10px;
                      background:var(--gray-100);border:1px solid var(--gray-200);border-radius:var(--radius);white-space:nowrap;">
                      🔒 ${Utils.esc(statusVal)}</span>`
                 : `<select id="cand-status-filter" class="form-control"
                      style="flex:0 0 auto;width:150px;font-size:12px;padding:6px 28px 6px 8px;">
                      <option value="">選考状況: すべて</option>
                      ${(Candidates.SELECTION_STATUSES || []).map(s =>
                        `<option value="${Utils.esc(s)}"${s === statusVal ? ' selected' : ''}>${Utils.esc(s)}</option>`
                      ).join('')}
                    </select>`
               }
               <div style="position:relative;flex:1;min-width:120px;">
                 <input type="text" id="cand-search-input" class="form-control"
                   placeholder="名前で検索..." autocomplete="off">
                 <div id="cand-search-results" class="autocomplete-list" style="display:none;"></div>
               </div>
             </div>`
          : `<p style="font-size:12px;color:var(--danger);margin-top:6px;">定員に達しました</p>`
        }`;

      container.querySelectorAll('.tag-remove').forEach(btn =>
        btn.onclick = () => { selected.delete(Number(btn.dataset.id)); render(); onSelectionChange?.(); });

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
              onSelectionChange?.();
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

    // 面接回次と候補者の選考状況が一致しているか検証
    const expectedStatus = ROUND_STATUS[round];
    if (expectedStatus && candIds.length > 0) {
      const allCands = Candidates.getAll();
      const mismatched = candIds
        .map(id => allCands.find(c => c.id === id))
        .filter(c => c && c.selectionStatus !== expectedStatus);
      if (mismatched.length > 0) {
        const names = mismatched.map(c => c.name).join('、');
        Utils.toast(`${names} の選考状況が「${expectedStatus}」ではありません`, 'error');
        return;
      }
    }

    // 候補者ごとの結果を収集
    const candidateResultsMap = {};
    document.querySelectorAll('#iv-result-area .candidate-result-row').forEach(row => {
      const cid = Number(row.dataset.id);
      const active = row.querySelector('.result-btn.active');
      candidateResultsMap[cid] = active ? active.dataset.val : '未実施';
    });

    // カレンダー表示用サマリー
    const resultVals  = candIds.map(id => candidateResultsMap[id] || '未実施');
    const uniqueVals  = [...new Set(resultVals)];
    const summaryResult = resultVals.length === 0 ? '未実施'
      : uniqueVals.length === 1 ? uniqueVals[0] : '混在';

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
      result:         summaryResult,
      candidateResults: candidateResultsMap,
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

    // 面接結果→候補者選考状況の自動更新（候補者ごとに個別判定）
    const allCands = Candidates.getAll();
    const updates  = [];
    for (const cid of candIds) {
      const cand       = allCands.find(c => c.id === cid);
      if (!cand) continue;
      const candResult = candidateResultsMap[cid] || '未実施';
      const nextStatus = RESULT_TO_NEXT_STATUS[data.round]?.[candResult];
      if (nextStatus) updates.push({ cand, nextStatus });
    }
    if (updates.length > 0) {
      const msg = updates.map(u => `・${u.cand.name} → 「${u.nextStatus}」`).join('\n');
      if (Utils.confirm(`以下の候補者の選考状況を更新しますか？\n${msg}`)) {
        for (const { cand, nextStatus } of updates) {
          await DB.put(DB.STORES.CANDIDATES, Sync.stamp({ ...cand, selectionStatus: nextStatus }));
        }
        await Candidates.load();
      }
    }

    closeBackdrop('modal-interview');
    await load();
    if (typeof Dashboard !== 'undefined') Dashboard.render();
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
    if (typeof Dashboard !== 'undefined') Dashboard.render();
  }

  function getAll() { return allInterviews; }

  return { load, initCalendar, openModal, save, del, getAll, maxByRound, needsGuide };
})();
