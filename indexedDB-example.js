function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class Database {
  constructor(dbVersion = 1) {
    this.dbVersion = dbVersion;
    this.databases = {};
  }

  connect(dbName, tables) {
    return new Promise((resolve, reject) => {
      if (this.databases[dbName]) {
        resolve(this.databases[dbName]);
        return;
      }
      const request = indexedDB.open(dbName, this.dbVersion);
      request.onerror = () => {
        reject(request.error);
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = function () {
          db.close();
          alert("Database is outdated, please reload the page.");
          window.location.reload();
        };
        this.databases[dbName] = db;
        console.log(`✅ Database (${dbName}) connected!`);
        resolve(db);
      };
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        db.onversionchange = function () {
          db.close();
          alert("Database is outdated, please reload the page.");
          window.location.reload();
        };
        if (tables) {
          for (let i = 0; i < tables.length; i++) {
            const table = tables[i];
            const name = table.name;
            const keyPath = table.keyPath;
            const autoIncrement = table.autoIncrement;
            db.createObjectStore(name, { keyPath, autoIncrement });
          }
        }
        resolve(db);
      };
    });
  }

  listDatabases() {
    return Object.keys(this.databases);
  }

  add(dbName, tableName, data) {
    return new Promise(async (resolve, reject) => {
      if (!this.databases[dbName]) {
        await delay(10);
        resolve(await this.add(dbName, tableName, data));
      }
      const transaction = this.databases[dbName].transaction(
        [tableName],
        "readwrite"
      );
      const objectStore = transaction.objectStore(tableName);
      const request = objectStore.add(data);
      request.onsuccess = () => {
        resolve();
      };
      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  getAll(dbName, tableName) {
    return new Promise(async (resolve, reject) => {
      if (!this.databases[dbName]) {
        await delay(10);
        resolve(await this.getAll(dbName, tableName));
      }
      const transaction = this.databases[dbName].transaction(
        [tableName],
        "readonly"
      );
      const objectStore = transaction.objectStore(tableName);
      const request = objectStore.getAll();
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  get(dbName, tableName, key) {
    return new Promise(async (resolve, reject) => {
      if (!this.databases[dbName]) {
        await delay(10);
        resolve(await this.get(dbName, tableName, key));
      }

      const transaction = this.databases[dbName].transaction(
        [tableName],
        "readonly"
      );
      const objectStore = transaction.objectStore(tableName);
      const request = objectStore.get(key);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  update(dbName, tableName, key, newData) {
    return new Promise(async (resolve, reject) => {
      if (!this.databases[dbName]) {
        await delay(10);
        resolve(await this.update(dbName, tableName, key, newData));
      }

      const transaction = this.databases[dbName].transaction(
        [tableName],
        "readwrite"
      );
      const objectStore = transaction.objectStore(tableName);
      const request = objectStore.put(newData, key);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  delete(dbName, tableName, key) {
    return new Promise(async (resolve, reject) => {
      if (!this.databases[dbName]) {
        await delay(10);
        resolve(await this.delete(dbName, tableName, key));
      }

      const transaction = this.databases[dbName].transaction(
        [tableName],
        "readwrite"
      );
      const objectStore = transaction.objectStore(tableName);
      const request = objectStore.delete(key);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  clear(dbName, tableName) {
    return new Promise(async (resolve, reject) => {
      if (!this.databases[dbName]) {
        await delay(10);
        resolve(await this.clear(dbName, tableName));
      }

      const transaction = this.databases[dbName].transaction(
        [tableName],
        "readwrite"
      );
      const objectStore = transaction.objectStore(tableName);
      const request = objectStore.clear();

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }
}

const db = new Database(1);

(async () => {
  await db.connect("app", [
    {
      name: "variables",
      keyPath: "key",
      autoIncrement: true,
    },
    {
      name: "pendingApis",
      keyPath: "key",
      autoIncrement: true,
    },

    {
      name: "middlewares",
      keyPath: "key",
    },
    {
      name: "routes",
      keyPath: "endpoint",
    },
    {
      name: "components",
      keyPath: "key",
    },
  ]);

  const routes = await db.getAll("app", "routes");
})();
