const Interviews = (() => {
  const RESULTS = ['未実施','合格','不合格','辞退','保留'];
  const ROUNDS  = ['1次面接','2次面接','最終面接','その他'];

  function maxByRound(round) {
    if (round === '1次面接') return 4;
    if (round === '2次面接' || round === '最終面接') return 2;
    return 4;
  }

  let allInterviews = [];
  let editingId     = null;
  let ivSelector    = null;

  // ===== データ読み込み・正規化 =====
  async function load() {
    const raw  = await DB.getAll(DB.STORES.INTERVIEWS);
    const cands = Candidates.getAll();

    // 旧スキーマ (candidateId: number) → 新スキーマ (candidateIds: number[]) の互換処理
    allInterviews = raw.map(iv => {
      if (!iv.candidateIds) {
        iv.candidateIds = iv.candidateId ? [iv.candidateId] : [];
      }
      if (!iv.round) iv.round = '1次面接';
      iv._candidateNames = iv.candidateIds
        .map(id => cands.find(x => x.id === id)?.name)
        .filter(Boolean);
      iv._candidateName = iv._candidateNames[0] || '';
      return iv;
    });

    Calendar.setInterviews(allInterviews);
    Calendar.render();
  }

  // ===== カレンダーイベントハンドラ =====
  function initCalendar() {
    Calendar.init({
      onClickSlot:   (date, start, end) => openModal(null, date, start, end),
      onClickBlock:  (iv)               => openModal(iv.id),
      onMoveBlock:   async (iv, newDate, newStart, newEnd) => {
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
    });

    document.querySelectorAll('.cal-view-btn').forEach(btn => {
      btn.onclick = () => Calendar.setView(btn.dataset.calview);
    });
    document.getElementById('cal-prev')?.addEventListener('click',  () => Calendar.navigate(-1));
    document.getElementById('cal-next')?.addEventListener('click',  () => Calendar.navigate(1));
    document.getElementById('cal-today')?.addEventListener('click', () => Calendar.goToday());
    document.getElementById('btn-add-interview')?.addEventListener('click', () => {
      openModal(null, Utils.formatDate(new Date()), '10:00', '11:00');
    });
  }

  // ===== モーダル開く =====
  function openModal(id = null, defaultDate = null, defaultStart = '10:00', defaultEnd = '11:00') {
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
    const max    = maxByRound(round);

    const cands    = Candidates.getAll();
    const rooms    = Masters.get('rooms').map(r => r.name);
    const resultOpts = RESULTS.map(r => `<option ${result===r?'selected':''}>${r}</option>`).join('');
    const roundOpts  = ROUNDS.map(r =>
      `<option value="${r}" ${round===r?'selected':''}>${r}（定員${maxByRound(r)}名）</option>`
    ).join('');

    // 登録済み候補者IDリスト
    const selIds = iv.candidateIds || [];

    document.getElementById('modal-iv-body').innerHTML = `
      <div class="form-row">
        <div class="form-group">
          <label class="required">面接日</label>
          <input type="date" id="iv-date" class="form-control" value="${Utils.esc(date)}">
        </div>
        <div class="form-group">
          <label class="required">開始時刻</label>
          <select id="iv-start" class="form-control"></select>
        </div>
        <div class="form-group">
          <label class="required">終了時刻</label>
          <select id="iv-end" class="form-control"></select>
        </div>
        <div class="form-group">
          <label>面接回次</label>
          <select id="iv-round" class="form-control">${roundOpts}</select>
        </div>
      </div>

      <div class="form-group">
        <label>候補者
          <span id="iv-cap-label" class="cap-label"
            style="margin-left:8px;font-size:12px;color:var(--gray-500)">
            （0/${max}名）
          </span>
        </label>
        <div id="iv-candidate-area"></div>
      </div>

      <div class="form-group">
        <label>面接官（二段階選択）</label>
        <div id="iv-interviewer-selector"></div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>面接形式</label>
          <div class="radio-group">
            <label><input type="radio" name="iv-format" value="リアル"    ${format==='リアル'   ?'checked':''}> リアル</label>
            <label><input type="radio" name="iv-format" value="オンライン" ${format==='オンライン'?'checked':''}> オンライン</label>
          </div>
        </div>
        <div class="form-group">
          <label>面接結果</label>
          <select id="iv-result" class="form-control">${resultOpts}</select>
        </div>
      </div>
      <div class="form-group" id="iv-location-wrap" style="${format==='オンライン'?'display:none':''}">
        <label>面接場所</label>
        <input type="text" id="iv-location" class="form-control" value="${Utils.esc(iv.location||'')}" placeholder="会議室名など">
      </div>
      <div class="form-group" id="iv-url-wrap" style="${format==='リアル'?'display:none':''}">
        <label>オンラインURL</label>
        <input type="text" id="iv-online-url" class="form-control" value="${Utils.esc(iv.onlineUrl||'')}" placeholder="https://...">
      </div>
      <div class="form-group">
        <label>申送り</label>
        <textarea id="iv-notes" class="form-control">${Utils.esc(iv.notes||'')}</textarea>
      </div>`;

    Utils.fillTimeSelect(document.getElementById('iv-start'), start);
    Utils.fillTimeSelect(document.getElementById('iv-end'),   end);

    document.getElementById('iv-start').addEventListener('change', () => {
      const s = Utils.timeToMinutes(document.getElementById('iv-start').value);
      const e = Utils.timeToMinutes(document.getElementById('iv-end').value);
      if (e <= s) document.getElementById('iv-end').value = Utils.minutesToTime(s + 60);
    });

    document.querySelectorAll('input[name="iv-format"]').forEach(r => {
      r.addEventListener('change', () => {
        const online = document.querySelector('input[name="iv-format"]:checked')?.value === 'オンライン';
        document.getElementById('iv-location-wrap').style.display = online ? 'none' : '';
        document.getElementById('iv-url-wrap').style.display      = online ? '' : 'none';
      });
    });

    Masters.attachAutocomplete(document.getElementById('iv-location'), rooms);

    // 候補者セレクタ構築
    buildCandidateSelector('iv-candidate-area', cands, selIds, round);

    // 回次変更 → 定員更新
    document.getElementById('iv-round').addEventListener('change', () => {
      const r = document.getElementById('iv-round').value;
      rebuildCandidateCapLabel(r);
    });

    ivSelector = Masters.buildInterviewerSelector('iv-interviewer-selector', iv.interviewerIds || []);

    openBackdrop('modal-interview');
  }

  // ===== 候補者セレクタ =====
  function buildCandidateSelector(containerId, cands, selectedIds, round) {
    const container = document.getElementById(containerId);
    let selected = new Set(selectedIds);

    function getMax() {
      const r = document.getElementById('iv-round')?.value || round;
      return maxByRound(r);
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

      // 定員バー
      const dots = Array.from({length: max}, (_, i) =>
        `<span class="cap-dot ${i < cnt ? 'filled' : ''}"></span>`
      ).join('');

      const tags = [...selected].map(id => {
        const c = cands.find(x => x.id === id);
        return c ? `<span class="tag" data-id="${id}">${Utils.esc(c.name)}<button class="tag-remove" data-id="${id}">×</button></span>` : '';
      }).join('');

      // 追加セレクト
      const remaining = cands.filter(c => !selected.has(c.id));
      const addOpts   = remaining.map(c =>
        `<option value="${c.id}">${Utils.esc(c.name)}（${Utils.esc(c.selectionStatus||'')}）</option>`
      ).join('');

      container.innerHTML = `
        <div class="cap-dots">${dots}</div>
        <div class="interviewer-tags" id="cand-tags">${tags}</div>
        ${!full ? `<div style="display:flex;gap:8px;margin-top:6px;">
          <select id="cand-add-sel" class="form-control" style="flex:1">
            <option value="">-- 候補者を選択 --</option>
            ${addOpts}
          </select>
          <button class="btn btn-secondary btn-sm" id="btn-cand-add">追加</button>
        </div>` : `<p style="font-size:12px;color:var(--danger);margin-top:6px;">定員に達しました</p>`}`;

      container.querySelectorAll('.tag-remove').forEach(btn => {
        btn.onclick = () => { selected.delete(Number(btn.dataset.id)); render(); };
      });

      document.getElementById('btn-cand-add')?.addEventListener('click', () => {
        const val = Number(document.getElementById('cand-add-sel').value);
        if (val && !selected.has(val)) { selected.add(val); render(); }
      });
    }

    render();

    // 回次変更時に定員を再描画
    document.getElementById('iv-round')?.addEventListener('change', render);

    return { getSelected: () => [...selected] };
  }

  function rebuildCandidateCapLabel(round) {
    const max = maxByRound(round);
    const cap = document.getElementById('iv-cap-label');
    if (cap) {
      const cur = document.querySelectorAll('.cap-dot.filled').length;
      cap.textContent = `（${cur}/${max}名）`;
    }
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

    // 候補者ID収集（cap-dotsのタグから）
    const candIds = [...document.querySelectorAll('#iv-candidate-area .tag')].map(t => Number(t.dataset.id)).filter(Boolean);
    const ivIds   = ivSelector ? ivSelector.getSelected() : [];

    const data = {
      date,
      startTime:      start,
      endTime:        end,
      round:          document.getElementById('iv-round').value,
      candidateIds:   candIds,
      interviewerIds: ivIds,
      format:         document.querySelector('input[name="iv-format"]:checked')?.value || 'リアル',
      location:       document.getElementById('iv-location').value.trim(),
      onlineUrl:      document.getElementById('iv-online-url').value.trim(),
      result:         document.getElementById('iv-result').value,
      notes:          document.getElementById('iv-notes').value.trim(),
      updatedAt:      Utils.nowISO(),
    };

    if (editingId !== null) {
      const existing = allInterviews.find(x => x.id === editingId);
      await DB.put(DB.STORES.INTERVIEWS, { ...existing, ...data });
      Utils.toast('面接枠を更新しました');
    } else {
      data.createdAt = Utils.nowISO();
      await DB.add(DB.STORES.INTERVIEWS, data);
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

  return { load, initCalendar, openModal, save, del, getAll, maxByRound };
})();
