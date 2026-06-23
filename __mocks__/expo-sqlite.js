// Jest manual mock — an in-memory no-op SQLite so the app boots in node tests.
const fakeDb = {
  execAsync: async () => {},
  runAsync: async () => ({ lastInsertRowId: 0, changes: 0 }),
  getAllAsync: async () => [],
  getFirstAsync: async () => null,
  getEachAsync: async function* () {},
  withTransactionAsync: async (fn) => { await fn(); },
  closeAsync: async () => {},
};

module.exports = {
  __esModule: true,
  openDatabaseAsync: async () => fakeDb,
  openDatabaseSync: () => fakeDb,
};
