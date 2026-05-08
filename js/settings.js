const Settings = (() => {
  const KEY = 'iv_settings';

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
  }
  function save(data) { localStorage.setItem(KEY, JSON.stringify(data)); }

  function getUsername() { return load().username || ''; }
  function setUsername(name) { save({ ...load(), username: name }); }

  function getLastExportAt() { return load().lastExportAt || null; }
  function setLastExportAt(iso) { save({ ...load(), lastExportAt: iso }); }

  // ===== 同期フォルダ =====
  let _syncFolderHandle = null;

  function getSyncFolderName() {
    return localStorage.getItem('iv_sync_folder_name') || '';
  }

  async function getSyncFolderHandle() {
    if (_syncFolderHandle) return _syncFolderHandle;
    try {
      const h = await DB.getMeta('syncFolderHandle');
      if (h) _syncFolderHandle = h;
      return h;
    } catch { return null; }
  }

  async function pickSyncFolder() {
    if (!window.showDirectoryPicker) {
      Utils.toast('このブラウザはフォルダ選択をサポートしていません（Chrome/Edge推奨）', 'error');
      return null;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'read' });
      _syncFolderHandle = handle;
      localStorage.setItem('iv_sync_folder_name', handle.name);
      try { await DB.putMeta('syncFolderHandle', handle); } catch {}
      return handle;
    } catch (e) {
      if (e.name !== 'AbortError') Utils.toast('フォルダの選択に失敗しました', 'error');
      return null;
    }
  }

  // ===== 設定モーダル描画 =====
  function renderModal() {
    const cur = getUsername();
    document.getElementById('settings-username').value = cur;
    document.getElementById('settings-last-export').textContent =
      getLastExportAt() ? Utils.formatDateTime(getLastExportAt()) : '（未実施）';
    const folderEl = document.getElementById('settings-sync-folder');
    if (folderEl) folderEl.textContent = getSyncFolderName() || '（未設定）';
    openBackdrop('modal-settings');
  }

  function saveFromModal() {
    const name = document.getElementById('settings-username').value.trim();
    if (!name) { Utils.toast('ユーザー名を入力してください', 'error'); return; }
    setUsername(name);
    updateUsernameDisplay();
    closeBackdrop('modal-settings');
    Utils.toast(`ユーザー名を「${name}」に設定しました`);
  }

  function updateUsernameDisplay() {
    const el = document.getElementById('current-username');
    if (el) el.textContent = getUsername() || '未設定';
  }

  return { getUsername, setUsername, getLastExportAt, setLastExportAt, getSyncFolderName, getSyncFolderHandle, pickSyncFolder, renderModal, saveFromModal, updateUsernameDisplay };
})();
