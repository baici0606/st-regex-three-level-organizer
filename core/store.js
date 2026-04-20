(function () {
  'use strict';

  const root = window.STRegexManualGroups = window.STRegexManualGroups || {};
  if (root.store) return;

  const { MODULE_NAME, STORAGE_VERSION, FOLDER_LABEL } = root.constants;
  const { keySegment, normalizeName, uid, loadJson, saveJson, getCtx } = root.utils;

  function createDefaultStore() {
    return {
      version: STORAGE_VERSION,
      groups: [],
      assignments: {},
      collapsed: {},
      disabledFolders: {},
    };
  }

  function sanitizeStore(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const rawGroups = Array.isArray(source.groups) ? source.groups : [];
    const groups = rawGroups
      .map((group, index) => ({
        id: String(group?.id || uid('group')),
        name: normalizeName(group?.name) || `未命名${FOLDER_LABEL}`,
        order: Number.isFinite(group?.order) ? Number(group.order) : index,
      }))
      .slice(0, 500);

    const validGroupIds = new Set(groups.map((group) => group.id));

    const assignments = Object.fromEntries(
      Object.entries(source.assignments && typeof source.assignments === 'object' ? source.assignments : {})
        .filter(([key, value]) => !!normalizeName(key) && typeof value === 'string' && validGroupIds.has(String(value)))
        .map(([key, value]) => [String(key), String(value)]),
    );

    const collapsed = Object.fromEntries(
      Object.entries(source.collapsed && typeof source.collapsed === 'object' ? source.collapsed : {})
        .filter(([key]) => !!normalizeName(key))
        .map(([key, value]) => [String(key), !!value]),
    );

    const disabledFolders = Object.fromEntries(
      Object.entries(source.disabledFolders && typeof source.disabledFolders === 'object' ? source.disabledFolders : {})
        .filter(([key]) => !!normalizeName(key))
        .map(([key, value]) => [String(key), !!value]),
    );

    return {
      version: STORAGE_VERSION,
      groups,
      assignments,
      collapsed,
      disabledFolders,
    };
  }

  function getSortedGroups(groups) {
    return groups.slice().sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'zh-Hans-CN'));
  }

  function getRegexPresetManager(ctx = getCtx()) {
    return ctx?.getPresetManager?.('regex') || null;
  }

  function getScopeContextKey(scope) {
    const ctx = getCtx();

    if (scope === 'preset') {
      const presetManager = getRegexPresetManager(ctx);
      const apiId = presetManager?.apiId ?? 'no-api';
      const presetName = presetManager?.getSelectedPresetName?.() ?? 'no-preset';
      return `preset:${keySegment(apiId, 'no-api')}:${keySegment(presetName, 'no-preset')}`;
    }

    if (scope === 'scoped') {
      const characterId = ctx?.characterId;
      const avatar = ctx?.characters?.[characterId]?.avatar;
      return `scoped:${keySegment(avatar, 'no-character')}`;
    }

    return 'global';
  }

  function getStoreKey(scope) {
    return `${MODULE_NAME}:${getScopeContextKey(scope)}:store`;
  }

  function loadStoreForScope(scope) {
    const key = getStoreKey(scope);
    return {
      key,
      store: sanitizeStore(loadJson(key, createDefaultStore())),
    };
  }

  function saveStoreByKey(key, store) {
    saveJson(key, sanitizeStore(store));
  }

  root.store = {
    createDefaultStore,
    sanitizeStore,
    getSortedGroups,
    getRegexPresetManager,
    getScopeContextKey,
    getStoreKey,
    loadStoreForScope,
    saveStoreByKey,
  };
})();
