function preferenceKey({ userId, projectId }) {
  return `active-project-area:${userId}:${projectId}`;
}

export function createLocalAreaPreferenceStore(storage) {
  return {
    get(identity) {
      return storage.getItem(preferenceKey(identity));
    },

    set(identity, areaId) {
      storage.setItem(preferenceKey(identity), areaId);
    },
  };
}
