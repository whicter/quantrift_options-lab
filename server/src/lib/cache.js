const store = new Map();

function getCache(key) {
  const item = store.get(key);
  if (!item) return null;
  if (item.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return item.value;
}

function setCache(key, value, ttlSeconds) {
  if (!ttlSeconds || ttlSeconds <= 0) return value;
  store.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
  return value;
}

function cacheKey(prefix, parts) {
  return `${prefix}:${JSON.stringify(parts)}`;
}

module.exports = {
  cacheKey,
  getCache,
  setCache,
};
