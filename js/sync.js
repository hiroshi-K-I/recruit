const Sync = (() => {
  const APP_VERSION = '1.1';

  // ===== レコードにバージョンスタンプを押す =====
  function stamp(data) {
    const user = Settings.getUsername() || '不明';
    return { ...data, _v: (data._v || 0) + 1, _by: user, _at: Utils.nowISO() };
  }

  // ===== JSONエクスポート =====
  async function exportJSON() {
    const now = Utils.nowISO();
    const payload = {
      meta: {
        exportedAt:  now,
        exportedBy:  Settings.getUsername() || '不明',
        appVersion:  APP_VERSION,
      },
      candidates: await DB.getAll(DB.STORES.CANDIDATES),
      interviews:  await DB.getAll(DB.STORES.INTERVIEWS),
      masters: {
        interviewers: await DB.getAll(DB.STORES.INTERVIEWERS),
        universities: await DB.getAll(DB.STORES.UNIVERSITIES),
        jobTypes:     await DB.getAll(DB.STORES.JOB_TYPES),
        locations:    await DB.getAll(DB.STORES.LOCATIONS),
        hrStaff:      await DB.getAll(DB.STORES.HR_STAFF),
        rooms:        await DB.getAll(DB.STORES.ROOMS),
      },
    };

    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const ts   = now.replace(/[:.TZ]/g, '').slice(0, 14);
    a.href     = url;
    a.download = `iv_sync_${Settings.getUsername() || 'export'}_${ts}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    Settings.setLastExportAt(now);
    Utils.toast('同期用JSONをエクスポートしました');
  }

  // ===== インポートファイル読み込み =====
  function readJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = e => {
        try { resolve(JSON.parse(e.target.result)); }
        catch { reject(new Error('JSONの解析に失敗しました')); }
      };
      reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
      reader.readAsText(file, 'UTF-8');
    });
  }

  // ===== インポート分析（マージ計画を作成） =====
  async function analyze(payload) {
    if (!payload?.meta || !payload?.candidates) throw new Error('形式が不正なファイルです');

    const localCands = await DB.getAll(DB.STORES.CANDIDATES);
    const localIvs   = await DB.getAll(DB.STORES.INTERVIEWS);

    const plan = {
      meta:      payload.meta,
      conflicts: [],
      autoAdd:   { candidates: [], interviews: [] },
      autoUpdate:{ candidates: [], interviews: [] },
      autoSkip:  { candidates: 0,  interviews: 0  },
      masters:   payload.masters || {},
    };

    // 候補者の分析
    for (const imp of (payload.candidates || [])) {
      const local = localCands.find(x => x.id === imp.id);
      classifyRecord(imp, local, plan, 'candidates');
    }

    // 面接枠の分析
    for (const imp of (payload.interviews || [])) {
      const local = localIvs.find(x => x.id === imp.id);
      classifyRecord(imp, local, plan, 'interviews');
    }

    return plan;
  }

  function classifyRecord(imp, local, plan, type) {
    if (!local) {
      plan.autoAdd[type].push(imp);
      return;
    }
    const iv = imp._v || 0;
    const lv = local._v || 0;

    if (iv > lv) {
      plan.autoUpdate[type].push(imp);
    } else if (iv < lv) {
      plan.autoSkip[type]++;
    } else {
      // 同バージョン：内容比較
      const impClean   = stripMeta(imp);
      const localClean = stripMeta(local);
      if (JSON.stringify(impClean) === JSON.stringify(localClean)) {
        plan.autoSkip[type]++;
      } else {
        // 競合：変更フィールドを特定
        const changed = Object.keys(impClean).filter(k =>
          JSON.stringify(impClean[k]) !== JSON.stringify(localClean[k])
        );
        plan.conflicts.push({ type, id: imp.id, local, imported: imp, changedFields: changed });
      }
    }
  }

  // _v/_by/_at を除いた比較用オブジェクト
  function stripMeta(obj) {
    const { _v, _by, _at, _candidateName, _candidateNames, ...rest } = obj;
    return rest;
  }

  // ===== マージ実行 =====
  async function executeMerge(plan, resolutions) {
    const storeMap = {
      candidates: DB.STORES.CANDIDATES,
      interviews:  DB.STORES.INTERVIEWS,
    };
    const masterStoreMap = {
      interviewers: DB.STORES.INTERVIEWERS,
      universities: DB.STORES.UNIVERSITIES,
      jobTypes:     DB.STORES.JOB_TYPES,
      locations:    DB.STORES.LOCATIONS,
      hrStaff:      DB.STORES.HR_STAFF,
      rooms:        DB.STORES.ROOMS,
    };

    let added = 0, updated = 0, conflictResolved = 0;

    for (const type of ['candidates', 'interviews']) {
      const store = storeMap[type];
      for (const rec of plan.autoAdd[type]) {
        await DB.add(store, rec); added++;
      }
      for (const rec of plan.autoUpdate[type]) {
        await DB.put(store, rec); updated++;
      }
    }

    // 競合解決
    for (const conflict of plan.conflicts) {
      const choice = resolutions[`${conflict.type}_${conflict.id}`];
      if (choice === 'import') {
        await DB.put(storeMap[conflict.type], conflict.imported);
        conflictResolved++;
      }
      // 'local' は何もしない
    }

    // マスタ同期（IDが存在しなければ追加、バージョンが新しければ上書き）
    let mastersAdded = 0, mastersUpdated = 0;
    for (const [key, store] of Object.entries(masterStoreMap)) {
      const impItems   = plan.masters[key] || [];
      const localItems = await DB.getAll(store);
      for (const imp of impItems) {
        const local = localItems.find(x => x.id === imp.id);
        if (!local) { await DB.add(store, imp); mastersAdded++; }
        else if ((imp._v || 0) > (local._v || 0)) { await DB.put(store, imp); mastersUpdated++; }
      }
    }

    return { added, updated, conflictResolved, mastersAdded, mastersUpdated };
  }

  // ===== インポートモーダル UI =====
  let currentPlan = null;

  async function openImportModal() {
    document.getElementById('sync-file-input').value = '';
    document.getElementById('sync-step-1').style.display = '';
    document.getElementById('sync-step-2').style.display = 'none';
    document.getElementById('sync-step-3').style.display = 'none';
    document.getElementById('btn-sync-execute').style.display = 'none';
    currentPlan = null;
    openBackdrop('modal-sync-import');
  }

  async function onFileSelected(file) {
    if (!file) return;
    const step2 = document.getElementById('sync-step-2');
    step2.innerHTML = '<div style="color:var(--gray-400);padding:16px">分析中...</div>';
    step2.style.display = '';

    try {
      const payload = await readJSON(file);
      currentPlan   = await analyze(payload);
      renderAnalysis(currentPlan);
    } catch (err) {
      step2.innerHTML = `<div style="color:var(--danger);padding:8px">${Utils.esc(err.message)}</div>`;
    }
  }

  function renderAnalysis(plan) {
    const step2 = document.getElementById('sync-step-2');
    const step3 = document.getElementById('sync-step-3');
    const execBtn = document.getElementById('btn-sync-execute');

    const addC  = plan.autoAdd.candidates.length;
    const addI  = plan.autoAdd.interviews.length;
    const updC  = plan.autoUpdate.candidates.length;
    const updI  = plan.autoUpdate.interviews.length;
    const skipC = plan.autoSkip.candidates;
    const skipI = plan.autoSkip.interviews;
    const cCount = plan.conflicts.length;

    step2.innerHTML = `
      <div class="sync-meta">
        <b>エクスポート元:</b> ${Utils.esc(plan.meta.exportedBy)} &nbsp;
        <b>日時:</b> ${Utils.formatDateTime(plan.meta.exportedAt)}
      </div>
      <table class="sync-summary-table">
        <thead><tr><th></th><th>候補者</th><th>面接枠</th></tr></thead>
        <tbody>
          <tr><td>✅ 新規追加</td><td>${addC}</td><td>${addI}</td></tr>
          <tr><td>🔄 自動更新（インポートが新しい）</td><td>${updC}</td><td>${updI}</td></tr>
          <tr><td>⏭ スキップ（ローカルが新しい）</td><td>${skipC}</td><td>${skipI}</td></tr>
          <tr class="${cCount > 0 ? 'sync-row-conflict' : ''}"><td>⚠️ 競合</td><td colspan="2">${cCount} 件</td></tr>
        </tbody>
      </table>`;

    if (cCount > 0) {
      step3.style.display = '';
      renderConflicts(plan.conflicts);
    } else {
      step3.style.display = 'none';
    }

    execBtn.style.display = '';
  }

  function renderConflicts(conflicts) {
    const step3 = document.getElementById('sync-step-3');

    const FIELD_LABELS = {
      name: '氏名', recruitType: '採用種別', university: '大学', facultyType: '文理',
      jobType: '職種', hrStaff: '担当者', selectionStatus: '選考状況',
      motivation: '志望度', notes: '申送り', remarks: '特記事項',
      date: '面接日', startTime: '開始', endTime: '終了', round: '回次',
      format: '形式', location: '場所', result: '結果',
    };

    const cards = conflicts.map(c => {
      const label = c.type === 'candidates'
        ? (c.local.name || `ID:${c.id}`)
        : `${c.local.date} ${c.local.startTime}〜${c.local.endTime}`;
      const typeLabel = c.type === 'candidates' ? '候補者' : '面接枠';
      const key = `${c.type}_${c.id}`;

      const rows = c.changedFields.map(f => {
        const lv = Array.isArray(c.local[f]) ? c.local[f].join('・') : (c.local[f] ?? '');
        const iv = Array.isArray(c.imported[f]) ? c.imported[f].join('・') : (c.imported[f] ?? '');
        return `<tr>
          <td class="conflict-field">${Utils.esc(FIELD_LABELS[f] || f)}</td>
          <td class="conflict-local">${Utils.esc(String(lv))}</td>
          <td class="conflict-import">${Utils.esc(String(iv))}</td>
        </tr>`;
      }).join('');

      return `<div class="conflict-card">
        <div class="conflict-header">
          <span class="badge badge-yellow">${typeLabel}</span>
          <b>${Utils.esc(label)}</b>
          <span style="font-size:11px;color:var(--gray-400);margin-left:8px">
            ローカル: v${c.local._v||0} (${Utils.esc(c.local._by||'?')})
            &nbsp;/&nbsp;
            インポート: v${c.imported._v||0} (${Utils.esc(c.imported._by||'?')})
          </span>
        </div>
        <table class="conflict-table">
          <thead><tr><th>項目</th><th>🖥 ローカル</th><th>📥 インポート</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="conflict-choice">
          <label><input type="radio" name="${key}" value="local" checked> ローカルを使用</label>
          <label><input type="radio" name="${key}" value="import"> インポートを使用</label>
        </div>
      </div>`;
    }).join('');

    step3.innerHTML = `
      <div class="sync-section-title">⚠️ 競合の解決（${conflicts.length}件）</div>
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <button class="btn btn-secondary btn-sm" id="btn-all-local">すべてローカルを使用</button>
        <button class="btn btn-secondary btn-sm" id="btn-all-import">すべてインポートを使用</button>
      </div>
      <div class="conflict-list">${cards}</div>`;

    document.getElementById('btn-all-local')?.addEventListener('click', () => {
      document.querySelectorAll('.conflict-choice input[value="local"]').forEach(r => r.checked = true);
    });
    document.getElementById('btn-all-import')?.addEventListener('click', () => {
      document.querySelectorAll('.conflict-choice input[value="import"]').forEach(r => r.checked = true);
    });
  }

  async function executeFromModal() {
    if (!currentPlan) return;

    // 競合解決の選択を収集
    const resolutions = {};
    if (currentPlan.conflicts.length > 0) {
      currentPlan.conflicts.forEach(c => {
        const key    = `${c.type}_${c.id}`;
        const chosen = document.querySelector(`input[name="${key}"]:checked`)?.value || 'local';
        resolutions[key] = chosen;
      });
    }

    try {
      const result = await executeMerge(currentPlan, resolutions);
      closeBackdrop('modal-sync-import');
      await Candidates.load();
      await Interviews.load();
      await Masters.loadAll();
      Dashboard.render();
      Utils.toast(
        `マージ完了: 追加${result.added}件・更新${result.updated}件` +
        (result.conflictResolved ? `・競合解決${result.conflictResolved}件` : '') +
        (result.mastersAdded + result.mastersUpdated > 0
          ? `・マスタ${result.mastersAdded + result.mastersUpdated}件` : '')
      );
    } catch (err) {
      Utils.toast(`マージエラー: ${err.message}`, 'error');
    }
  }

  return { stamp, exportJSON, openImportModal, onFileSelected, executeFromModal };
})();
