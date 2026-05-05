const Calendar = (() => {
  const CAL_START  = 7;
  const CAL_END    = 22;
  const PX_PER_MIN = 1;
  const SNAP_MIN   = 15;

  let currentView = 'month';
  let currentDate = new Date();
  let interviews  = [];
  let onClickSlot         = null;
  let onClickBlock        = null;
  let onMoveBlock         = null;
  let onResizeBlock       = null;
  let onToggleArrangement = null;

  function init(opts) {
    onClickSlot         = opts.onClickSlot;
    onClickBlock        = opts.onClickBlock;
    onMoveBlock         = opts.onMoveBlock;
    onResizeBlock       = opts.onResizeBlock;
    onToggleArrangement = opts.onToggleArrangement;
  }

  function setInterviews(data) { interviews = data; }

  function setView(view) {
    currentView = view;
    document.querySelectorAll('.cal-view-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.calview === view));
    render();
  }

  function navigate(dir) {
    if (currentView === 'month') {
      currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + dir, 1);
    } else if (currentView === 'arrangement') {
      currentDate = addDays(currentDate, dir * 7);
    } else if (currentView === 'week') {
      currentDate = addDays(currentDate, dir * 7);
    } else {
      currentDate = addDays(currentDate, dir);
    }
    render();
  }

  function goToday() { currentDate = new Date(); render(); }

  function render() {
    const container = document.getElementById('calendar-container');
    if (!container) return;
    updateTitle();
    if      (currentView === 'month')       renderMonth(container);
    else if (currentView === 'week')        renderWeekDay(container, 7);
    else if (currentView === 'arrangement') renderArrangement(container);
    else                                    renderWeekDay(container, 1);
  }

  function updateTitle() {
    const title = document.getElementById('cal-title');
    if (!title) return;
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth() + 1;
    if (currentView === 'month') {
      title.textContent = `${y}年${m}月`;
    } else if (currentView === 'arrangement') {
      const we = addDays(currentDate, 13);
      title.textContent = `手配確認: ${Utils.formatDate(currentDate)} 〜 ${Utils.formatDate(we)}`;
    } else if (currentView === 'week') {
      const ws = weekStart(currentDate);
      const we = addDays(ws, 6);
      title.textContent = `${Utils.formatDate(ws)} 〜 ${Utils.formatDate(we)}`;
    } else {
      title.textContent = Utils.formatDateJa(currentDate);
    }
  }

  // ===== 手配ドット =====
  function arrDotsHtml(iv, size) {
    const ac = iv.arrangementsChecked || {};
    const ng = Interviews?.needsGuide?.(iv.round);
    const items = [
      { checked: ac.interviewer, label: '面接官手配' },
      { checked: ac.room,        label: '会議室手配' },
      ...(ng ? [{ checked: ac.guide, label: '案内係手配' }] : []),
    ];
    return `<div class="arr-dots-${size}">${items.map(it =>
      `<span class="arr-dot-${size} ${it.checked ? 'ok' : 'ng'}" title="${it.label}"></span>`
    ).join('')}</div>`;
  }

  // ===================== 月表示 =====================
  function renderMonth(container) {
    const year  = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const first = new Date(year, month, 1);
    const today = Utils.formatDate(new Date());
    const start = addDays(first, -first.getDay());
    const days  = Array.from({length: 42}, (_, i) => addDays(start, i));
    const WD    = ['日','月','火','水','木','金','土'];

    let html = `<div class="cal-month">
      <div class="cal-month-header">
        ${WD.map(d => `<div class="cal-month-header-cell">${d}</div>`).join('')}
      </div>
      <div class="cal-month-grid">`;

    days.forEach(d => {
      const ds      = Utils.formatDate(d);
      const isOther = d.getMonth() !== month;
      const isToday = ds === today;
      const dayIvs  = interviews.filter(iv => iv.date === ds);

      const chips = dayIvs.slice(0, 3).map(iv => {
        const cls   = chipClass(iv);
        const label = ivLabel(iv);
        const max   = Interviews?.maxByRound?.(iv.round) ?? 4;
        const cnt   = (iv.candidateIds || []).length;
        return `<div class="cell-event-chip ${cls}" draggable="true"
          data-id="${iv.id}" title="${Utils.esc(label)}">
          ${Utils.esc(iv.startTime)} ${Utils.esc(label)}
          <span class="chip-cap">${cnt}/${max}</span>
          ${arrDotsHtml(iv, 'sm')}
        </div>`;
      }).join('');
      const more = dayIvs.length > 3
        ? `<div class="cell-more">他 ${dayIvs.length - 3} 件</div>` : '';

      html += `<div class="cal-month-cell ${isOther?'other-month':''} ${isToday?'today':''}"
        data-date="${ds}">
        <div class="cell-day">${d.getDate()}</div>
        <div class="cell-events">${chips}${more}</div>
      </div>`;
    });

    html += `</div></div>`;
    container.innerHTML = html;

    container.querySelectorAll('.cal-month-cell').forEach(cell => {
      cell.addEventListener('click', e => {
        if (e.target.closest('.cell-event-chip')) return;
        onClickSlot && onClickSlot(cell.dataset.date, '10:00', '11:00');
      });
      cell.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        cell.classList.add('drag-over');
      });
      cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
      cell.addEventListener('drop', async e => {
        e.preventDefault();
        cell.classList.remove('drag-over');
        const id = Number(e.dataTransfer.getData('text/plain'));
        const iv = interviews.find(x => x.id === id);
        if (iv && iv.date !== cell.dataset.date) {
          onMoveBlock && onMoveBlock(iv, cell.dataset.date, null, null);
        }
      });
    });

    container.querySelectorAll('.cell-event-chip').forEach(chip => {
      chip.addEventListener('click', e => {
        e.stopPropagation();
        const iv = interviews.find(x => x.id === Number(chip.dataset.id));
        if (iv) onClickBlock && onClickBlock(iv);
      });
      chip.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', chip.dataset.id);
        e.dataTransfer.effectAllowed = 'move';
        chip.style.opacity = '.4';
      });
      chip.addEventListener('dragend', () => { chip.style.opacity = ''; });
    });
  }

  // ===================== 週/日表示 =====================
  function renderWeekDay(container, days) {
    const startD    = days === 7 ? weekStart(currentDate) : currentDate;
    const cols      = Array.from({length: days}, (_, i) => addDays(startD, i));
    const today     = Utils.formatDate(new Date());
    const totalMins = (CAL_END - CAL_START) * 60;
    const totalH    = totalMins * PX_PER_MIN;
    const WD        = ['日','月','火','水','木','金','土'];

    let html = `<div class="cal-week-wrap">
      <div class="cal-week-header">
        <div class="cal-week-gutter-head"></div>`;
    cols.forEach(d => {
      const ds  = Utils.formatDate(d);
      const cls = ds === today ? 'today' : '';
      html += `<div class="cal-week-day-head ${cls}">
        <span class="day-num">${d.getDate()}</span>
        <span>${WD[d.getDay()]}</span>
      </div>`;
    });
    html += `</div><div class="cal-week-body">
      <div class="cal-week-gutter" style="height:${totalH}px">`;

    for (let h = CAL_START; h <= CAL_END; h++) {
      const top = (h - CAL_START) * 60 * PX_PER_MIN;
      html += `<div class="cal-week-gutter-label" style="top:${top}px">${h}:00</div>`;
    }
    html += `</div><div class="cal-week-days">`;

    cols.forEach(d => {
      const ds     = Utils.formatDate(d);
      const dayIvs = interviews.filter(iv => iv.date === ds);

      html += `<div class="cal-week-col" data-date="${ds}" style="height:${totalH}px">`;

      for (let h = CAL_START; h <= CAL_END; h++) {
        const top = (h - CAL_START) * 60 * PX_PER_MIN;
        html += `<div class="cal-hour-line" style="top:${top}px"></div>`;
        if (h < CAL_END) html += `<div class="cal-hour-line half" style="top:${top+30}px"></div>`;
      }

      const laid = layoutBlocks(dayIvs);
      laid.forEach(({ iv, left, width }) => {
        const sMins  = Utils.timeToMinutes(iv.startTime) - CAL_START * 60;
        const eMins  = Utils.timeToMinutes(iv.endTime)   - CAL_START * 60;
        const top    = Math.max(0, sMins) * PX_PER_MIN;
        const height = Math.max(15, eMins - sMins) * PX_PER_MIN;
        const cls    = Utils.resultColorClass(iv);
        const max    = Interviews?.maxByRound?.(iv.round) ?? 4;
        const cnt    = (iv.candidateIds || []).length;
        const dots   = Array.from({length: max}, (_, i) =>
          `<span class="cap-dot-sm ${i < cnt ? 'filled' : ''}"></span>`).join('');

        html += `<div class="interview-block ${cls}" data-id="${iv.id}"
          style="top:${top}px;height:${height}px;left:${left}%;width:${width}%"
          title="${Utils.esc(ivLabel(iv))} (${cnt}/${max}名)">
          <div class="block-title">${Utils.esc(iv.startTime)}〜${Utils.esc(iv.endTime)}</div>
          <div class="block-sub">${Utils.esc(ivLabel(iv))}</div>
          <div class="block-caps">${dots}</div>
          ${arrDotsHtml(iv, 'blk')}
          <div class="block-resize-handle" data-id="${iv.id}"></div>
        </div>`;
      });

      if (ds === today) {
        const now  = new Date();
        const nowM = now.getHours() * 60 + now.getMinutes() - CAL_START * 60;
        if (nowM >= 0 && nowM <= totalMins)
          html += `<div class="cal-now-line" style="top:${nowM * PX_PER_MIN}px"></div>`;
      }

      html += `</div>`;
    });

    html += `</div></div></div>`;
    container.innerHTML = html;

    container.querySelectorAll('.cal-week-col').forEach(col => {
      col.addEventListener('click', e => {
        if (e.target.closest('.interview-block')) return;
        const rect  = col.getBoundingClientRect();
        const relY  = e.clientY - rect.top;
        const mins  = snapMins(relY / PX_PER_MIN);
        const start = Utils.minutesToTime(CAL_START * 60 + mins);
        const end   = Utils.minutesToTime(CAL_START * 60 + mins + 60);
        onClickSlot && onClickSlot(col.dataset.date, start, end);
      });
    });

    container.querySelectorAll('.interview-block').forEach(block => {
      block.addEventListener('click', e => {
        if (e.target.classList.contains('block-resize-handle')) return;
        e.stopPropagation();
        const iv = interviews.find(x => x.id === Number(block.dataset.id));
        if (iv) onClickBlock && onClickBlock(iv);
      });
    });

    attachBlockDrag(container);
    attachBlockResize(container);
    attachDragCreate(container);
  }

  // ===================== 手配リスト表示 =====================
  function renderArrangement(container) {
    const startStr = Utils.formatDate(currentDate);
    const endStr   = Utils.formatDate(addDays(currentDate, 13));

    const upcoming = interviews
      .filter(iv => iv.date >= startStr && iv.date <= endStr)
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

    const ivMaster = Masters.get('interviewers');
    const hrStaffs = Masters.get('hrStaff');

    const total   = upcoming.length;
    const doneAll = upcoming.filter(iv => {
      const ac = iv.arrangementsChecked || {};
      const ng = Interviews?.needsGuide?.(iv.round);
      return ac.interviewer && ac.room && (!ng || ac.guide);
    }).length;

    let html = `<div class="arr-list-wrap">
      <div class="arr-summary">
        <span>全 <b>${total}</b> 件</span>
        <span class="arr-summary-done">手配完了: <b>${doneAll}</b> 件</span>
        <span class="arr-summary-pend">未完了: <b>${total - doneAll}</b> 件</span>
      </div>
      <table class="arr-table">
        <thead>
          <tr>
            <th>日付</th><th>時刻</th><th>回次</th><th>候補者</th>
            <th>面接官 <span class="arr-th-hint">（✓で確認済み）</span></th>
            <th>会議室 <span class="arr-th-hint">（✓で確認済み）</span></th>
            <th>案内係 <span class="arr-th-hint">（✓で確認済み）</span></th>
          </tr>
        </thead>
        <tbody>`;

    if (upcoming.length === 0) {
      html += `<tr><td colspan="7" class="table-empty">この期間の面接はありません</td></tr>`;
    } else {
      upcoming.forEach(iv => {
        const ac     = iv.arrangementsChecked || {};
        const ng     = Interviews?.needsGuide?.(iv.round);
        const ivNames = (iv.interviewerIds || [])
          .map(id => ivMaster.find(x => x.id === id)?.name || '').filter(Boolean);
        const guideNames = (iv.guideIds || [])
          .map(id => hrStaffs.find(x => x.id === id)?.name || '').filter(Boolean);
        const candNames  = iv._candidateNames?.join('・') || '（空き）';
        const location   = iv.location || iv.onlineUrl || '';
        const allOk = ac.interviewer && ac.room && (!ng || ac.guide);

        const arrCell = (field, checked, names, emptyLabel) => `
          <td class="arr-info-cell ${checked ? 'arr-cell-ok' : ''}">
            <label class="arr-cell-label">
              <input type="checkbox" class="arr-chk" data-id="${iv.id}" data-field="${field}"
                ${checked ? 'checked' : ''}>
              <span class="arr-cell-names ${names.length ? '' : 'arr-cell-empty'}">
                ${names.length ? names.map(n => Utils.esc(n)).join('<br>') : Utils.esc(emptyLabel)}
              </span>
            </label>
          </td>`;

        html += `<tr class="${allOk ? 'arr-row-ok' : ''}" data-id="${iv.id}">
          <td>${Utils.formatDateShort(iv.date)}</td>
          <td style="white-space:nowrap">${Utils.esc(iv.startTime)}〜${Utils.esc(iv.endTime)}</td>
          <td><span class="badge badge-blue">${Utils.esc(iv.round || '')}</span></td>
          <td>${Utils.esc(candNames)}</td>
          ${arrCell('interviewer', ac.interviewer, ivNames, '（未設定）')}
          ${arrCell('room', ac.room, location ? [location] : [], '（未設定）')}
          <td class="arr-info-cell ${ng && ac.guide ? 'arr-cell-ok' : ''}">
            ${ng
              ? `<label class="arr-cell-label">
                   <input type="checkbox" class="arr-chk" data-id="${iv.id}" data-field="guide"
                     ${ac.guide ? 'checked' : ''}>
                   <span class="arr-cell-names ${guideNames.length ? '' : 'arr-cell-empty'}">
                     ${guideNames.length ? guideNames.map(n => Utils.esc(n)).join('<br>') : '（未設定）'}
                   </span>
                 </label>`
              : `<span class="arr-na">―</span>`}
          </td>
        </tr>`;
      });
    }

    html += `</tbody></table></div>`;
    container.innerHTML = html;

    container.querySelectorAll('.arr-chk').forEach(chk => {
      chk.addEventListener('change', async () => {
        const iv = interviews.find(x => x.id === Number(chk.dataset.id));
        if (iv && onToggleArrangement) {
          await onToggleArrangement(iv, chk.dataset.field);
        }
      });
    });
  }

  // ===== 重複ブロックの横並びレイアウト =====
  function layoutBlocks(dayIvs) {
    const sorted = [...dayIvs].sort((a, b) =>
      Utils.timeToMinutes(a.startTime) - Utils.timeToMinutes(b.startTime));
    const result = [];
    const cols   = [];

    sorted.forEach(iv => {
      const s = Utils.timeToMinutes(iv.startTime);
      const e = Utils.timeToMinutes(iv.endTime);
      let placed = false;
      for (let c = 0; c < cols.length; c++) {
        if (cols[c] <= s) { cols[c] = e; result.push({ iv, col: c }); placed = true; break; }
      }
      if (!placed) { cols.push(e); result.push({ iv, col: cols.length - 1 }); }
    });

    const total = cols.length || 1;
    return result.map(({ iv, col }) => ({
      iv,
      left:  (col / total) * 100,
      width: (1 / total) * 100,
    }));
  }

  // ===== ドラッグで面接枠作成 =====
  function attachDragCreate(container) {
    let dragging = false, startY = 0, startDate = null, preview = null, targetCol = null;

    container.querySelectorAll('.cal-week-col').forEach(col => {
      col.addEventListener('mousedown', e => {
        if (e.button !== 0 || e.target.closest('.interview-block')) return;
        dragging = true; startDate = col.dataset.date; targetCol = col;
        const rect = col.getBoundingClientRect();
        startY = e.clientY - rect.top;
        preview = document.createElement('div');
        preview.className = 'drag-preview';
        col.appendChild(preview);
        e.preventDefault();
      });
    });

    document.addEventListener('mousemove', e => {
      if (!dragging || !preview) return;
      const rect = targetCol.getBoundingClientRect();
      const curY = e.clientY - rect.top;
      preview.style.top    = `${Math.min(startY, curY)}px`;
      preview.style.height = `${Math.max(15, Math.abs(curY - startY))}px`;
    });

    document.addEventListener('mouseup', e => {
      if (!dragging) return;
      dragging = false;
      if (!preview) return;
      const rect   = targetCol.getBoundingClientRect();
      const curY   = e.clientY - rect.top;
      const topY   = Math.min(startY, curY);
      const botY   = Math.max(startY, curY);
      preview.remove(); preview = null;
      if (Math.abs(curY - startY) < 5) return;
      const startT = Utils.minutesToTime(CAL_START * 60 + snapMins(topY / PX_PER_MIN));
      const endT   = Utils.minutesToTime(CAL_START * 60 + Math.max(snapMins(topY / PX_PER_MIN) + 15, snapMins(botY / PX_PER_MIN)));
      onClickSlot && onClickSlot(startDate, startT, endT);
    });
  }

  // ===== ブロックドラッグ移動 =====
  function attachBlockDrag(container) {
    let dragging = null, clone = null, origRect = null, offsetY = 0;

    container.querySelectorAll('.interview-block').forEach(block => {
      block.addEventListener('mousedown', e => {
        if (e.target.classList.contains('block-resize-handle') || e.button !== 0) return;
        dragging = { iv: interviews.find(x => x.id === Number(block.dataset.id)), el: block };
        origRect = block.getBoundingClientRect();
        offsetY  = e.clientY - origRect.top;
        clone = block.cloneNode(true);
        clone.style.cssText += `;position:fixed;width:${origRect.width}px;left:${origRect.left}px;top:${origRect.top}px;opacity:.7;pointer-events:none;z-index:100;`;
        document.body.appendChild(clone);
        block.style.opacity = '.25';
        e.preventDefault(); e.stopPropagation();
      });
    });

    document.addEventListener('mousemove', e => {
      if (!dragging || !clone) return;
      clone.style.top  = `${e.clientY - offsetY}px`;
      clone.style.left = `${origRect.left}px`;
    });

    document.addEventListener('mouseup', e => {
      if (!dragging) return;
      clone?.remove(); clone = null;
      dragging.el.style.opacity = '';
      const col = document.elementFromPoint(e.clientX, e.clientY)?.closest('.cal-week-col');
      if (col && onMoveBlock) {
        const rect  = col.getBoundingClientRect();
        const relY  = e.clientY - rect.top - offsetY;
        const mins  = snapMins(relY / PX_PER_MIN);
        const start = Utils.minutesToTime(CAL_START * 60 + mins);
        const dur   = Utils.timeToMinutes(dragging.iv.endTime) - Utils.timeToMinutes(dragging.iv.startTime);
        const end   = Utils.minutesToTime(Utils.timeToMinutes(start) + dur);
        onMoveBlock(dragging.iv, col.dataset.date, start, end);
      }
      dragging = null;
    });
  }

  // ===== ブロックリサイズ =====
  function attachBlockResize(container) {
    let resizing = null, startY = 0, startEnd = 0;

    container.querySelectorAll('.block-resize-handle').forEach(handle => {
      handle.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        const iv = interviews.find(x => x.id === Number(handle.dataset.id));
        if (!iv) return;
        resizing = { iv, block: handle.parentElement };
        startY   = e.clientY;
        startEnd = Utils.timeToMinutes(iv.endTime);
        e.preventDefault(); e.stopPropagation();
      });
    });

    document.addEventListener('mousemove', e => {
      if (!resizing) return;
      const delta      = (e.clientY - startY) / PX_PER_MIN;
      const newEndMins = snapMins(startEnd + delta - CAL_START * 60) + CAL_START * 60;
      const startMins  = Utils.timeToMinutes(resizing.iv.startTime);
      if (newEndMins - startMins >= 15)
        resizing.block.style.height = `${(newEndMins - startMins) * PX_PER_MIN}px`;
    });

    document.addEventListener('mouseup', e => {
      if (!resizing) return;
      const delta      = (e.clientY - startY) / PX_PER_MIN;
      const newEndMins = snapMins(startEnd + delta - CAL_START * 60) + CAL_START * 60;
      const startMins  = Utils.timeToMinutes(resizing.iv.startTime);
      if (newEndMins - startMins >= 15)
        onResizeBlock && onResizeBlock(resizing.iv, Utils.minutesToTime(newEndMins));
      resizing = null;
    });
  }

  // ===== ユーティリティ =====
  function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
  function weekStart(d)  { const r = new Date(d); r.setDate(r.getDate() - r.getDay()); return r; }
  function snapMins(m)   { return Math.round(m / SNAP_MIN) * SNAP_MIN; }

  function ivLabel(iv) {
    const names = iv._candidateNames || (iv._candidateName ? [iv._candidateName] : []);
    if (!names.length) return '（空き）';
    return names.length === 1 ? names[0] : `${names[0]} 他${names.length - 1}名`;
  }

  function chipClass(iv) {
    return Utils.resultColorClass(iv).replace('block-', 'chip-');
  }

  return { init, setInterviews, setView, navigate, goToday, render };
})();
