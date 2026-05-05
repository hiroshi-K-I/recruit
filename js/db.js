const DB = (() => {
  const DB_NAME = 'InterviewSchedulerDB';
  const DB_VERSION = 1;
  let db = null;

  const STORES = {
    CANDIDATES:   'candidates',
    INTERVIEWS:   'interviews',
    INTERVIEWERS: 'masters_interviewers',
    UNIVERSITIES: 'masters_universities',
    JOB_TYPES:    'masters_jobTypes',
    LOCATIONS:    'masters_locations',
    HR_STAFF:     'masters_hrStaff',
    ROOMS:        'masters_rooms',
  };

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => { db = req.result; resolve(db); };
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(STORES.CANDIDATES)) {
          const cs = d.createObjectStore(STORES.CANDIDATES, { keyPath: 'id', autoIncrement: true });
          cs.createIndex('selectionStatus', 'selectionStatus', { unique: false });
          cs.createIndex('recruitType',     'recruitType',     { unique: false });
        }
        if (!d.objectStoreNames.contains(STORES.INTERVIEWS)) {
          const is = d.createObjectStore(STORES.INTERVIEWS, { keyPath: 'id', autoIncrement: true });
          is.createIndex('date',        'date',        { unique: false });
          is.createIndex('candidateId', 'candidateId', { unique: false });
        }
        [STORES.INTERVIEWERS, STORES.UNIVERSITIES, STORES.JOB_TYPES,
         STORES.LOCATIONS, STORES.HR_STAFF, STORES.ROOMS].forEach(name => {
          if (!d.objectStoreNames.contains(name)) {
            d.createObjectStore(name, { keyPath: 'id', autoIncrement: true });
          }
        });
      };
    });
  }

  function tx(storeName, mode = 'readonly') {
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  function getAll(storeName) {
    return new Promise((resolve, reject) => {
      const req = tx(storeName).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror  = () => reject(req.error);
    });
  }

  function get(storeName, id) {
    return new Promise((resolve, reject) => {
      const req = tx(storeName).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror  = () => reject(req.error);
    });
  }

  function add(storeName, data) {
    return new Promise((resolve, reject) => {
      const req = tx(storeName, 'readwrite').add(data);
      req.onsuccess = () => resolve(req.result);
      req.onerror  = () => reject(req.error);
    });
  }

  function put(storeName, data) {
    return new Promise((resolve, reject) => {
      const req = tx(storeName, 'readwrite').put(data);
      req.onsuccess = () => resolve(req.result);
      req.onerror  = () => reject(req.error);
    });
  }

  function remove(storeName, id) {
    return new Promise((resolve, reject) => {
      const req = tx(storeName, 'readwrite').delete(id);
      req.onsuccess = () => resolve();
      req.onerror  = () => reject(req.error);
    });
  }

  function clearAll() {
    const names = Object.values(STORES);
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(names, 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      names.forEach(name => transaction.objectStore(name).clear());
    });
  }

  return { open, getAll, get, add, put, remove, clearAll, STORES };
})();
