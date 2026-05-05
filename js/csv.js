const CSV = (() => {
  // ===== 候補者エクスポート =====
  function exportCandidates(candidates) {
    const headers = ['id','氏名','採用種別','大学','文理','職種','希望勤務地','担当者','選考状況','志望度','申送り','特記事項','登録日時'];
    const rows = candidates.map(c => [
      c.id,
      c.name,
      c.recruitType || '',
      c.university || '',
      c.facultyType || '',
      c.jobType || '',
      (c.preferredLocations || []).join('・'),
      c.hrStaff || '',
      c.selectionStatus || '',
      c.motivation || '',
      c.notes || '',
      c.remarks || '',
      Utils.formatDateTime(c.createdAt),
    ].map(Utils.csvCell).join(','));

    const csv = [headers.map(Utils.csvCell).join(','), ...rows].join('\r\n');
    download(csv, `candidates_${timestamp()}.csv`);
  }

  // ===== 面接エクスポート =====
  function exportInterviews(interviews, interviewers) {
    const headers = ['id','面接日','開始時刻','終了時刻','候補者名','面接官','面接形式','面接場所','オンラインURL','面接結果','申送り','登録日時','更新日時'];
    const rows = interviews.map(iv => {
      const ivNames = (iv.interviewerIds || [])
        .map(id => interviewers.find(x => x.id === id)?.name || '')
        .filter(Boolean).join('・');
      return [
        iv.id,
        iv.date || '',
        iv.startTime || '',
        iv.endTime || '',
        iv._candidateName || '',
        ivNames,
        iv.format || '',
        iv.location || '',
        iv.onlineUrl || '',
        iv.result || '',
        iv.notes || '',
        Utils.formatDateTime(iv.createdAt),
        Utils.formatDateTime(iv.updatedAt),
      ].map(Utils.csvCell).join(',');
    });

    const csv = [headers.map(Utils.csvCell).join(','), ...rows].join('\r\n');
    download(csv, `interviews_${timestamp()}.csv`);
  }

  // ===== 候補者インポート =====
  async function importCandidates(text) {
    const { headers, rows } = Utils.parseCSV(text);
    if (!headers.length) throw new Error('ヘッダー行が見つかりません');

    const EXPECTED = ['氏名','採用種別','大学','文理','職種','希望勤務地','担当者','選考状況','志望度','申送り','特記事項'];
    const idx = {};
    EXPECTED.forEach(h => { idx[h] = headers.indexOf(h); });

    if (idx['氏名'] === -1) throw new Error('「氏名」列が見つかりません');

    let added = 0;
    let skipped = 0;

    for (const row of rows) {
      const name = (row[idx['氏名']] || '').trim();
      if (!name) { skipped++; continue; }

      const locsRaw = row[idx['希望勤務地']] || '';
      const locs    = locsRaw ? locsRaw.split(/[・、,]/).map(s => s.trim()).filter(Boolean) : [];
      const motiv   = Number(row[idx['志望度']]) || 0;
      const createdAt = Utils.nowISO();

      await DB.add(DB.STORES.CANDIDATES, {
        name,
        recruitType:       row[idx['採用種別']] || '',
        university:        row[idx['大学']]    || '',
        facultyType:       row[idx['文理']]    || '',
        jobType:           row[idx['職種']]    || '',
        preferredLocations: locs,
        hrStaff:           row[idx['担当者']]   || '',
        selectionStatus:   row[idx['選考状況']] || '',
        motivation:        Math.min(5, Math.max(0, motiv)),
        notes:             row[idx['申送り']]   || '',
        remarks:           row[idx['特記事項']] || '',
        createdAt,
      });
      added++;
    }

    return { added, skipped };
  }

  // ===== ファイル読み込み =====
  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = e => resolve(e.target.result);
      reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
      reader.readAsText(file, 'UTF-8');
    });
  }

  // ===== プレビュー =====
  function renderPreview(text, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    try {
      const { headers, rows } = Utils.parseCSV(text);
      const preview = rows.slice(0, 5);
      let html = `<p style="font-size:12px;color:var(--gray-500);margin-bottom:8px;">${rows.length}行検出（先頭5行を表示）</p>`;
      html += `<div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:12px;width:100%">`;
      html += `<thead><tr>${headers.map(h => `<th style="border:1px solid var(--gray-200);padding:4px 8px;background:var(--gray-50);white-space:nowrap">${Utils.esc(h)}</th>`).join('')}</tr></thead>`;
      html += `<tbody>`;
      preview.forEach(row => {
        html += `<tr>${row.map(c => `<td style="border:1px solid var(--gray-200);padding:4px 8px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${Utils.esc(c)}</td>`).join('')}</tr>`;
      });
      html += `</tbody></table></div>`;
      container.innerHTML = html;
    } catch {
      container.innerHTML = `<p style="color:var(--danger)">プレビューの表示に失敗しました</p>`;
    }
  }

  // ===== ダウンロード =====
  function download(content, filename) {
    const bom  = '﻿'; // UTF-8 BOM for Excel compatibility
    const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function timestamp() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
  }

  return { exportCandidates, exportInterviews, importCandidates, readFile, renderPreview };
})();
