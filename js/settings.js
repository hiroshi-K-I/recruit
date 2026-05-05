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

  // ===== 設定モーダル描画 =====
  function renderModal() {
    const cur = getUsername();
    document.getElementById('settings-username').value = cur;
    document.getElementById('settings-last-export').textContent =
      getLastExportAt() ? Utils.formatDateTime(getLastExportAt()) : '（未実施）';
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

  return { getUsername, setUsername, getLastExportAt, setLastExportAt, renderModal, saveFromModal, updateUsernameDisplay };
})();
