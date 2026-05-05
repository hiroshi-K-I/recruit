// ===== メインアプリ初期化 =====
(async () => {
  await DB.open();
  await Masters.loadAll();
  await Candidates.load();
  Interviews.initCalendar();
  await Interviews.load();
  Masters.renderView();
  Dashboard.render();
  Settings.updateUsernameDisplay();

  // 未設定ならユーザー名入力を促す
  if (!Settings.getUsername()) {
    setTimeout(() => {
      Utils.toast('ユーザー名を設定してください（⚙ 設定）', 'info');
    }, 800);
  }

  // ===== ナビゲーション =====
  function switchView(name) {
    document.querySelectorAll('.nav-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.view === name));
    document.querySelectorAll('.view').forEach(v =>
      v.classList.toggle('active', v.id === `view-${name}`));
    if (name === 'interviews') Calendar.render();
    if (name === 'dashboard')  Dashboard.render();
  }

  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  });

  // ===== モーダル閉じる =====
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeBackdrop(btn.dataset.close));
  });
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) closeBackdrop(backdrop.id);
    });
  });

  // ===== 候補者モーダル =====
  document.getElementById('btn-add-candidate')?.addEventListener('click', () => Candidates.openModal());
  document.getElementById('btn-save-candidate')?.addEventListener('click', () => Candidates.save());
  document.getElementById('btn-delete-candidate')?.addEventListener('click', () => Candidates.del());
  Candidates.bindFilters();

  // ===== 面接モーダル =====
  document.getElementById('btn-save-interview')?.addEventListener('click', () => Interviews.save());
  document.getElementById('btn-delete-interview')?.addEventListener('click', () => Interviews.del());

  // ===== 設定 =====
  document.getElementById('btn-open-settings')?.addEventListener('click', () => Settings.renderModal());
  document.getElementById('btn-save-settings')?.addEventListener('click', () => {
    Settings.saveFromModal();
    Settings.updateUsernameDisplay();
  });

  // ===== 同期エクスポート / インポート =====
  document.getElementById('btn-sync-export')?.addEventListener('click', () => Sync.exportJSON());
  document.getElementById('btn-sync-import')?.addEventListener('click', () => Sync.openImportModal());
  document.getElementById('sync-file-input')?.addEventListener('change', e => {
    Sync.onFileSelected(e.target.files[0]);
  });
  document.getElementById('btn-sync-execute')?.addEventListener('click', () => Sync.executeFromModal());

  // ===== CSVエクスポート =====
  document.getElementById('btn-export-candidates')?.addEventListener('click', () => {
    CSV.exportCandidates(Candidates.getAll());
    Utils.toast('候補者データをエクスポートしました');
  });
  document.getElementById('btn-export-interviews')?.addEventListener('click', () => {
    CSV.exportInterviews(Interviews.getAll(), Masters.get('interviewers'));
    Utils.toast('面接データをエクスポートしました');
  });

  // ===== CSVインポート =====
  document.getElementById('btn-import-csv')?.addEventListener('click', () => {
    document.getElementById('import-file').value = '';
    document.getElementById('import-preview').innerHTML = '';
    openBackdrop('modal-import');
  });

  let importText = null;
  document.getElementById('import-file')?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      importText = await CSV.readFile(file);
      CSV.renderPreview(importText, 'import-preview');
    } catch (err) { Utils.toast(err.message, 'error'); }
  });

  document.getElementById('btn-do-import')?.addEventListener('click', async () => {
    if (!importText) { Utils.toast('ファイルを選択してください', 'error'); return; }
    try {
      const { added, skipped } = await CSV.importCandidates(importText);
      closeBackdrop('modal-import');
      await Candidates.load();
      Dashboard.render();
      Utils.toast(`${added}件インポート完了${skipped ? `（${skipped}件スキップ）` : ''}`);
    } catch (err) { Utils.toast(`インポートエラー: ${err.message}`, 'error'); }
  });

  // ===== 全データ削除 =====
  document.getElementById('btn-reset-all')?.addEventListener('click', async () => {
    if (!Utils.confirm('全データを削除します。この操作は取り消せません。本当に実行しますか？')) return;
    if (!Utils.confirm('もう一度確認します。全データが削除されます。続行しますか？')) return;
    await DB.clearAll();
    await Masters.loadAll();
    await Candidates.load();
    await Interviews.load();
    Masters.renderView();
    Dashboard.render();
    Utils.toast('全データを削除しました', 'info');
  });

  // ===== キーボードショートカット =====
  document.addEventListener('keydown', e => {
    const tag     = document.activeElement?.tagName?.toLowerCase();
    const inInput = ['input','textarea','select'].includes(tag);
    const modal   = document.querySelector('.modal-backdrop.open');

    // モーダル内ショートカット
    if (modal) {
      if (e.key === 'Escape') { closeBackdrop(modal.id); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (modal.id === 'modal-candidate') Candidates.save();
        if (modal.id === 'modal-interview') Interviews.save();
        return;
      }
      return; // モーダル表示中は他のショートカット無効
    }

    if (inInput) return;

    switch (e.key) {
      case 'n': case 'N':
        Candidates.openModal();
        break;
      case 'i': case 'I':
        switchView('interviews');
        Interviews.openModal(null, Utils.formatDate(new Date()), '10:00', '11:00');
        break;
      case '1': switchView('dashboard');  break;
      case '2': switchView('candidates'); break;
      case '3': switchView('interviews'); break;
      case '4': switchView('masters');    break;
      case 'ArrowLeft':
        if (document.getElementById('view-interviews')?.classList.contains('active')) {
          e.preventDefault(); Calendar.navigate(-1);
        }
        break;
      case 'ArrowRight':
        if (document.getElementById('view-interviews')?.classList.contains('active')) {
          e.preventDefault(); Calendar.navigate(1);
        }
        break;
      case 't': case 'T': Calendar.goToday(); break;
      case 'm': case 'M': Calendar.setView('month'); break;
      case 'w': case 'W': Calendar.setView('week');  break;
      case 'd': case 'D': Calendar.setView('day');   break;
      case '?':           openBackdrop('modal-shortcuts'); break;
    }
  });

})();
