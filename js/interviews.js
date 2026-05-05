const Interviews = (() => {
  const RESULTS = ['未実施','合格','不合格','辞退','保留'];

  let allInterviews = [];
  let editingId     = null;
  let ivSelector    = null;  // 面接官二段階セレクタの参照

  // ===== データ読み込み =====
  async function load() {
    allInterviews = await DB.getAll(DB.STORES.INTERVIEWS);

    // 候補者名をキャッシュ
    const cands = Candidates.getAll();
    allInterviews.forEach(iv => {
      const c = cands.find(x => x.id === iv.candidateId);
      iv._candidateName = c ? c.name : '';
    });

    Calendar.setInterviews(allInterviews);
    Calendar.render();
  }

  // ===== カレンダーイベントハンドラ登録 =====
  function initCalendar() {
    Calendar.init({
      onClickSlot:   (date, start, end) => openModal(null, date, start, end),
      onClickBlock:  (iv)               => openModal(iv.id),
      onMoveBlock:   async (iv, newDate, newStart, newEnd) => {
        await DB.put(DB.STORES.INTERVIEWS, {
          ...iv, date: newDate, startTime: newStart, endTime: newEnd,
          updatedAt: Utils.nowISO(),
        });
        Utils.toast('面接枠を移動しました');
        await load();
      },
      onResizeBlock: async (iv, newEnd) => {
        await DB.put(DB.STORES.INTERVIEWS, { ...iv, endTime: newEnd, updatedAt: Utils.nowISO() });
        Utils.toast('終了時刻を変更しました');
        await load();
      },
    });

    // ビュー切り替えボタン
    document.querySelectorAll('.cal-view-btn').forEach(btn => {
      btn.onclick = () => Calendar.setView(btn.dataset.calview);
    });
    document.getElementById('cal-prev')?.addEventListener('click',  () => Calendar.navigate(-1));
    document.getElementById('cal-next')?.addEventListener('click',  () => Calendar.navigate(1));
    document.getElementById('cal-today')?.addEventListener('click', () => Calendar.goToday());

    // ＋ボタン
    document.getElementById('btn-add-interview')?.addEventListener('click', () => {
      const today = Utils.formatDate(new Date());
      openModal(null, today, '10:00', '11:00');
    });
  }

  // ===== モーダル開く =====
  function openModal(id = null, defaultDate = null, defaultStart = '10:00', defaultEnd = '11:00') {
    editingId = id;
    const isNew = id === null;
    const iv = isNew ? {} : allInterviews.find(x => x.id === id) || {};

    document.getElementById('modal-iv-title').textContent = isNew ? '面接枠登録' : '面接枠編集';
    const deleteBtn = document.getElementById('btn-delete-interview');
    deleteBtn.style.display = isNew ? 'none' : '';

    const date      = iv.date      || defaultDate || Utils.formatDate(new Date());
    const startTime = iv.startTime || defaultStart;
    const endTime   = iv.endTime   || defaultEnd;
    const format    = iv.format    || 'リアル';
    const result    = iv.result    || '未実施';

    // 候補者リスト
    const cands     = Candidates.getAll();
    const rooms     = Masters.get('rooms').map(r => r.name);
    const candOpts  = cands.map(c =>
      `<option value="${c.id}" ${iv.candidateId === c.id ? 'selected' : ''}>${Utils.esc(c.name)}</option>`
    ).join('');

    const resultOpts = RESULTS.map(r =>
      `<option ${result === r ? 'selected' : ''}>${r}</option>`
    ).join('');

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
      </div>
      <div class="form-row">
        <div class="form-group" style="flex:2">
          <label>候補者</label>
          <select id="iv-candidate" class="form-control">
            <option value="">（未選択）</option>
            ${candOpts}
          </select>
        </div>
        <div class="form-group">
          <label>面接形式</label>
          <div class="radio-group">
            <label><input type="radio" name="iv-format" value="リアル"    ${format === 'リアル'   ? 'checked' : ''}> リアル</label>
            <label><input type="radio" name="iv-format" value="オンライン" ${format === 'オンライン' ? 'checked' : ''}> オンライン</label>
          </div>
        </div>
      </div>
      <div class="form-group" id="iv-location-wrap" style="${format === 'オンライン' ? 'display:none' : ''}">
        <label>面接場所</label>
        <input type="text" id="iv-location" class="form-control" value="${Utils.esc(iv.location || '')}" placeholder="会議室名など">
      </div>
      <div class="form-group" id="iv-url-wrap" style="${format === 'リアル' ? 'display:none' : ''}">
        <label>オンラインURL</label>
        <input type="text" id="iv-online-url" class="form-control" value="${Utils.esc(iv.onlineUrl || '')}" placeholder="https://...">
      </div>
      <div class="form-group">
        <label>面接官（二段階選択）</label>
        <div id="iv-interviewer-selector"></div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>面接結果</label>
          <select id="iv-result" class="form-control">
            ${resultOpts}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>申送り</label>
        <textarea id="iv-notes" class="form-control">${Utils.esc(iv.notes || '')}</textarea>
      </div>`;

    // 時刻セレクト初期化
    Utils.fillTimeSelect(document.getElementById('iv-start'), startTime);
    Utils.fillTimeSelect(document.getElementById('iv-end'),   endTime);

    // 開始時刻変更で終了時刻を自動調整
    document.getElementById('iv-start').addEventListener('change', () => {
      const s = Utils.timeToMinutes(document.getElementById('iv-start').value);
      const e = Utils.timeToMinutes(document.getElementById('iv-end').value);
      if (e <= s) {
        document.getElementById('iv-end').value = Utils.minutesToTime(s + 60);
      }
    });

    // 面接形式切り替え
    document.querySelectorAll('input[name="iv-format"]').forEach(r => {
      r.addEventListener('change', () => {
        const isOnline = document.querySelector('input[name="iv-format"]:checked')?.value === 'オンライン';
        document.getElementById('iv-location-wrap').style.display = isOnline ? 'none' : '';
        document.getElementById('iv-url-wrap').style.display      = isOnline ? '' : 'none';
      });
    });

    // オートコンプリート（面接場所）
    Masters.attachAutocomplete(document.getElementById('iv-location'), rooms);

    // 面接官二段階セレクタ
    ivSelector = Masters.buildInterviewerSelector('iv-interviewer-selector', iv.interviewerIds || []);

    openBackdrop('modal-interview');
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

    const candId = Number(document.getElementById('iv-candidate').value) || null;
    const ivIds  = ivSelector ? ivSelector.getSelected() : [];

    const data = {
      date,
      startTime:      start,
      endTime:        end,
      candidateId:    candId,
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

  return { load, initCalendar, openModal, save, del, getAll };
})();
