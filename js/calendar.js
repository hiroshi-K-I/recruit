const Calendar = (() => {
  const CAL_START = 7;   // 表示開始時刻(時)
  const CAL_END   = 22;  // 表示終了時刻(時)
  const PX_PER_MIN = 1;  // 1分あたりの高さ(px)
  const SNAP_MIN  = 15;  // スナップ単位(分)

  let currentView = 'month';
  let currentDate = new Date();
  let interviews  = [];
  let onClickSlot   = null;  // (date, startTime, endTime) => void
  let onClickBlock  = null;  // (interview) => void
  let onMoveBlock   = null;  // (interview, newDate, newStartTime) => void
  let onResizeBlock = null;  // (interview, newEndTime) => void

  // ===== 公開インターフェース =====
  function init(opts) {
    onClickSlot   = opts.onClickSlot;
    onClickBlock  = opts.onClickBlock;
    onMoveBlock   = opts.onMoveBlock;
    onResizeBlock = opts.onResizeBlock;
  }

  function setInterviews(data) {
    interviews = data;
  }

  function setView(view) {
    currentView = view;
    document.querySelectorAll('.cal-view-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.calview === view);
    });
    render();
  }

  function navigate(dir) {
    if (currentView === 'month') {
      currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + dir, 1);
    } else if (currentView === 'week') {
      currentDate = addDays(currentDate, dir * 7);
    } else {
      currentDate = addDays(currentDate, dir);
    }
    render();
  }

  function goToday() {
    currentDate = new Date();
    render();
  }

  function render() {
    const container = document.getElementById('calendar-container');
    if (!container) return;
    updateTitle();
    if (currentView === 'month') renderMonth(container);
    else if (currentView === 'week') renderWeekDay(container, 7);
    else renderWeekDay(container, 1);
  }

  function updateTitle() {
    const title = document.getElementById('cal-title');
    if (!title) return;
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth() + 1;
    if (currentView === 'month') {
      title.textContent = `${y}年${m}月`;
    } else if (currentView === 'week') {
      const wStart = weekStart(currentDate);
      const wEnd   = addDays(wStart, 6);
      title.textContent = `${y}年${m}月 第${Math.ceil(currentDate.getDate() / 7)}週`;
      if (wStart.getMonth() !== wEnd.getMonth()) {
        title.textContent = `${Utils.formatDate(wStart)} 〜 ${Utils.formatDate(wEnd)}`;
      }
    } else {
      title.textContent = Utils.formatDateJa(currentDate);
    }
  }

  // ===== 月表示 =====
  function renderMonth(container) {
    const year  = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay  = new Date(year, month + 1, 0);
    const today    = Utils.formatDate(new Date());

    // 月初の曜日から始まる6週分(42日)
    const startDate = addDays(firstDay, -firstDay.getDay());
    const days = [];
    for (let i = 0; i < 42; i++) days.push(addDays(startDate, i));

    const WEEKDAY_LABELS = ['日','月','火','水','木','金','土'];

    let html = `<div class="cal-month">
      <div class="cal-month-header">
        ${WEEKDAY_LABELS.map(d => `<div class="cal-month-header-cell">${d}</div>`).join('')}
      </div>
      <div class="cal-month-grid">`;

    days.forEach(d => {
      const ds      = Utils.formatDate(d);
      const isOther = d.getMonth() !== month;
      const isToday = ds === today;
      const dayIvs  = interviews.filter(iv => iv.date === ds);

      const chips = dayIvs.slice(0, 3).map(iv => {
        const cls = chipClass(iv);
        const label = ivLabel(iv);
        return `<div class="cell-event-chip ${cls}" data-id="${iv.id}" title="${Utils.esc(label)}">${Utils.esc(label)}</div>`;
      }).join('');
      const more = dayIvs.length > 3
        ? `<div class="cell-more">他 ${dayIvs.length - 3} 件</div>` : '';

      html += `<div class="cal-month-cell ${isOther ? 'other-month' : ''} ${isToday ? 'today' : ''}" data-date="${ds}">
        <div class="cell-day">${d.getDate()}</div>
        <div class="cell-events">${chips}${more}</div>
      </div>`;
    });

    html += `</div></div>`;
    container.innerHTML = html;

    // セルクリック → 面接枠作成
    container.querySelectorAll('.cal-month-cell').forEach(cell => {
      cell.addEventListener('click', (e) => {
        if (e.target.closest('.cell-event-chip')) return;
        onClickSlot && onClickSlot(cell.dataset.date, '10:00', '11:00');
      });
    });

    // チップクリック → 面接枠編集
    container.querySelectorAll('.cell-event-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        const iv = interviews.find(x => x.id === Number(chip.dataset.id));
        if (iv) onClickBlock && onClickBlock(iv);
      });
    });
  }

  // ===== 週/日表示 =====
  function renderWeekDay(container, days) {
    const startD = days === 7 ? weekStart(currentDate) : currentDate;
    const cols   = [];
    for (let i = 0; i < days; i++) cols.push(addDays(startD, i));
    const today  = Utils.formatDate(new Date());

    const totalMins  = (CAL_END - CAL_START) * 60;
    const totalHeight = totalMins * PX_PER_MIN;

    // ヘッダー
    let html = `<div class="cal-week-wrap">
      <div class="cal-week-header">
        <div class="cal-week-gutter-head"></div>`;
    cols.forEach(d => {
      const ds  = Utils.formatDate(d);
      const cls = ds === today ? 'today' : '';
      const WEEKDAY = ['日','月','火','水','木','金','土'][d.getDay()];
      html += `<div class="cal-week-day-head ${cls}">
        <span class="day-num">${d.getDate()}</span>
        <span>${WEEKDAY}</span>
      </div>`;
    });
    html += `</div>
      <div class="cal-week-body">
        <div class="cal-week-gutter" style="height:${totalHeight}px">`;

    // 時刻ラベル
    for (let h = CAL_START; h <= CAL_END; h++) {
      const top = (h - CAL_START) * 60 * PX_PER_MIN;
      html += `<div class="cal-week-gutter-label" style="top:${top}px">${h}:00</div>`;
    }
    html += `</div><div class="cal-week-days">`;

    // 日列
    cols.forEach(d => {
      const ds = Utils.formatDate(d);
      const dayIvs = interviews.filter(iv => iv.date === ds);
      html += `<div class="cal-week-col" data-date="${ds}" style="height:${totalHeight}px">`;

      // 時間線
      for (let h = CAL_START; h <= CAL_END; h++) {
        const top = (h - CAL_START) * 60 * PX_PER_MIN;
        html += `<div class="cal-hour-line" style="top:${top}px"></div>`;
        if (h < CAL_END) {
          html += `<div class="cal-hour-line half" style="top:${top + 30}px"></div>`;
        }
      }

      // 面接ブロック
      dayIvs.forEach(iv => {
        const startMins = Utils.timeToMinutes(iv.startTime) - CAL_START * 60;
        const endMins   = Utils.timeToMinutes(iv.endTime)   - CAL_START * 60;
        const top    = Math.max(0, startMins) * PX_PER_MIN;
        const height = Math.max(15, (endMins - startMins)) * PX_PER_MIN;
        const colorCls = Utils.resultColorClass(iv);
        const label = ivLabel(iv);

        html += `<div class="interview-block ${colorCls}" data-id="${iv.id}"
          style="top:${top}px; height:${height}px;"
          title="${Utils.esc(label)}">
          <div class="block-title">${Utils.esc(iv.startTime)}〜${Utils.esc(iv.endTime)}</div>
          <div class="block-sub">${Utils.esc(label)}</div>
          <div class="block-resize-handle" data-id="${iv.id}"></div>
        </div>`;
      });

      // 現在時刻ライン
      if (ds === today) {
        const now = new Date();
        const nowMins = now.getHours() * 60 + now.getMinutes() - CAL_START * 60;
        if (nowMins >= 0 && nowMins <= totalMins) {
          html += `<div class="cal-now-line" style="top:${nowMins * PX_PER_MIN}px"></div>`;
        }
      }

      html += `</div>`;
    });

    html += `</div></div></div>`;
    container.innerHTML = html;

    // セルクリック（空白部分）
    container.querySelectorAll('.cal-week-col').forEach(col => {
      col.addEventListener('click', (e) => {
        if (e.target.classList.contains('interview-block') ||
            e.target.closest('.interview-block')) return;
        const rect  = col.getBoundingClientRect();
        const relY  = e.clientY - rect.top + col.scrollTop;
        const mins  = Math.round(relY / PX_PER_MIN / SNAP_MIN) * SNAP_MIN;
        const start = Utils.minutesToTime(CAL_START * 60 + mins);
        const end   = Utils.minutesToTime(CAL_START * 60 + mins + 60);
        onClickSlot && onClickSlot(col.dataset.date, start, end);
      });
    });

    // ブロッククリック
    container.querySelectorAll('.interview-block').forEach(block => {
      block.addEventListener('click', (e) => {
        if (e.target.classList.contains('block-resize-handle')) return;
        e.stopPropagation();
        const iv = interviews.find(x => x.id === Number(block.dataset.id));
        if (iv) onClickBlock && onClickBlock(iv);
      });
    });

    // ブロックドラッグ移動
    attachBlockDrag(container);

    // ブロックリサイズ
    attachBlockResize(container);

    // ドラッグ選択で枠作成
    attachDragCreate(container);
  }

  // ===== ドラッグで面接枠作成 =====
  function attachDragCreate(container) {
    let dragging = false;
    let startY = 0;
    let startDate = null;
    let preview = null;
    let targetCol = null;

    container.querySelectorAll('.cal-week-col').forEach(col => {
      col.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (e.target.classList.contains('interview-block') ||
            e.target.closest('.interview-block')) return;
        dragging  = true;
        startDate = col.dataset.date;
        targetCol = col;
        const rect = col.getBoundingClientRect();
        startY = e.clientY - rect.top;
        preview = document.createElement('div');
        preview.className = 'drag-preview';
        col.appendChild(preview);
        e.preventDefault();
      });
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging || !preview) return;
      const rect = targetCol.getBoundingClientRect();
      const curY = e.clientY - rect.top;
      const top    = Math.min(startY, curY);
      const height = Math.abs(curY - startY);
      preview.style.top    = `${top}px`;
      preview.style.height = `${Math.max(15, height)}px`;
    });

    document.addEventListener('mouseup', (e) => {
      if (!dragging) return;
      dragging = false;
      if (preview) {
        const rect    = targetCol.getBoundingClientRect();
        const curY    = e.clientY - rect.top;
        const topY    = Math.min(startY, curY);
        const bottomY = Math.max(startY, curY);
        const startM  = snapMins(topY / PX_PER_MIN);
        const endM    = snapMins(bottomY / PX_PER_MIN);
        const startT  = Utils.minutesToTime(CAL_START * 60 + startM);
        const endT    = Utils.minutesToTime(CAL_START * 60 + Math.max(startM + 15, endM));
        preview.remove();
        preview = null;
        if (Math.abs(curY - startY) < 5) return; // クリックは除外
        onClickSlot && onClickSlot(startDate, startT, endT);
      }
    });
  }

  // ===== ブロックドラッグ移動 =====
  function attachBlockDrag(container) {
    let dragging = null;
    let clone    = null;
    let origRect = null;
    let offsetY  = 0;

    container.querySelectorAll('.interview-block').forEach(block => {
      block.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('block-resize-handle')) return;
        if (e.button !== 0) return;
        dragging = { iv: interviews.find(x => x.id === Number(block.dataset.id)), el: block };
        origRect = block.getBoundingClientRect();
        offsetY  = e.clientY - origRect.top;

        clone = block.cloneNode(true);
        clone.style.cssText += `;position:fixed;width:${origRect.width}px;left:${origRect.left}px;top:${origRect.top}px;opacity:.75;pointer-events:none;z-index:100;`;
        document.body.appendChild(clone);
        block.style.opacity = '.3';
        e.preventDefault();
        e.stopPropagation();
      });
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging || !clone) return;
      clone.style.top  = `${e.clientY - offsetY}px`;
      clone.style.left = `${origRect.left}px`;
    });

    document.addEventListener('mouseup', (e) => {
      if (!dragging) return;
      if (clone) { clone.remove(); clone = null; }
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
    let resizing = null;
    let startY   = 0;
    let startEnd = 0;

    container.querySelectorAll('.block-resize-handle').forEach(handle => {
      handle.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        const iv = interviews.find(x => x.id === Number(handle.dataset.id));
        if (!iv) return;
        resizing = { iv, block: handle.parentElement };
        startY   = e.clientY;
        startEnd = Utils.timeToMinutes(iv.endTime);
        e.preventDefault();
        e.stopPropagation();
      });
    });

    document.addEventListener('mousemove', (e) => {
      if (!resizing) return;
      const delta = (e.clientY - startY) / PX_PER_MIN;
      const newEndMins = snapMins(startEnd + delta - CAL_START * 60) + CAL_START * 60;
      const startMins  = Utils.timeToMinutes(resizing.iv.startTime);
      if (newEndMins - startMins < 15) return;
      const newHeight = (newEndMins - startMins) * PX_PER_MIN;
      resizing.block.style.height = `${newHeight}px`;
    });

    document.addEventListener('mouseup', (e) => {
      if (!resizing) return;
      const delta = (e.clientY - startY) / PX_PER_MIN;
      const newEndMins = snapMins(startEnd + delta - CAL_START * 60) + CAL_START * 60;
      const startMins  = Utils.timeToMinutes(resizing.iv.startTime);
      if (newEndMins - startMins >= 15) {
        const newEnd = Utils.minutesToTime(newEndMins);
        onResizeBlock && onResizeBlock(resizing.iv, newEnd);
      }
      resizing = null;
    });
  }

  // ===== ユーティリティ =====
  function addDays(d, n) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  }

  function weekStart(d) {
    const r = new Date(d);
    r.setDate(r.getDate() - r.getDay());
    return r;
  }

  function snapMins(mins) {
    return Math.round(mins / SNAP_MIN) * SNAP_MIN;
  }

  function ivLabel(iv) {
    return iv._candidateName || (iv.candidateId ? `候補者#${iv.candidateId}` : '（空き）');
  }

  function chipClass(iv) {
    const base = Utils.resultColorClass(iv);
    return base.replace('block-', 'chip-');
  }

  return {
    init, setInterviews, setView, navigate, goToday, render,
  };
})();
