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
      disabledSnapshots: {}
    };
  }

  function sanitizeStore(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const rawGroups = Array.isArray(source.groups) ? source.groups : [];
    const assignments = source.assignments && typeof source.assignments === 'object' ? source.assignments : {};
    const collapsed = source.collapsed && typeof source.collapsed === 'object' ? source.collapsed : {};
    const disabledFolders = source.disabledFolders && typeof source.disabledFolders === 'object' ? source.disabledFolders : {};
    const disabledSnapshots = source.disabledSnapshots && typeof source.disabledSnapshots === 'object' ? source.disabledSnapshots : {};

    const groups = rawGroups
      .map((group, index) => ({
        id: String(group?.id || uid('group')),
        name: normalizeName(group?.name) || `未命名${FOLDER_LABEL}`,
        order: Number.isFinite(group?.order) ? Number(group.order) : index
      }))
      .slice(0, 500);

    return {
      version: STORAGE_VERSION,
      groups,
      assignments: Object.fromEntries(
        Object.entries(assignments)
          .filter(([key, value]) => !!key && (typeof value === 'string' || value === null))
          .map(([key, value]) => [String(key), value ? String(value) : null])
      ),
      collapsed: Object.fromEntries(
        Object.entries(collapsed)
          .filter(([key]) => !!key)
          .map(([key, value]) => [String(key), !!value])
      ),
      disabledFolders: Object.fromEntries(
        Object.entries(disabledFolders)
          .filter(([key]) => !!key)
          .map(([key, value]) => [String(key), !!value])
      ),
      disabledSnapshots: Object.fromEntries(
        Object.entries(disabledSnapshots)
          .filter(([key, value]) => !!key && value && typeof value === 'object')
          .map(([key, value]) => [
            String(key),
            Object.fromEntries(
              Object.entries(value)
                .filter(([itemId]) => !!itemId)
                .map(([itemId, itemValue]) => [String(itemId), !!itemValue])
            )
          ])
      )
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
      let apiId = 'no-api';
      let presetName = 'no-preset';
      
      if (presetManager) {
        apiId = presetManager?.apiId ?? 'no-api';
        presetName = presetManager?.getSelectedPresetName?.() ?? 'no-preset';
      } else {
        const presets = ctx?.extensionSettings?.regex_presets;
        if (Array.isArray(presets)) {
          const sel = presets.find(p => p.isSelected) || presets[0];
          if (sel?.name) presetName = sel.name;
        }
      }
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
      store: sanitizeStore(loadJson(key, createDefaultStore()))
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
    saveStoreByKey
  };
})();
