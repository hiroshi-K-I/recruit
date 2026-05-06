const Utils = (() => {
  // 15分刻みの時刻オプション（例: "08:00", "08:15", ...）
  function timeOptions(startHour = 7, endHour = 22) {
    const opts = [];
    for (let h = startHour; h <= endHour; h++) {
      for (let m = 0; m < 60; m += 15) {
        if (h === endHour && m > 0) break;
        opts.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      }
    }
    return opts;
  }

  // "HH:MM" → 分数
  function timeToMinutes(t) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }

  // 分数 → "HH:MM"
  function minutesToTime(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // "YYYY-MM-DD" → Date
  function parseDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  // Date → "YYYY-MM-DD"
  function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Date → "YYYY年M月D日 (曜)"
  const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
  function formatDateJa(date) {
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 (${WEEKDAYS[date.getDay()]})`;
  }

  // "YYYY-MM-DD" → "M月D日 (曜)"
  function formatDateShort(str) {
    const d = parseDate(str);
    return `${d.getMonth() + 1}月${d.getDate()}日 (${WEEKDAYS[d.getDay()]})`;
  }

  // ISO8601文字列 → "YYYY/MM/DD HH:MM"
  function formatDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  // 現在のISO8601文字列
  function nowISO() {
    return new Date().toISOString();
  }

  // <select>要素に時刻オプションを注入
  function fillTimeSelect(selectEl, selectedVal, startHour, endHour) {
    selectEl.innerHTML = '';
    timeOptions(startHour, endHour).forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      if (t === selectedVal) opt.selected = true;
      selectEl.appendChild(opt);
    });
  }

  // 汎用確認ダイアログ
  function confirm(message) {
    return window.confirm(message);
  }

  // テキストをHTMLエスケープ
  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // 面接結果 → カレンダーブロック色クラス
  function resultColorClass(interview) {
    if (!interview.candidateId) return 'block-empty';
    switch (interview.result) {
      case '合格':  return 'block-pass';
      case '不合格': return 'block-fail';
      case '辞退':  return 'block-cancel';
      case '保留':  return 'block-hold';
      default:      return 'block-assigned';
    }
  }

  // 志望度ラベル
  function motivationLabel(n) {
    return '★'.repeat(n || 0) + '☆'.repeat(5 - (n || 0));
  }

  // CSVの1セルをエスケープ
  function csvCell(val) {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  // CSV行をパース (ダブルクォート対応)
  function parseCSVLine(line) {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { cur += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === ',') { result.push(cur); cur = ''; }
        else { cur += ch; }
      }
    }
    result.push(cur);
    return result;
  }

  // CSVテキスト全体をパース → 行配列（ヘッダー除く）
  function parseCSV(text) {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const rows = lines.map(parseCSVLine);
    if (rows.length < 2) return { headers: [], rows: [] };
    return { headers: rows[0], rows: rows.slice(1).filter(r => r.some(c => c.trim())) };
  }

  // トースト通知
  function toast(message, type = 'success') {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('toast-show'));
    setTimeout(() => {
      el.classList.remove('toast-show');
      setTimeout(() => el.remove(), 300);
    }, 2500);
  }

  // タイムピッカー（クロック型グリッドUI、キーボード入力対応）
  // inputEl: text input, initialValue: "HH:MM", onChange(val): callback
  function buildTimePicker(inputEl, initialValue, onChange, opts = {}) {
    const startH = opts.startHour ?? 9;
    const endH   = opts.endHour   ?? 16;

    const wrap = document.createElement('div');
    wrap.className = 'time-picker-wrap';
    inputEl.parentNode.insertBefore(wrap, inputEl);
    wrap.appendChild(inputEl);
    inputEl.value = initialValue;

    let sh = parseInt(initialValue.split(':')[0], 10);
    let sm = parseInt(initialValue.split(':')[1], 10);

    const panel = document.createElement('div');
    panel.className = 'time-picker-panel';
    panel.style.display = 'none';
    wrap.appendChild(panel);

    function pad(n) { return String(n).padStart(2, '0'); }
    function fmt()  { return `${pad(sh)}:${pad(sm)}`; }

    // "9", "9:30", "930", "1030", "10:30" などを [h, m] に変換
    function parseTimeStr(str) {
      const s = String(str || '').trim().replace(/[^0-9:]/g, '');
      if (!s) return null;
      let h, m;
      if (s.includes(':')) {
        const parts = s.split(':');
        h = parseInt(parts[0], 10);
        m = parseInt(parts[1] || '0', 10);
      } else if (s.length <= 2) {
        h = parseInt(s, 10); m = 0;
      } else if (s.length === 3) {
        h = parseInt(s[0], 10); m = parseInt(s.slice(1), 10);
      } else {
        h = parseInt(s.slice(0, 2), 10); m = parseInt(s.slice(2, 4), 10);
      }
      if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
      return [h, m];
    }

    function draw() {
      const hours = [];
      for (let h = startH; h <= endH; h++) hours.push(h);
      panel.innerHTML = `
        <div class="tp-current">${fmt()}</div>
        <div class="tp-hours">${
          hours.map(h =>
            `<button class="tp-btn${h === sh ? ' h-sel' : ''}" data-h="${h}">${h}時</button>`
          ).join('')
        }</div>
        <hr class="tp-divider">
        <div class="tp-mins">${
          [0, 15, 30, 45].map(m =>
            `<button class="tp-btn${m === sm ? ' m-sel' : ''}" data-m="${m}">:${pad(m)}</button>`
          ).join('')
        }</div>`;

      panel.querySelectorAll('[data-h]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          sh = +btn.dataset.h;
          draw();
        });
      });

      panel.querySelectorAll('[data-m]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          sm = +btn.dataset.m;
          const val = fmt();
          inputEl.value = val;
          panel.style.display = 'none';
          draw();
          onChange && onChange(val);
        });
      });
    }

    draw();

    // パネルクリック時にinputのfocusを奪わない
    panel.addEventListener('mousedown', e => e.preventDefault());

    // クリックでパネル開閉
    inputEl.addEventListener('click', e => {
      e.stopPropagation();
      const parsed = parseTimeStr(inputEl.value);
      if (parsed) { sh = parsed[0]; sm = parsed[1]; }
      draw();
      const isOpen = panel.style.display !== 'none';
      document.querySelectorAll('.time-picker-panel').forEach(p => { p.style.display = 'none'; });
      panel.style.display = isOpen ? 'none' : 'block';
    });

    // キーボード入力中にピッカーパネルをリアルタイム更新
    inputEl.addEventListener('input', () => {
      const parsed = parseTimeStr(inputEl.value);
      if (parsed) { sh = parsed[0]; sm = parsed[1]; draw(); }
    });

    // フォーカスを外れたとき: 入力値を正規化してHH:MM形式に統一
    inputEl.addEventListener('blur', () => {
      setTimeout(() => {
        if (!wrap.contains(document.activeElement)) panel.style.display = 'none';
        const parsed = parseTimeStr(inputEl.value);
        if (parsed) {
          sh = parsed[0];
          // 最近傍の15分刻みにスナップ
          sm = [0, 15, 30, 45].reduce((p, c) => Math.abs(c - parsed[1]) < Math.abs(p - parsed[1]) ? c : p);
          const val = fmt();
          if (inputEl.value !== val) {
            inputEl.value = val;
            draw();
            onChange && onChange(val);
          }
        } else if (inputEl.value !== fmt()) {
          inputEl.value = fmt(); // 無効な入力はリセット
        }
      }, 150);
    });

    document.addEventListener('mousedown', e => {
      if (!wrap.contains(e.target)) panel.style.display = 'none';
    });

    return {
      getValue: () => inputEl.value,
      setValue: v => {
        inputEl.value = v;
        sh = parseInt(v.split(':')[0], 10);
        sm = parseInt(v.split(':')[1], 10);
        draw();
      },
    };
  }

  return {
    timeOptions, timeToMinutes, minutesToTime,
    parseDate, formatDate, formatDateJa, formatDateShort, formatDateTime, nowISO,
    fillTimeSelect, buildTimePicker, confirm, esc, resultColorClass, motivationLabel,
    csvCell, parseCSVLine, parseCSV, toast,
  };
})();
