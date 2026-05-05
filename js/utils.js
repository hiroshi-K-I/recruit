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

  return {
    timeOptions, timeToMinutes, minutesToTime,
    parseDate, formatDate, formatDateJa, formatDateShort, formatDateTime, nowISO,
    fillTimeSelect, confirm, esc, resultColorClass, motivationLabel,
    csvCell, parseCSVLine, parseCSV, toast,
  };
})();
