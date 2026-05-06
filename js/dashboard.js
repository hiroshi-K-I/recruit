const Dashboard = (() => {
  const STATUSES = [
    '書類選考中','1次面接待ち','1次面接済','2次面接待ち','2次面接済',
    '役員面接待ち','役員面接済',
    '内定','内定承諾','辞退','不採用',
  ];
  const STATUS_COLOR = {
    '書類選考中':  '#9CA3AF',
    '1次面接待ち': '#60A5FA',
    '1次面接済':   '#3B82F6',
    '2次面接待ち': '#34D399',
    '2次面接済':   '#10B981',
    '役員面接待ち':'#FB923C',
    '役員面接済':  '#F97316',
    '内定':        '#16A34A',
    '内定承諾':    '#15803D',
    '辞退':        '#6B7280',
    '不採用':      '#EF4444',
  };

  // シミュレータ状態（再描画をまたいで保持）
  const sim = { initial: 100, r1: 60, r2: 70, re: 75, accept: 80 };

  function render() {
    const candidates = Candidates.getAll();
    const interviews = Interviews.getAll();
    const container  = document.getElementById('view-dashboard');
    if (!container) return;

    const today  = Utils.formatDate(new Date());
    const now    = new Date();
    const wStart = monday(now);
    const wEnd   = addDays(wStart, 6);
    const wsStr  = Utils.formatDate(wStart);
    const weStr  = Utils.formatDate(wEnd);
    const mStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;

    // ---- KPI集計 ----
    const total    = candidates.length;
    const active   = candidates.filter(c => !['内定','内定承諾','辞退','不採用'].includes(c.selectionStatus)).length;
    const offered  = candidates.filter(c => c.selectionStatus === '内定').length;
    const accepted = candidates.filter(c => c.selectionStatus === '内定承諾').length;
    const declined = candidates.filter(c => ['辞退','不採用'].includes(c.selectionStatus)).length;
    const thisWeekIv = interviews.filter(iv => iv.date >= wsStr && iv.date <= weStr).length;
    const thisMonIv  = interviews.filter(iv => iv.date >= mStart && iv.date <= today).length;

    // ---- 選考状況分布 ----
    const statusMap = {};
    STATUSES.forEach(s => { statusMap[s] = 0; });
    candidates.forEach(c => { if (statusMap[c.selectionStatus] !== undefined) statusMap[c.selectionStatus]++; });
    const maxCount = Math.max(...Object.values(statusMap), 1);

    // ---- 採用種別 ----
    const newGrad = candidates.filter(c => c.recruitType === '新卒').length;
    const career  = candidates.filter(c => c.recruitType === 'キャリア').length;
    const newPct  = total ? Math.round(newGrad / total * 100) : 0;
    const carPct  = total ? Math.round(career  / total * 100) : 0;

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

    // ---- 回次別合格率 ----
    const passRoundDefs = ['1次面接','2次面接','役員面接'];
    const passRates = passRoundDefs.map(round => {
      const roundIvs = interviews.filter(iv => iv.round === round && iv.result && iv.result !== '未実施');
      const tot    = roundIvs.length;
      const passed = roundIvs.filter(iv => iv.result === '合格').length;
      const rate   = tot > 0 ? Math.round(passed / tot * 100) : null;
      return { round, tot, passed, rate };
    });

    container.innerHTML = `
    <div class="db-scroll">
      <div class="db-wrap">

        <!-- KPIカード -->
        <div class="db-kpi-row">
          ${kpiCard('総候補者数', total, '', '#2563EB')}
          ${kpiCard('選考中', active, `総数の ${total ? Math.round(active/total*100) : 0}%`, '#0891B2')}
          ${kpiCard('内定', offered, `内定率 ${total ? Math.round(offered/total*100) : 0}%`, '#16A34A')}
          ${kpiCard('内定承諾', accepted, `${offered}名が回答待ち`, '#15803D')}
          ${kpiCard('辞退・不採用', declined, '', '#DC2626')}
          ${kpiCard('今週の面接', thisWeekIv, `今月 ${thisMonIv}件`, '#7C3AED')}
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
                      return `<tr class="db-table-row db-iv-row" data-id="${iv.id}">
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

        <!-- 面接回次別合格率 -->
        <div class="db-card">
          <div class="db-card-title">面接回次別 合格率（実績）</div>
          <div class="pass-rate-grid">
            ${passRates.map(pr => {
              const pct = pr.rate ?? 0;
              const color = { '1次面接':'#3B82F6','2次面接':'#10B981','役員面接':'#F97316' }[pr.round] || '#6366F1';
              return `<div class="pass-rate-item">
                <div class="pass-rate-label">${pr.round}</div>
                <div class="pass-rate-bar-wrap">
                  <div class="pass-rate-bar" style="height:${pct}%;background:${color}"></div>
                </div>
                <div class="pass-rate-pct" style="color:${color}">${pr.rate !== null ? pr.rate + '%' : '―'}</div>
                <div class="pass-rate-count">${pr.rate !== null ? `${pr.passed}/${pr.tot}件` : 'データなし'}</div>
              </div>`;
            }).join('')}
          </div>
        </div>

        <!-- 採用予測シミュレーター -->
        <div class="db-card sim-card">
          <div class="db-card-title">採用予測シミュレーター
            <span style="font-size:12px;font-weight:400;color:var(--gray-500);margin-left:8px">各ステージの通過率を調整して内定承諾者数を予測</span>
          </div>
          <div class="sim-layout">
            <div class="sim-inputs">
              <div class="sim-row">
                <label class="sim-label">書類通過者数</label>
                <input type="number" id="sim-initial" class="sim-num-input form-control" value="${sim.initial}" min="1" max="9999">
                <span class="sim-unit">名</span>
              </div>
              ${[
                {id:'sim-r1', label:'1次面接 通過率', key:'r1', act: passRates[0].rate},
                {id:'sim-r2', label:'2次面接 通過率', key:'r2', act: passRates[1].rate},
                {id:'sim-re', label:'役員面接 通過率', key:'re', act: passRates[2].rate},
                {id:'sim-ac', label:'内定承諾率',      key:'accept', act: null},
              ].map(row => `
                <div class="sim-row">
                  <label class="sim-label">${row.label}</label>
                  <input type="range" id="${row.id}" class="sim-slider" min="0" max="100" value="${sim[row.key]}">
                  <span id="${row.id}-val" class="sim-pct">${sim[row.key]}%</span>
                  ${row.act !== null ? `<span class="sim-actual">(実績: ${row.act !== null ? row.act + '%' : '―'})</span>` : ''}
                </div>`).join('')}
            </div>
            <div class="sim-funnel" id="sim-funnel"></div>
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
                    const statusCls = {内定:'badge-green',内定承諾:'badge-green',辞退:'badge-gray',不採用:'badge-red'}[c.selectionStatus]||'badge-blue';
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

    container.querySelectorAll('.db-cand-row').forEach(row => {
      row.addEventListener('click', () => Candidates.openModal(Number(row.dataset.id)));
    });
    container.querySelectorAll('.db-iv-row').forEach(row => {
      row.addEventListener('click', () => Interviews.openModal(Number(row.dataset.id)));
    });

    attachSimulator();
  }

  function updateSimFunnel() {
    const n  = sim.initial;
    const r1 = sim.r1 / 100;
    const r2 = sim.r2 / 100;
    const re = sim.re / 100;
    const ac = sim.accept / 100;

    const n1 = Math.round(n  * r1);
    const n2 = Math.round(n1 * r2);
    const ne = Math.round(n2 * re);
    const na = Math.round(ne * ac);

    const steps = [
      { label: '書類通過',     count: n,  color: '#6366F1' },
      { label: '1次面接 通過', count: n1, color: '#3B82F6' },
      { label: '2次面接 通過', count: n2, color: '#0891B2' },
      { label: '役員面接 通過',count: ne, color: '#10B981' },
      { label: '内定承諾',     count: na, color: '#15803D' },
    ];

    const funnel = document.getElementById('sim-funnel');
    if (!funnel) return;

    funnel.innerHTML = steps.map((step, i) => {
      const pct = n > 0 ? Math.round(step.count / n * 100) : 0;
      const w   = 100 - i * 12;
      return `<div class="sim-funnel-step">
        <div class="sim-funnel-bar-wrap">
          <div class="sim-funnel-bar" style="width:${w}%;background:${step.color}">
            <span class="sim-funnel-count">${step.count}名</span>
          </div>
        </div>
        <div class="sim-funnel-label">${step.label} <span class="sim-funnel-pct">${pct}%</span></div>
      </div>`;
    }).join('');
  }

  function attachSimulator() {
    const numInput = document.getElementById('sim-initial');
    if (numInput) {
      numInput.addEventListener('input', () => {
        sim.initial = Math.max(1, parseInt(numInput.value) || 1);
        updateSimFunnel();
      });
    }

    [
      ['sim-r1', 'r1'],
      ['sim-r2', 'r2'],
      ['sim-re', 're'],
      ['sim-ac', 'accept'],
    ].forEach(([id, key]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        sim[key] = parseInt(el.value);
        const valEl = document.getElementById(`${id}-val`);
        if (valEl) valEl.textContent = sim[key] + '%';
        updateSimFunnel();
      });
    });

    updateSimFunnel();
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
    const r   = new Date(d);
    const day = r.getDay();
    r.setDate(r.getDate() - (day === 0 ? 6 : day - 1));
    return r;
  }

  return { render };
})();
