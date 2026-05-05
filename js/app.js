// ===== メインアプリ初期化 =====
(async () => {
  // IndexedDB オープン
  await DB.open();

  // マスタデータ読み込み
  await Masters.loadAll();

  // 候補者データ読み込み
  await Candidates.load();

  // カレンダー初期化・面接データ読み込み
  Interviews.initCalendar();
  await Interviews.load();

  // マスタ設定ビュー初期化
  Masters.renderView();

  // ===== ナビゲーション =====
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById(`view-${tab.dataset.view}`)?.classList.add('active');
      if (tab.dataset.view === 'interviews') Calendar.render();
    });
  });

  // ===== モーダル閉じる（バックドロップ・閉じるボタン） =====
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeBackdrop(btn.dataset.close));
  });
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeBackdrop(backdrop.id);
    });
  });

  // ===== 候補者モーダル =====
  document.getElementById('btn-add-candidate')?.addEventListener('click', () => Candidates.openModal());
  document.getElementById('btn-save-candidate')?.addEventListener('click', () => Candidates.save());
  document.getElementById('btn-delete-candidate')?.addEventListener('click', () => Candidates.del());
  Candidates.bindFilters();

  // ===== 面接モーダル =====
  document.getElementById('btn-save-interview')?.addEventListener('click',   () => Interviews.save());
  document.getElementById('btn-delete-interview')?.addEventListener('click', () => Interviews.del());

  // ===== CSVエクスポート =====
  document.getElementById('btn-export-candidates')?.addEventListener('click', () => {
    CSV.exportCandidates(Candidates.getAll());
    Utils.toast('候補者データをエクスポートしました');
  });

  document.getElementById('btn-export-interviews')?.addEventListener('click', () => {
    const ivs  = Interviews.getAll();
    const ivrs = Masters.get('interviewers');
    CSV.exportInterviews(ivs, ivrs);
    Utils.toast('面接データをエクスポートしました');
  });

  // ===== CSVインポート =====
  document.getElementById('btn-import-csv')?.addEventListener('click', () => {
    document.getElementById('import-file').value = '';
    document.getElementById('import-preview').innerHTML = '';
    openBackdrop('modal-import');
  });

  let importText = null;
  document.getElementById('import-file')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      importText = await CSV.readFile(file);
      CSV.renderPreview(importText, 'import-preview');
    } catch (err) {
      Utils.toast(err.message, 'error');
    }
  });

  document.getElementById('btn-do-import')?.addEventListener('click', async () => {
    if (!importText) { Utils.toast('ファイルを選択してください', 'error'); return; }
    try {
      const { added, skipped } = await CSV.importCandidates(importText);
      closeBackdrop('modal-import');
      await Candidates.load();
      Utils.toast(`${added}件インポート完了${skipped ? `（${skipped}件スキップ）` : ''}`);
    } catch (err) {
      Utils.toast(`インポートエラー: ${err.message}`, 'error');
    }
  });

  // ===== 全データ削除 =====
  document.getElementById('btn-reset-all')?.addEventListener('click', async () => {
    if (!Utils.confirm('全データを削除します。この操作は取り消せません。本当に実行しますか？')) return;
    if (!Utils.confirm('もう一度確認します。全ての候補者・面接・マスタデータが削除されます。続行しますか？')) return;
    await DB.clearAll();
    await Masters.loadAll();
    await Candidates.load();
    await Interviews.load();
    Masters.renderView();
    Utils.toast('全データを削除しました', 'info');
  });

  // ===== キーボードショートカット =====
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop.open').forEach(m => {
        closeBackdrop(m.id);
      });
    }
  });

})();
