const Dashboard = (() => {
  const STATUSES = [
    '書類選考中','1次面接待ち','1次面接済','2次面接待ち','2次面接済',
    '最終面接待ち','最終面接済','内定','辞退','不採用',
  ];
  const STATUS_COLOR = {
    '書類選考中':  '#9CA3AF',
    '1次面接待ち': '#60A5FA',
    '1次面接済':   '#3B82F6',
    '2次面接待ち': '#34D399',
    '2次面接済':   '#10B981',
    '最終面接待ち':'#A78BFA',
    '最終面接済':  '#8B5CF6',
    '内定':        '#16A34A',
    '辞退':        '#6B7280',
    '不採用':      '#EF4444',
  };

  function render() {
    const candidates  = Candidates.getAll();
    const interviews  = Interviews.getAll();
    const container   = document.getElementById('view-dashboard');
    if (!container) return;

    const today  = Utils.formatDate(new Date());
    const now    = new Date();
    const wStart = monday(now);
    const wEnd   = addDays(wStart, 6);
    const wsStr  = Utils.formatDate(wStart);
    const weStr  = Utils.formatDate(wEnd);
    const mStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;

    // ---- KPI集計 ----
    const total      = candidates.length;
    const active     = candidates.filter(c => !['内定','辞退','不採用'].includes(c.selectionStatus)).length;
    const offered    = candidates.filter(c => c.selectionStatus === '内定').length;
    const declined   = candidates.filter(c => ['辞退','不採用'].includes(c.selectionStatus)).length;
    const thisWeekIv = interviews.filter(iv => iv.date >= wsStr && iv.date <= weStr).length;
    const thisMonIv  = interviews.filter(iv => iv.date >= mStart && iv.date <= today).length;

    // ---- 選考状況分布 ----
    const statusMap = {};
    STATUSES.forEach(s => { statusMap[s] = 0; });
    candidates.forEach(c => { if (statusMap[c.selectionStatus] !== undefined) statusMap[c.selectionStatus]++; });
    const maxCount = Math.max(...Object.values(statusMap), 1);

    // ---- 採用種別 ----
    const newGrad  = candidates.filter(c => c.recruitType === '新卒').length;
    const career   = candidates.filter(c => c.recruitType === 'キャリア').length;
    const newPct   = total ? Math.round(newGrad / total * 100) : 0;
    const carPct   = total ? Math.round(career  / total * 100) : 0;

    // ---- 今週の面接 ----
    const weekIvs = interviews
      .filter(iv => iv.date >= wsStr && iv.date <= weStr)
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

    // ---- 大学別 TOP8 ----
    const univMap = {};
    candidates.forEach(c => {
      if (c.university) univMap[c.university] = (univMap[c.university] || 0) + 1;
    });
    const univTop = Object.entries(univMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const maxUniv = univTop[0]?.[1] || 1;

    // ---- 最近の登録（直近10件） ----
    const recent = [...candidates]
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 10);

    container.innerHTML = `
    <div class="db-scroll">
      <div class="db-wrap">

        <!-- KPIカード -->
        <div class="db-kpi-row">
          ${kpiCard('総候補者数', total, '', '#2563EB')}
          ${kpiCard('選考中', active, `総数の ${total ? Math.round(active/total*100) : 0}%`, '#0891B2')}
          ${kpiCard('内定', offered, `内定率 ${total ? Math.round(offered/total*100) : 0}%`, '#16A34A')}
          ${kpiCard('辞退・不採用', declined, '', '#DC2626')}
          ${kpiCard('今週の面接', thisWeekIv, '件', '#7C3AED')}
          ${kpiCard('今月の面接', thisMonIv, '件', '#D97706')}
        </div>

        <div class="db-main-row">

          <!-- 選考状況分布 -->
          <div class="db-card db-card-wide">
            <div class="db-card-title">選考状況別 候補者数</div>
            <div class="db-bar-list">
              ${STATUSES.map(s => {
                const cnt = statusMap[s];
                const pct = Math.round(cnt / maxCount * 100);
                return `<div class="db-bar-row">
                  <span class="db-bar-label">${s}</span>
                  <div class="db-bar-track">
                    <div class="db-bar-fill" style="width:${pct}%;background:${STATUS_COLOR[s]}"></div>
                  </div>
                  <span class="db-bar-count">${cnt}</span>
                </div>`;
              }).join('')}
            </div>
          </div>

          <!-- 採用種別 -->
          <div class="db-card">
            <div class="db-card-title">採用種別</div>
            <div class="db-donut-wrap">
              <div class="db-donut" style="--new:${newPct};--car:${carPct}">
                <div class="db-donut-center">
                  <span style="font-size:22px;font-weight:700;">${total}</span>
                  <span style="font-size:12px;color:var(--gray-500)">名</span>
                </div>
              </div>
              <div class="db-legend-list">
                <div class="db-legend-row"><span class="db-legend-dot" style="background:#3B82F6"></span>新卒 <b>${newGrad}</b>名 (${newPct}%)</div>
                <div class="db-legend-row"><span class="db-legend-dot" style="background:#F59E0B"></span>キャリア <b>${career}</b>名 (${carPct}%)</div>
              </div>
            </div>
          </div>

        </div>

        <div class="db-main-row">

          <!-- 今週の面接スケジュール -->
          <div class="db-card db-card-wide">
            <div class="db-card-title">今週の面接スケジュール
              <span style="font-size:12px;font-weight:400;color:var(--gray-500);margin-left:8px">
                ${Utils.formatDateShort(wsStr)} 〜 ${Utils.formatDateShort(weStr)}
              </span>
            </div>
            ${weekIvs.length === 0
              ? `<div class="db-empty">今週の面接はありません</div>`
              : `<table class="db-table">
                  <thead><tr><th>日付</th><th>時刻</th><th>回次</th><th>候補者</th><th>面接官</th><th>形式</th><th>結果</th></tr></thead>
                  <tbody>
                    ${weekIvs.map(iv => {
                      const ivrs = Masters.get('interviewers');
                      const ivNames = (iv.interviewerIds||[]).map(id => ivrs.find(x=>x.id===id)?.name||'').filter(Boolean).join('・');
                      const cnt = (iv.candidateIds||[]).length;
                      const max = Interviews.maxByRound(iv.round||'1次面接');
                      const resultCls = {合格:'badge-green',不合格:'badge-red',辞退:'badge-gray',保留:'badge-purple'}[iv.result]||'badge-gray';
                      return `<tr class="db-table-row" data-id="${iv.id}">
                        <td>${Utils.formatDateShort(iv.date)}</td>
                        <td>${Utils.esc(iv.startTime)}〜${Utils.esc(iv.endTime)}</td>
                        <td><span class="badge badge-blue">${Utils.esc(iv.round||'')}</span></td>
                        <td>${Utils.esc(iv._candidateNames?.join('・')||'（空き）')}
                          <span style="font-size:11px;color:var(--gray-400)">${cnt}/${max}</span></td>
                        <td>${Utils.esc(ivNames)}</td>
                        <td>${Utils.esc(iv.format||'')}</td>
                        <td><span class="badge ${resultCls}">${Utils.esc(iv.result||'')}</span></td>
                      </tr>`;
                    }).join('')}
                  </tbody>
                </table>`
            }
          </div>

          <!-- 大学別TOP8 -->
          <div class="db-card">
            <div class="db-card-title">大学別 候補者数 TOP8</div>
            <div class="db-bar-list">
              ${univTop.length === 0
                ? `<div class="db-empty">データなし</div>`
                : univTop.map(([name, cnt]) => {
                    const pct = Math.round(cnt / maxUniv * 100);
                    return `<div class="db-bar-row">
                      <span class="db-bar-label" style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${Utils.esc(name)}">${Utils.esc(name)}</span>
                      <div class="db-bar-track">
                        <div class="db-bar-fill" style="width:${pct}%;background:#6366F1"></div>
                      </div>
                      <span class="db-bar-count">${cnt}</span>
                    </div>`;
                  }).join('')
              }
            </div>
          </div>

        </div>

        <!-- 最近登録した候補者 -->
        <div class="db-card" style="margin-bottom:24px">
          <div class="db-card-title">最近登録した候補者</div>
          <table class="db-table">
            <thead><tr><th>氏名</th><th>採用種別</th><th>大学</th><th>職種</th><th>選考状況</th><th>担当者</th><th>登録日時</th></tr></thead>
            <tbody>
              ${recent.length === 0
                ? `<tr><td colspan="7" class="db-empty">候補者が登録されていません</td></tr>`
                : recent.map(c => {
                    const statusCls = {内定:'badge-green',辞退:'badge-gray',不採用:'badge-red'}[c.selectionStatus]||'badge-blue';
                    return `<tr class="db-table-row db-cand-row" data-id="${c.id}">
                      <td><b>${Utils.esc(c.name)}</b></td>
                      <td>${Utils.esc(c.recruitType||'')}</td>
                      <td>${Utils.esc(c.university||'')}</td>
                      <td>${Utils.esc(c.jobType||'')}</td>
                      <td><span class="badge ${statusCls}">${Utils.esc(c.selectionStatus||'')}</span></td>
                      <td>${Utils.esc(c.hrStaff||'')}</td>
                      <td style="font-size:12px;color:var(--gray-400)">${Utils.formatDateTime(c.createdAt)}</td>
                    </tr>`;
                  }).join('')
              }
            </tbody>
          </table>
        </div>

      </div>
    </div>`;

    // ダッシュボードのテーブル行クリックで編集モーダルへ
    container.querySelectorAll('.db-table-row[data-id]').forEach(row => {
      row.style.cursor = 'pointer';
    });
    container.querySelectorAll('.db-cand-row').forEach(row => {
      row.addEventListener('click', () => Candidates.openModal(Number(row.dataset.id)));
    });
  }

  function kpiCard(label, value, sub, color) {
    return `<div class="db-kpi-card">
      <div class="db-kpi-value" style="color:${color}">${value}</div>
      <div class="db-kpi-label">${label}</div>
      ${sub ? `<div class="db-kpi-sub">${sub}</div>` : ''}
    </div>`;
  }

  function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
  function monday(d) {
    const r = new Date(d);
    const day = r.getDay();
    r.setDate(r.getDate() - (day === 0 ? 6 : day - 1));
    return r;
  }

  return { render };
})();
