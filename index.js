(function () {
  'use strict';

  const MODULE_NAME = 'st-regex-manual-groups';
  const STORAGE_VERSION = 2;
  const UNGROUPED_ID = '__ungrouped__';
  const GROUPING_CLASS = 'st-rmg-grouping';
  const HIDDEN_CLASS = 'st-rmg-hidden';
  const FOLDER_LABEL = '文件夹';
  const UNGROUPED_LABEL = '未分组';
  const STATE_ENABLED = 'enabled';
  const STATE_DISABLED = 'disabled';
  const EXPORT_BUNDLE_TYPE = 'st-rmg-folder-bundle';
  const EXPORT_BUNDLE_VERSION = 1;
  const EXPORT_FILE_EXTENSION = '.st-regex-folder.json';

  function log(...args) {
    console.log(`[${MODULE_NAME}]`, ...args);
  }

  function warn(...args) {
    console.warn(`[${MODULE_NAME}]`, ...args);
  }

  function schedule(fn) {
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(fn);
    else setTimeout(fn, 16);
  }

  function getCtx() {
    return window.SillyTavern?.getContext?.();
  }

  function captureViewportState(anchorEl) {
    const scrollEl = document.scrollingElement || document.documentElement || document.body;
    const anchorTop = anchorEl instanceof HTMLElement ? anchorEl.getBoundingClientRect().top : null;
    return {
      scrollTop: scrollEl?.scrollTop ?? window.pageYOffset ?? 0,
      anchorTop,
      anchorEl: anchorEl instanceof HTMLElement ? anchorEl : null
    };
  }

  function restoreViewportState(state) {
    if (!state) return;

    const scrollEl = document.scrollingElement || document.documentElement || document.body;
    const currentAnchorTop = state.anchorEl instanceof HTMLElement ? state.anchorEl.getBoundingClientRect().top : null;

    if (state.anchorTop != null && currentAnchorTop != null && scrollEl) {
      scrollEl.scrollTop += currentAnchorTop - state.anchorTop;
      return;
    }

    window.scrollTo(0, state.scrollTop ?? 0);
  }

  function getSelectedRegexPreset(ctx = getCtx()) {
    const presets = ctx?.extensionSettings?.regex_presets;
    if (!Array.isArray(presets)) return null;
    return presets.find((preset) => preset?.isSelected) || null;
  }

  function getRegexPresetManager(ctx = getCtx()) {
    return ctx?.getPresetManager?.('regex') || null;
  }


  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  }

  function saveJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore
    }
  }

  function toast(message, level = 'info') {
    try {
      const fn = window.toastr?.[level] || window.toastr?.info;
      if (fn) {
        fn(message);
        return;
      }
    } catch {
      // ignore
    }
    log(message);
  }

  function normalizeName(value) {
    return String(value ?? '').trim();
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[ch]);
  }

  function uid(prefix = 'id') {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function keySegment(value, fallback = 'default') {
    const normalized = String(value ?? '').trim();
    if (!normalized) return fallback;
    return normalized.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || fallback;
  }

  function cloneJsonData(value, fallback = null) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return fallback;
    }
  }

  function getScriptName(itemEl) {
    const nameEl = itemEl?.querySelector?.('.regex_script_name');
    return nameEl?.textContent?.trim() || nameEl?.getAttribute?.('title')?.trim() || '';
  }

  function getItemKeyCandidate(itemEl) {
    return [
      itemEl?.dataset?.scriptId,
      itemEl?.dataset?.regexScriptId,
      itemEl?.dataset?.regexId,
      itemEl?.dataset?.id,
      itemEl?.getAttribute?.('data-script-id'),
      itemEl?.getAttribute?.('data-regex-script-id'),
      itemEl?.getAttribute?.('data-regex-id'),
      itemEl?.getAttribute?.('data-id'),
      itemEl?.id
    ].find(Boolean);
  }

  function hashString(value) {
    let hash = 5381;
    for (let i = 0; i < value.length; i += 1) {
      hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
    }
    return (hash >>> 0).toString(36);
  }

  function getItemFingerprint(itemEl) {
    if (!itemEl?.querySelectorAll) return '';

    const parts = [];
    for (const field of itemEl.querySelectorAll('input, textarea, select')) {
      if (!(field instanceof HTMLElement)) continue;

      const type = String(field.getAttribute('type') || '').toLowerCase();
      const key = normalizeName(field.getAttribute('name') || field.id || field.className || field.tagName);
      const value = type === 'checkbox' || type === 'radio'
        ? (field.checked ? '1' : '0')
        : normalizeName(field.value ?? field.textContent ?? '');

      if (!key && !value) continue;
      parts.push(`${key}=${value}`);
    }

    if (!parts.length) {
      const name = normalizeName(getScriptName(itemEl));
      if (name) parts.push(`name=${name}`);
    }

    return parts.length ? hashString(parts.join('\u001f')) : '';
  }

  function getItemId(itemEl) {
    const candidate = normalizeName(getItemKeyCandidate(itemEl));
    if (candidate) return `dom:${candidate}`;

    const fingerprint = getItemFingerprint(itemEl);
    if (fingerprint) return `fp:${fingerprint}`;

    const name = normalizeName(getScriptName(itemEl));
    if (name) return `name:${name}`;

    return 'item:unknown';
  }

  function getLegacyItemId(itemEl, index) {
    const value = normalizeName(getItemKeyCandidate(itemEl)) || normalizeName(getScriptName(itemEl)) || 'item';
    return `${value}#${index}`;
  }

  function getDirectScriptItems(listEl) {
    if (!listEl?.children) return [];
    return Array.from(listEl.children).filter((el) => el?.classList?.contains('regex-script-label') && !el.classList?.contains('st-rmg-sort-anchor'));
  }

  function getJQuery() {
    return window.jQuery || window.$ || null;
  }

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

  function openPrompt(title, defaultValue = '') {
    return new Promise((resolve) => {
      if (typeof window.callPopup === 'function' && window.POPUP_TYPE?.INPUT) {
        Promise.resolve(window.callPopup(title, window.POPUP_TYPE.INPUT, defaultValue)).then(resolve).catch(() => resolve(null));
        return;
      }
      resolve(window.prompt(title, defaultValue));
    });
  }

  function openConfirm(message) {
    return new Promise((resolve) => {
      if (typeof window.callPopup === 'function' && window.POPUP_TYPE?.CONFIRM) {
        Promise.resolve(window.callPopup(message, window.POPUP_TYPE.CONFIRM)).then((value) => resolve(!!value)).catch(() => resolve(false));
        return;
      }
      resolve(window.confirm(message));
    });
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

  function createPanelController({ scope, blockId, listId, titleText }) {
    const HEADER_ID = `${MODULE_NAME}-${scope}-header`;
    const PANEL_COLLAPSED_KEY = `${MODULE_NAME}:${scope}:panel-collapsed`;
    const GROUP_SELECT_ID = `${MODULE_NAME}-${scope}-group-select`;
    const NEW_GROUP_ID = `${MODULE_NAME}-${scope}-new-group`;
    const RENAME_GROUP_ID = `${MODULE_NAME}-${scope}-rename-group`;
    const DELETE_GROUP_ID = `${MODULE_NAME}-${scope}-delete-group`;
    let store = createDefaultStore();
    let currentStoreKey = '';
    let listObserver = null;
    let domObserver = null;
    let rendering = false;
    let sorting = false;
    let sortingItemId = '';
    let sortingTargetGroupId = undefined;
    let draggingFolderId = '';
    let folderDropTargetId = '';
    let folderDropAfter = false;
    let lastFolderDragEndedAt = 0;
    let lastRenderedGroupSignature = '';
    let selectedGroupId = UNGROUPED_ID;
    let pendingViewportRestore = null;
    let pendingImportedAssignments = [];
    let panelCollapsed = !!loadJson(PANEL_COLLAPSED_KEY, false);

    function pauseListObserver() {
      if (listObserver) listObserver.disconnect();
    }

    function getStoreKey() {
      return `${MODULE_NAME}:${getScopeContextKey(scope)}:store`;
    }

    function loadStoreForCurrentContext() {
      const nextStoreKey = getStoreKey();
      if (nextStoreKey === currentStoreKey) return false;

      currentStoreKey = nextStoreKey;
      store = sanitizeStore(loadJson(currentStoreKey, createDefaultStore()));
      lastRenderedGroupSignature = '';
      selectedGroupId = UNGROUPED_ID;
      return true;
    }

    loadStoreForCurrentContext();

    function saveStore() {
      store = sanitizeStore(store);
      if (!currentStoreKey) currentStoreKey = getStoreKey();
      saveJson(currentStoreKey, store);
    }

    function savePanelCollapsed() {
      saveJson(PANEL_COLLAPSED_KEY, !!panelCollapsed);
    }

    function getBlockEl() {
      return document.getElementById(blockId);
    }

    function getListEl() {
      return document.getElementById(listId);
    }

    function getHeaderEl() {
      return document.getElementById(HEADER_ID);
    }

    function getGroups() {
      return getSortedGroups(store.groups);
    }

    function getGroupById(groupId) {
      return store.groups.find((group) => group.id === groupId) || null;
    }

    function getFolderState(groupId, items = collectItems()) {
      const folderItems = groupId === UNGROUPED_ID
        ? items.filter((item) => !store.assignments[item.id])
        : items.filter((item) => store.assignments[item.id] === groupId);

      if (folderItems.length < 1) return STATE_ENABLED;
      return store.disabledFolders?.[groupId] ? STATE_DISABLED : STATE_ENABLED;
    }

    function getScriptType() {
      if (scope === 'global') return 0;
      if (scope === 'scoped') return 1;
      if (scope === 'preset') return 2;
      return -1;
    }

    function getScriptsByCurrentScope(ctx = getCtx()) {
      const scriptType = getScriptType();
      if (scriptType === 0) return Array.isArray(ctx?.extensionSettings?.regex) ? ctx.extensionSettings.regex : [];
      if (scriptType === 1) {
        const character = ctx?.characters?.[ctx?.characterId];
        const scopedScripts = character?.data?.extensions?.regex_scripts;
        return Array.isArray(scopedScripts) ? scopedScripts : [];
      }
      if (scriptType === 2) {
        const presetManager = getRegexPresetManager(ctx);
        const presetScripts = presetManager?.readPresetExtensionField?.({ path: 'regex_scripts' });
        return Array.isArray(presetScripts) ? presetScripts : [];
      }
      return [];
    }

    function getScriptsByItemId(currentScripts = getScriptsByCurrentScope()) {
      return new Map(
        currentScripts
          .filter((script) => script && typeof script === 'object' && normalizeName(script.id))
          .map((script) => {
            const scriptId = normalizeName(script.id);
            return [`dom:${scriptId}`, script];
          })
      );
    }

    function generateUniqueScriptId(existingIds) {
      let nextId = '';
      do {
        nextId = uid('regex');
      } while (existingIds.has(nextId));
      existingIds.add(nextId);
      return nextId;
    }

    async function saveScriptsForCurrentScope(nextScripts, ctx = getCtx()) {
      const scriptType = getScriptType();
      if (scriptType === 0) {
        if (ctx?.extensionSettings) ctx.extensionSettings.regex = nextScripts;
        ctx?.saveSettingsDebounced?.();
        return;
      }

      if (scriptType === 1) {
        const characterId = ctx?.characterId;
        if (characterId === undefined || typeof ctx?.writeExtensionField !== 'function') return;
        await ctx.writeExtensionField(characterId, 'regex_scripts', nextScripts);
        return;
      }

      if (scriptType === 2) {
        const presetManager = getRegexPresetManager(ctx);
        const presetName = presetManager?.getSelectedPresetName?.();
        if (!presetManager || !presetName) return;
        await presetManager.writePresetExtensionField({ name: presetName, path: 'regex_scripts', value: nextScripts });
      }
    }

    async function reloadRegexUi(ctx = getCtx()) {
      if (typeof window.loadRegexScripts === 'function') {
        await window.loadRegexScripts();
      }
      const currentChatId = ctx?.getCurrentChatId?.();
      if (currentChatId) {
        await ctx?.reloadCurrentChat?.();
      }
      await new Promise((resolve) => schedule(resolve));
    }

    function getFolderItemIds(groupId, items = collectItems()) {
      return items
        .filter((item) => (groupId === UNGROUPED_ID ? !store.assignments[item.id] : store.assignments[item.id] === groupId))
        .map((item) => item.id);
    }

    async function applyFolderDisabledState(groupId, enabled, items = collectItems()) {
      const ctx = getCtx();
      const currentScripts = getScriptsByCurrentScope(ctx);
      if (!Array.isArray(currentScripts) || currentScripts.length < 1) return false;

      const targetItemIds = getFolderItemIds(groupId, items);
      if (targetItemIds.length < 1) {
        if (store.disabledSnapshots?.[groupId]) {
          delete store.disabledSnapshots[groupId];
          return true;
        }
        return false;
      }

      const availableScriptsByItemId = getScriptsByItemId(currentScripts);
      const availableTargetItemIds = new Set(targetItemIds.filter((itemId) => availableScriptsByItemId.has(itemId)));
      const existingSnapshotSource = store.disabledSnapshots?.[groupId];
      const existingSnapshot = existingSnapshotSource && typeof existingSnapshotSource === 'object' ? { ...existingSnapshotSource } : {};
      const nextSnapshot = {};

      let snapshotChanged = false;
      for (const [itemId, value] of Object.entries(existingSnapshot)) {
        if (availableTargetItemIds.has(itemId)) nextSnapshot[itemId] = !!value;
        else snapshotChanged = true;
      }

      let scriptsChanged = false;
      const nextScripts = currentScripts.map((script) => {
        const scriptId = normalizeName(script?.id);
        if (!scriptId) return script;

        const itemId = `dom:${scriptId}`;
        if (!availableTargetItemIds.has(itemId)) return script;

        if (!enabled) {
          if (!Object.prototype.hasOwnProperty.call(nextSnapshot, itemId)) {
            nextSnapshot[itemId] = !!script.disabled;
            snapshotChanged = true;
          }

          if (!!script.disabled) return script;
          scriptsChanged = true;
          return { ...script, disabled: true };
        }

        if (!Object.prototype.hasOwnProperty.call(nextSnapshot, itemId)) return script;

        const nextDisabled = !!nextSnapshot[itemId];
        delete nextSnapshot[itemId];
        snapshotChanged = true;
        if (!!script.disabled === nextDisabled) return script;
        scriptsChanged = true;
        return { ...script, disabled: nextDisabled };
      });

      const hadSnapshot = Object.prototype.hasOwnProperty.call(store.disabledSnapshots || {}, groupId);
      if (Object.keys(nextSnapshot).length > 0) {
        store.disabledSnapshots[groupId] = nextSnapshot;
      } else if (hadSnapshot) {
        delete store.disabledSnapshots[groupId];
        snapshotChanged = true;
      }

      if (!scriptsChanged) return snapshotChanged;

      await saveScriptsForCurrentScope(nextScripts, ctx);
      await reloadRegexUi(ctx);
      return true;
    }

    async function setFolderEnabled(groupId, enabled) {
      const items = collectItems();
      const itemIds = new Set(getFolderItemIds(groupId, items));
      if (itemIds.size < 1) return;

      pendingViewportRestore = captureViewportState(getHeaderEl());

      if (!store.disabledFolders || typeof store.disabledFolders !== 'object') {
        store.disabledFolders = {};
      }
      if (!store.disabledSnapshots || typeof store.disabledSnapshots !== 'object') {
        store.disabledSnapshots = {};
      }

      if (!enabled) {
        store.disabledFolders[groupId] = true;
      } else {
        delete store.disabledFolders[groupId];
      }

      await applyFolderDisabledState(groupId, enabled, items);
      saveStore();
      await renderTree();
    }

    function findGroupByNormalizedName(name, excludeGroupId = '') {
      const normalized = normalizeName(name);
      return store.groups.find((group) => group.id !== excludeGroupId && normalizeName(group.name) === normalized);
    }

    function validateGroupName(name, excludeGroupId = '') {
      const normalized = normalizeName(name);
      if (!normalized) {
        toast(`${FOLDER_LABEL}名称不能为空`, 'warning');
        return '';
      }

      if (normalized === UNGROUPED_LABEL) {
        toast(`“${UNGROUPED_LABEL}”是保留名称，不能使用`, 'warning');
        return '';
      }

      const duplicate = findGroupByNormalizedName(normalized, excludeGroupId);
      if (duplicate) {
        toast(`已存在同名${FOLDER_LABEL}`, 'warning');
        return '';
      }

      return normalized;
    }

    function getImportBaseGroupName(name) {
      const normalized = normalizeName(name);
      if (!normalized || normalized === UNGROUPED_LABEL) return `导入${FOLDER_LABEL}`;
      return normalized;
    }

    function getUniqueGroupName(name) {
      const baseName = getImportBaseGroupName(name);
      if (!findGroupByNormalizedName(baseName)) return baseName;

      let index = 1;
      while (true) {
        const candidate = index === 1 ? `${baseName}（导入）` : `${baseName}（导入${index}）`;
        if (!findGroupByNormalizedName(candidate)) return candidate;
        index += 1;
      }
    }

    function buildExportFileName(groupName) {
      return `${keySegment(groupName, 'regex-folder')}${EXPORT_FILE_EXTENSION}`;
    }

    function downloadTextFile(fileName, content, mimeType = 'application/json;charset=utf-8') {
      if (typeof Blob !== 'function' || typeof URL?.createObjectURL !== 'function') {
        throw new Error('当前环境不支持文件导出');
      }

      const blob = new Blob([content], { type: mimeType });
      const objectUrl = URL.createObjectURL(blob);
      const linkEl = document.createElement('a');
      linkEl.href = objectUrl;
      linkEl.download = fileName;
      linkEl.style.display = 'none';
      linkEl.rel = 'noopener';
      linkEl.target = '_blank';
      document.body.appendChild(linkEl);
      if (typeof linkEl.click === 'function') linkEl.click();
      linkEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      window.setTimeout(() => {
        linkEl.remove();
        URL.revokeObjectURL(objectUrl);
      }, 5000);
    }

    async function pickImportFile() {
      return new Promise((resolve) => {
        const inputEl = document.createElement('input');

        inputEl.type = 'file';
        inputEl.accept = `${EXPORT_FILE_EXTENSION},application/json,.json`;
        inputEl.style.display = 'none';
        inputEl.addEventListener('change', () => {
          const file = inputEl.files?.[0] || null;
          inputEl.remove();
          resolve(file);
        }, { once: true });
        inputEl.addEventListener('cancel', () => {
          inputEl.remove();
          resolve(null);
        }, { once: true });
        document.body.appendChild(inputEl);
        inputEl.click();
      });
    }

    async function readFileText(file) {
      if (!file) return '';
      if (typeof file.text === 'function') return await file.text();

      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result ?? '');
        reader.onerror = () => reject(new Error('读取导入文件失败'));
        reader.readAsText(file);
      });
    }

    async function syncItemDisabledStateForAssignmentChange(itemId, previousGroupId, nextGroupId) {
      const normalizedItemId = normalizeName(itemId);
      if (!normalizedItemId || normalizedItemId === 'item:unknown') return false;

      const ctx = getCtx();
      const currentScripts = getScriptsByCurrentScope(ctx);
      if (!Array.isArray(currentScripts) || currentScripts.length < 1) return false;

      const normalizedPreviousGroupId = previousGroupId ? String(previousGroupId) : null;
      const normalizedNextGroupId = nextGroupId ? String(nextGroupId) : null;
      const previousFolderDisabled = !!store.disabledFolders?.[normalizedPreviousGroupId || UNGROUPED_ID];
      const nextFolderDisabled = !!store.disabledFolders?.[normalizedNextGroupId || UNGROUPED_ID];

      if (!previousFolderDisabled && !nextFolderDisabled) return false;

      const scriptId = normalizedItemId.startsWith('dom:') ? normalizedItemId.slice(4) : '';
      if (!scriptId) return false;

      const scriptIndex = currentScripts.findIndex((script) => normalizeName(script?.id) === scriptId);
      if (scriptIndex < 0) return false;

      const currentScript = currentScripts[scriptIndex];
      const nextScripts = currentScripts.slice();
      const nextScript = { ...currentScript };
      let scriptsChanged = false;
      let storeChanged = false;

      if (!store.disabledSnapshots || typeof store.disabledSnapshots !== 'object') {
        store.disabledSnapshots = {};
      }

      const previousSnapshot = normalizedPreviousGroupId && store.disabledSnapshots?.[normalizedPreviousGroupId]
        && typeof store.disabledSnapshots[normalizedPreviousGroupId] === 'object'
        ? store.disabledSnapshots[normalizedPreviousGroupId]
        : null;
      const hadPreviousSnapshot = !!previousSnapshot && Object.prototype.hasOwnProperty.call(previousSnapshot, normalizedItemId);
      const previousRecordedDisabled = hadPreviousSnapshot ? !!previousSnapshot[normalizedItemId] : !!currentScript.disabled;

      if (previousFolderDisabled && previousSnapshot && hadPreviousSnapshot) {
        delete previousSnapshot[normalizedItemId];
        storeChanged = true;
        if (Object.keys(previousSnapshot).length < 1 && normalizedPreviousGroupId) {
          delete store.disabledSnapshots[normalizedPreviousGroupId];
        }
      }

      if (nextFolderDisabled) {
        if (!normalizedNextGroupId) return storeChanged;

        if (!store.disabledSnapshots[normalizedNextGroupId] || typeof store.disabledSnapshots[normalizedNextGroupId] !== 'object') {
          store.disabledSnapshots[normalizedNextGroupId] = {};
          storeChanged = true;
        }

        const nextSnapshot = store.disabledSnapshots[normalizedNextGroupId];
        if (!Object.prototype.hasOwnProperty.call(nextSnapshot, normalizedItemId) || !!nextSnapshot[normalizedItemId] !== previousRecordedDisabled) {
          nextSnapshot[normalizedItemId] = previousRecordedDisabled;
          storeChanged = true;
        }

        if (!nextScript.disabled) {
          nextScript.disabled = true;
          scriptsChanged = true;
        }
      } else if (previousFolderDisabled) {
        if (!!nextScript.disabled !== previousRecordedDisabled) {
          nextScript.disabled = previousRecordedDisabled;
          scriptsChanged = true;
        }
      }

      if (storeChanged) {
        saveStore();
      }

      if (scriptsChanged) {
        nextScripts[scriptIndex] = nextScript;
        await saveScriptsForCurrentScope(nextScripts, ctx);
        await reloadRegexUi(ctx);
      }

      return storeChanged || scriptsChanged;
    }

    function parseImportBundle(rawText) {
      let parsed = null;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        throw new Error('导入文件不是合法的 JSON');
      }

      if (!parsed || parsed.type !== EXPORT_BUNDLE_TYPE) {
        throw new Error('导入文件不是本插件导出的文件夹包');
      }

      const version = Number(parsed.version);
      if (!Number.isFinite(version) || version < 1 || version > EXPORT_BUNDLE_VERSION) {
        throw new Error(`不支持的文件夹包版本：${parsed.version}`);
      }

      const group = parsed.group && typeof parsed.group === 'object' ? parsed.group : null;
      if (!group) {
        throw new Error('导入文件缺少文件夹信息');
      }

      const scripts = Array.isArray(parsed.scripts)
        ? parsed.scripts
            .map((script) => cloneJsonData(script, null))
            .filter((script) => script && typeof script === 'object')
        : [];
      if (scripts.length < 1) {
        throw new Error('导入文件中没有可用的正则数据');
      }

      const snapshotSource = parsed.disabledSnapshotByScriptId && typeof parsed.disabledSnapshotByScriptId === 'object'
        ? parsed.disabledSnapshotByScriptId
        : {};

      return {
        version,
        sourceScope: normalizeName(parsed?.source?.scope),
        group: {
          name: getImportBaseGroupName(group.name),
          disabled: !!group.disabled,
          collapsed: !!group.collapsed
        },
        scripts,
        disabledSnapshotByScriptId: Object.fromEntries(
          Object.entries(snapshotSource)
            .filter(([scriptId]) => !!normalizeName(scriptId))
            .map(([scriptId, value]) => [normalizeName(scriptId), !!value])
        )
      };
    }

    async function exportGroup(groupId) {
      const group = getGroupById(groupId);
      if (!group) {
        toast(`请选择要导出的${FOLDER_LABEL}`, 'warning');
        return;
      }

      const currentScripts = getScriptsByCurrentScope();
      const items = collectItems();
      const itemIdsForGroup = new Set(
        items
          .filter((item) => store.assignments[item.id] === groupId)
          .map((item) => item.id)
      );

      for (const [itemId, assignedGroupId] of Object.entries(store.assignments)) {
        if (assignedGroupId === groupId) itemIdsForGroup.add(itemId);
      }

      const assignedScriptIds = new Set();
      for (const item of items) {
        if (!itemIdsForGroup.has(item.id)) continue;
        const itemKey = normalizeName(item.keyCandidate);
        if (itemKey) assignedScriptIds.add(itemKey);
      }

      for (const itemId of itemIdsForGroup) {
        if (normalizeName(itemId).startsWith('dom:')) {
          assignedScriptIds.add(normalizeName(itemId).slice(4));
        }
      }

      const exportedScripts = currentScripts
        .filter((script) => {
          const scriptId = normalizeName(script?.id);
          return !!scriptId && assignedScriptIds.has(scriptId);
        })
        .map((script) => cloneJsonData(script, null))
        .filter((script) => script && typeof script === 'object');

      if (exportedScripts.length < 1) {
        toast(`当前${FOLDER_LABEL}内没有可导出的正则`, 'warning');
        return;
      }

      const snapshotByScriptId = {};
      const snapshotSource = store.disabledSnapshots?.[groupId] && typeof store.disabledSnapshots[groupId] === 'object'
        ? store.disabledSnapshots[groupId]
        : {};

      for (const clonedScript of exportedScripts) {
        const scriptId = normalizeName(clonedScript.id);
        if (!scriptId) continue;
        const snapshotKey = `dom:${scriptId}`;
        if (Object.prototype.hasOwnProperty.call(snapshotSource, snapshotKey)) {
          snapshotByScriptId[scriptId] = !!snapshotSource[snapshotKey];
        }
      }

      const payload = {
        type: EXPORT_BUNDLE_TYPE,
        version: EXPORT_BUNDLE_VERSION,
        source: {
          module: MODULE_NAME,
          scope,
          title: titleText,
          exportedAt: new Date().toISOString()
        },
        group: {
          name: group.name,
          disabled: !!store.disabledFolders?.[groupId],
          collapsed: !!store.collapsed?.[groupId]
        },
        scripts: exportedScripts,
        disabledSnapshotByScriptId: snapshotByScriptId
      };

      try {
        downloadTextFile(buildExportFileName(group.name), JSON.stringify(payload, null, 2));
        toast(`已导出${FOLDER_LABEL}“${group.name}”`, 'success');
      } catch (error) {
        toast(error?.message || '导出失败', 'error');
      }
    }

    function insertGroupAfterAnchor(nextGroup, anchorGroupId = '') {
      const orderedGroups = getGroups().map((group) => ({ ...group }));
      const anchorIndex = orderedGroups.findIndex((group) => group.id === anchorGroupId);
      const insertIndex = anchorIndex >= 0 ? anchorIndex + 1 : orderedGroups.length;
      orderedGroups.splice(insertIndex, 0, nextGroup);
      store.groups = orderedGroups.map((group, index) => ({ ...group, order: index + 1 }));
    }

    function queueImportedAssignments(importedEntries, groupId) {
      if (!Array.isArray(importedEntries) || importedEntries.length < 1) return;

      pendingImportedAssignments = importedEntries.map((entry) => ({
        groupId,
        scriptId: normalizeName(entry?.script?.id),
        targetName: normalizeName(entry?.script?.scriptName || entry?.script?.name || ''),
        tempAssignmentKey: `dom:${entry?.script?.id || ''}`
      })).filter((entry) => entry.scriptId || entry.targetName);
    }

    function alignImportedAssignments(items = collectItems()) {
      if (!Array.isArray(pendingImportedAssignments) || pendingImportedAssignments.length < 1) return false;

      const pendingEntries = pendingImportedAssignments.map((entry) => ({ ...entry }));
      let changed = false;
      const usedItemIds = new Set();

      for (const item of items) {
        if (usedItemIds.has(item.id)) continue;
        const itemKey = normalizeName(item.keyCandidate);
        const itemName = normalizeName(item.name);
        const matchedIndex = pendingEntries.findIndex((entry) => {
          if (entry.scriptId && itemKey && itemKey === entry.scriptId) return true;
          return !!entry.targetName && !!itemName && entry.targetName === itemName;
        });
        if (matchedIndex < 0) continue;

        const [matchedEntry] = pendingEntries.splice(matchedIndex, 1);
        const tempAssignmentKey = matchedEntry.tempAssignmentKey;
        const groupId = matchedEntry.groupId;
        usedItemIds.add(item.id);

        if (store.assignments[tempAssignmentKey] !== undefined && tempAssignmentKey !== item.id) {
          delete store.assignments[tempAssignmentKey];
          changed = true;
        }

        if (store.assignments[item.id] !== groupId) {
          store.assignments[item.id] = groupId;
          changed = true;
        }

        if (store.disabledSnapshots?.[groupId] && Object.prototype.hasOwnProperty.call(store.disabledSnapshots[groupId], tempAssignmentKey)) {
          store.disabledSnapshots[groupId][item.id] = store.disabledSnapshots[groupId][tempAssignmentKey];
          delete store.disabledSnapshots[groupId][tempAssignmentKey];
          changed = true;
        }
      }

      pendingImportedAssignments = pendingEntries;

      return changed;
    }

    async function importGroup(anchorGroupId = '') {
      const file = await pickImportFile();
      if (!file) return;

      let bundle = null;
      try {
        bundle = parseImportBundle(await readFileText(file));
      } catch (error) {
        toast(error?.message || '导入失败', 'error');
        return;
      }

      const ctx = getCtx();
      const currentScripts = getScriptsByCurrentScope(ctx);
      if (!Array.isArray(currentScripts)) {
        toast('当前范围的正则列表不可用，导入失败', 'error');
        return;
      }

      let nextGroupId = uid('group');
      while (getGroupById(nextGroupId)) {
        nextGroupId = uid('group');
      }

      const nextGroupName = getUniqueGroupName(bundle.group.name);
      const existingScriptIds = new Set(
        currentScripts
          .map((script) => normalizeName(script?.id))
          .filter(Boolean)
      );

      const importedEntries = [];
      for (const rawScript of bundle.scripts) {
        const clonedScript = cloneJsonData(rawScript, null);
        if (!clonedScript || typeof clonedScript !== 'object') continue;

        const originalId = normalizeName(clonedScript.id);
        const originalDisabled = !!clonedScript.disabled;
        let nextScriptId = '';
        if (originalId && !existingScriptIds.has(originalId)) {
          nextScriptId = originalId;
          existingScriptIds.add(nextScriptId);
        } else {
          nextScriptId = generateUniqueScriptId(existingScriptIds);
        }

        clonedScript.id = nextScriptId;
        if (bundle.group.disabled) clonedScript.disabled = true;
        importedEntries.push({
          originalId,
          originalDisabled,
          script: clonedScript
        });
      }

      if (importedEntries.length < 1) {
        toast('导入文件中没有可用的正则数据', 'error');
        return;
      }

      if (!store.disabledFolders || typeof store.disabledFolders !== 'object') {
        store.disabledFolders = {};
      }
      if (!store.disabledSnapshots || typeof store.disabledSnapshots !== 'object') {
        store.disabledSnapshots = {};
      }

      insertGroupAfterAnchor({
        id: nextGroupId,
        name: nextGroupName,
        order: store.groups.length + 1
      }, anchorGroupId);

      if (bundle.group.collapsed) store.collapsed[nextGroupId] = true;
      else delete store.collapsed[nextGroupId];

      if (bundle.group.disabled) {
        store.disabledFolders[nextGroupId] = true;
        const nextSnapshot = {};
        for (const entry of importedEntries) {
          nextSnapshot[`dom:${entry.script.id}`] = entry.originalId && Object.prototype.hasOwnProperty.call(bundle.disabledSnapshotByScriptId, entry.originalId)
            ? !!bundle.disabledSnapshotByScriptId[entry.originalId]
            : entry.originalDisabled;
        }
        store.disabledSnapshots[nextGroupId] = nextSnapshot;
      } else {
        delete store.disabledFolders[nextGroupId];
        delete store.disabledSnapshots[nextGroupId];
      }

      for (const entry of importedEntries) {
        store.assignments[`dom:${entry.script.id}`] = nextGroupId;
      }

      queueImportedAssignments(importedEntries, nextGroupId);
      pendingViewportRestore = captureViewportState(getHeaderEl());
      saveStore();
      await saveScriptsForCurrentScope(currentScripts.concat(importedEntries.map((entry) => entry.script)), ctx);
      await reloadRegexUi(ctx);
      await renderTree();

      const scopeHint = bundle.sourceScope ? `（来源：${bundle.sourceScope}）` : '';
      toast(`已导入${FOLDER_LABEL}“${nextGroupName}”${scopeHint}`, 'success');
    }

    function collectItems(listEl = getListEl()) {
      return getDirectScriptItems(listEl).map((itemEl, index) => ({
        el: itemEl,
        index,
        keyCandidate: normalizeName(getItemKeyCandidate(itemEl)),
        id: getItemId(itemEl),
        legacyId: getLegacyItemId(itemEl, index),
        name: getScriptName(itemEl)
      }));
    }

    function migrateLegacyAssignments(items) {
      let changed = false;

      for (const item of items) {
        let legacyKey = '';
        let legacyGroupId = undefined;

        if (item.legacyId && item.legacyId !== item.id) {
          legacyKey = item.legacyId;
          legacyGroupId = store.assignments[legacyKey];
        }

        if (legacyGroupId === undefined && item.keyCandidate) {
          const legacyPrefix = `${item.keyCandidate}#`;
          const matchedLegacyKeys = Object.keys(store.assignments).filter((key) => key.startsWith(legacyPrefix));
          if (matchedLegacyKeys.length === 1) {
            legacyKey = matchedLegacyKeys[0];
            legacyGroupId = store.assignments[legacyKey];
          }
        }

        if (legacyGroupId === undefined) continue;

        if (store.assignments[item.id] === undefined) {
          store.assignments[item.id] = legacyGroupId;
        }

        if (legacyKey) delete store.assignments[legacyKey];
        changed = true;
      }

      if (changed) saveStore();
    }

    function cleanupAssignments(items) {
      const validItemIds = new Set(items.map((item) => item.id));
      const validGroupIds = new Set(store.groups.map((group) => group.id));
      const shouldPruneMissingItems = scope === 'global' && items.length > 0;
      const canPruneSnapshotItems = items.length > 0;
      const protectedPendingKeys = new Set((pendingImportedAssignments || []).map((entry) => entry.tempAssignmentKey).filter(Boolean));
      let changed = false;

      for (const [itemId, groupId] of Object.entries(store.assignments)) {
        const missingInCurrentView = !validItemIds.has(itemId);
        const invalidGroup = groupId && !validGroupIds.has(groupId);
        if (protectedPendingKeys.has(itemId)) continue;
        if ((shouldPruneMissingItems && missingInCurrentView) || invalidGroup) {
          delete store.assignments[itemId];
          changed = true;
        }
      }

      for (const groupId of Object.keys(store.collapsed)) {
        if (groupId !== UNGROUPED_ID && !validGroupIds.has(groupId)) {
          delete store.collapsed[groupId];
          changed = true;
        }
      }

      for (const groupId of Object.keys(store.disabledFolders || {})) {
        if (groupId !== UNGROUPED_ID && !validGroupIds.has(groupId)) {
          delete store.disabledFolders[groupId];
          changed = true;
        }
      }

      for (const [groupId, snapshot] of Object.entries(store.disabledSnapshots || {})) {
        if (groupId !== UNGROUPED_ID && !validGroupIds.has(groupId)) {
          delete store.disabledSnapshots[groupId];
          changed = true;
          continue;
        }

        if (!snapshot || typeof snapshot !== 'object') {
          delete store.disabledSnapshots[groupId];
          changed = true;
          continue;
        }

        for (const itemId of Object.keys(snapshot)) {
          const missingInCurrentView = !validItemIds.has(itemId);
          if (protectedPendingKeys.has(itemId)) continue;
          if (canPruneSnapshotItems && missingInCurrentView) {
            delete snapshot[itemId];
            changed = true;
          }
        }

        if (Object.keys(snapshot).length < 1) {
          delete store.disabledSnapshots[groupId];
          changed = true;
        }
      }

      if (changed) saveStore();
    }

    function applyPanelCollapsedState(headerEl) {
      if (!headerEl) return;
      headerEl.classList.toggle('st-rmg-panel-collapsed', !!panelCollapsed);

      const arrowEl = headerEl.querySelector('[data-st-rmg-panel-arrow]');
      if (arrowEl) arrowEl.textContent = panelCollapsed ? '▶' : '▼';

      const titleEl = headerEl.querySelector('[data-st-rmg-panel-toggle]');
      if (titleEl) {
        titleEl.setAttribute('aria-expanded', panelCollapsed ? 'false' : 'true');
        titleEl.setAttribute('title', panelCollapsed ? `点击展开${FOLDER_LABEL}面板` : `点击收起${FOLDER_LABEL}面板`);
      }
    }

    function togglePanelCollapsed(nextValue) {
      panelCollapsed = typeof nextValue === 'boolean' ? nextValue : !panelCollapsed;
      savePanelCollapsed();
      applyPanelCollapsedState(getHeaderEl());
    }

    function getGroupSignature() {
      return JSON.stringify(
        {
          groups: getGroups().map((group) => ({
            id: group.id,
            name: group.name,
            order: group.order
          })),
          ungroupedCount: collectItems().filter((item) => !store.assignments[item.id]).length
        }
      );
    }

    function populateGroupSelect(selectEl) {
      if (!selectEl) return;

      const nextSignature = getGroupSignature();
      const previousValue = selectedGroupId || UNGROUPED_ID;

      if (lastRenderedGroupSignature === nextSignature && selectEl.options.length > 0) {
        const stillExists = Array.from(selectEl.options).some((option) => option.value === previousValue);
        if (!stillExists) selectEl.value = selectEl.options[0]?.value || UNGROUPED_ID;
        return;
      }

      const groups = getGroups();
      selectEl.innerHTML = '';

      const ungroupedCount = collectItems().filter((item) => !store.assignments[item.id]).length;
      if (ungroupedCount > 0) {
        const ungroupedOption = document.createElement('option');
        ungroupedOption.value = UNGROUPED_ID;
        ungroupedOption.textContent = UNGROUPED_LABEL;
        selectEl.appendChild(ungroupedOption);
      }

      for (const group of groups) {
        const optionEl = document.createElement('option');
        optionEl.value = group.id;
        optionEl.textContent = group.name;
        selectEl.appendChild(optionEl);
      }

      selectEl.value = Array.from(selectEl.options).some((option) => option.value === previousValue)
        ? previousValue
        : (selectEl.options[0]?.value || '');
      selectedGroupId = selectEl.value || UNGROUPED_ID;
      lastRenderedGroupSignature = nextSignature;
    }

    function renderGroupManager(containerEl) {
      if (!containerEl) return;
      containerEl.innerHTML = `
        <div class="st-rmg-group-actions">
          <button type="button" class="menu_button interactable" id="${NEW_GROUP_ID}">新增${FOLDER_LABEL}</button>
          <button type="button" class="menu_button interactable" id="${MODULE_NAME}-${scope}-import-group-panel">导入${FOLDER_LABEL}</button>
          <button type="button" class="menu_button interactable" id="${RENAME_GROUP_ID}">重命名${FOLDER_LABEL}</button>
          <button type="button" class="menu_button interactable st-rmg-danger" id="${DELETE_GROUP_ID}">删除${FOLDER_LABEL}</button>
        </div>
        <select id="${GROUP_SELECT_ID}" class="text_pole st-rmg-group-select"></select>
      `;

      const selectEl = containerEl.querySelector(`#${GROUP_SELECT_ID}`);
      populateGroupSelect(selectEl);

      updateGroupActionState(containerEl);
    }

    function updateGroupActionState(containerEl) {
      if (!containerEl) return;

      const selectEl = containerEl.querySelector(`#${GROUP_SELECT_ID}`);
      selectedGroupId = String(selectEl?.value || UNGROUPED_ID);
      const canEditGroup = selectedGroupId !== UNGROUPED_ID && getGroups().some((group) => group.id === selectedGroupId);
      const renameBtn = containerEl.querySelector(`#${RENAME_GROUP_ID}`);
      const deleteBtn = containerEl.querySelector(`#${DELETE_GROUP_ID}`);
      if (renameBtn) renameBtn.disabled = !canEditGroup;
      if (deleteBtn) deleteBtn.disabled = !canEditGroup;
    }

    function renderGroupedList(items) {
      const listEl = getListEl();
      if (!listEl) return;

      const groups = getGroups();
      const itemsByGroup = new Map();
      itemsByGroup.set(UNGROUPED_ID, []);
      for (const group of groups) itemsByGroup.set(group.id, []);

      for (const item of items) {
        const groupId = store.assignments[item.id];
        if (groupId && itemsByGroup.has(groupId)) itemsByGroup.get(groupId).push(item);
        else itemsByGroup.get(UNGROUPED_ID).push(item);
      }

      for (const child of Array.from(listEl.children)) {
        if (child.classList.contains('st-rmg-group-header') || child.classList.contains('st-rmg-sort-anchor')) child.remove();
      }

      listEl.classList.add(GROUPING_CLASS);
      const fragment = document.createDocumentFragment();

      const showUngrouped = (itemsByGroup.get(UNGROUPED_ID) || []).length > 0;
      if (!showUngrouped && store.collapsed[UNGROUPED_ID]) {
        delete store.collapsed[UNGROUPED_ID];
        saveStore();
      }

      function pushHeader(groupId, title, count) {
        const header = document.createElement('div');
        header.className = 'st-rmg-group-header';
        header.dataset.groupId = groupId;
        if (groupId !== UNGROUPED_ID) {
          header.classList.add('st-rmg-folder-draggable');
        }
        const folderState = getFolderState(groupId, items);
        const toggleTitle = folderState === STATE_DISABLED ? `启用${FOLDER_LABEL}` : `关闭${FOLDER_LABEL}`;
        if (folderState === STATE_DISABLED) {
          header.classList.add('st-rmg-folder-disabled');
        }
        header.innerHTML = `
          <span class="st-rmg-folder-handle" draggable="true" title="拖动排序" aria-label="拖动排序">&#8801;</span>
          <span class="st-rmg-group-name">${escapeHtml(title)}</span>
          <span class="st-rmg-group-count">(${count})</span>
          ${groupId !== UNGROUPED_ID ? `
            <span class="st-rmg-folder-actions">
              <button type="button" class="menu_button interactable st-rmg-folder-action" data-folder-export="${escapeHtml(groupId)}" title="导出当前${FOLDER_LABEL}" aria-label="导出当前${FOLDER_LABEL}">
                <span class="st-rmg-folder-export-icon" aria-hidden="true">
                  <span class="st-rmg-folder-export-arrow">↑</span>
                  <span class="st-rmg-folder-export-tray"></span>
                </span>
              </button>
            </span>
          ` : ''}
          <button type="button" class="st-rmg-folder-switch ${folderState === STATE_DISABLED ? 'is-off' : 'is-on'}" data-folder-toggle="${escapeHtml(groupId)}" title="${escapeHtml(toggleTitle)}" aria-pressed="${folderState === STATE_DISABLED ? 'false' : 'true'}">
            <span class="st-rmg-folder-switch-track">
              <span class="st-rmg-folder-switch-thumb"></span>
            </span>
          </button>
          <span class="st-rmg-group-arrow">${store.collapsed[groupId] ? '>' : 'v'}</span>
        `;
        fragment.appendChild(header);

        const anchor = document.createElement('div');
        anchor.className = 'regex-script-label st-rmg-sort-anchor';
        anchor.id = `st-rmg-anchor-${scope}-${groupId}`;
        anchor.dataset.groupId = groupId;
        anchor.setAttribute('aria-hidden', 'true');
        fragment.appendChild(anchor);
      }

      function pushItem(item, hidden) {
        item.el.classList.toggle(HIDDEN_CLASS, hidden);
        const groupId = store.assignments[item.id] || UNGROUPED_ID;
        const isFolderDisabled = !!store.disabledFolders?.[groupId];
        item.el.classList.toggle('st-rmg-folder-item-disabled', isFolderDisabled);
        item.el.classList.toggle('st-rmg-folder-item-locked', isFolderDisabled);
        const disableCheckbox = item.el.querySelector?.('.disable_regex');
        if (disableCheckbox instanceof HTMLElement) {
          disableCheckbox.disabled = isFolderDisabled;
          disableCheckbox.title = isFolderDisabled ? `当前${FOLDER_LABEL}已关闭，无法单独切换` : '';
        }
        item.el.style.removeProperty('order');
        fragment.appendChild(item.el);
      }

      if (showUngrouped) {
        pushHeader(UNGROUPED_ID, UNGROUPED_LABEL, itemsByGroup.get(UNGROUPED_ID).length);
        for (const item of itemsByGroup.get(UNGROUPED_ID)) {
          pushItem(item, !!store.collapsed[UNGROUPED_ID]);
        }
      }

      for (const group of groups) {
        const groupItems = itemsByGroup.get(group.id) || [];
        pushHeader(group.id, group.name, groupItems.length);
        for (const item of groupItems) {
          pushItem(item, !!store.collapsed[group.id]);
        }
      }

      listEl.appendChild(fragment);
    }

    function syncAssignmentsFromRenderedLayout(listEl = getListEl()) {
      if (!listEl) return false;

      const validGroupIds = new Set(store.groups.map((group) => group.id));
      let currentGroupId = UNGROUPED_ID;
      let changed = false;

      for (const child of Array.from(listEl.children)) {
        if (child.classList?.contains('st-rmg-group-header')) {
          const groupId = String(child.dataset.groupId || UNGROUPED_ID);
          currentGroupId = groupId === UNGROUPED_ID || validGroupIds.has(groupId) ? groupId : UNGROUPED_ID;
          continue;
        }

        if (child.classList?.contains('st-rmg-sort-anchor')) continue;
        if (!child.classList?.contains('regex-script-label')) continue;

        const itemId = getItemId(child);
        const nextGroupId = currentGroupId === UNGROUPED_ID ? null : currentGroupId;
        const previousGroupId = store.assignments[itemId] ?? null;
        if (previousGroupId === nextGroupId) continue;

        if (nextGroupId === null) delete store.assignments[itemId];
        else store.assignments[itemId] = nextGroupId;
        changed = true;
      }

      if (changed) saveStore();
      return changed;
    }

    function syncNativeSortableOptions(listEl = getListEl()) {
      const $ = getJQuery();
      if (!listEl || typeof $ !== 'function' || !$.fn?.sortable) return;

      try {
        const sortable = $(listEl);
        if (!sortable.sortable('instance')) return;

        sortable.sortable('option', 'items', '> .regex-script-label:not(.st-rmg-hidden), > .st-rmg-sort-anchor');
        sortable.sortable('option', 'cancel', '.st-rmg-group-header');
        sortable.sortable('option', 'tolerance', 'pointer');
        sortable.sortable('refresh');
      } catch {
        // ignore
      }
    }

    function getPointerClientPosition(event) {
      const source = event?.originalEvent || event;
      const pageX = Number(source?.pageX ?? event?.pageX);
      const pageY = Number(source?.pageY ?? event?.pageY);
      const clientX = Number(source?.clientX ?? event?.clientX ?? (Number.isFinite(pageX) ? pageX - window.pageXOffset : NaN));
      const clientY = Number(source?.clientY ?? event?.clientY ?? (Number.isFinite(pageY) ? pageY - window.pageYOffset : NaN));

      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
      return { clientX, clientY };
    }

    function movePlaceholderIntoHoveredGroup(listEl, event, ui) {
      const placeholderEl = ui?.placeholder?.[0];
      if (!placeholderEl || typeof document.elementsFromPoint !== 'function') return;

      const pointer = getPointerClientPosition(event);
      if (!pointer) return;

      const hoveredElements = document.elementsFromPoint(pointer.clientX, pointer.clientY);
      const hoveredTarget = hoveredElements.find((el) => {
        if (!(el instanceof HTMLElement)) return false;
        if (el.classList.contains('ui-sortable-helper') || el.classList.contains('ui-sortable-placeholder')) return false;
        return !!el.closest('.st-rmg-group-header, .st-rmg-sort-anchor');
      });

      const groupMarkerEl = hoveredTarget?.closest?.('.st-rmg-group-header, .st-rmg-sort-anchor');
      if (!groupMarkerEl || groupMarkerEl.parentElement !== listEl) return;

      const anchorEl = groupMarkerEl.classList.contains('st-rmg-sort-anchor')
        ? groupMarkerEl
        : groupMarkerEl.nextElementSibling;

      if (!anchorEl?.classList?.contains('st-rmg-sort-anchor')) return;
      if (placeholderEl.nextElementSibling === anchorEl) return;

      anchorEl.insertAdjacentElement('beforebegin', placeholderEl);
    }

    function getGroupIdForListChild(listEl, childEl) {
      if (!(childEl instanceof HTMLElement) || childEl.parentElement !== listEl) return undefined;

      if (childEl.classList.contains('st-rmg-group-header')) {
        return String(childEl.dataset.groupId || UNGROUPED_ID);
      }

      if (childEl.classList.contains('st-rmg-sort-anchor')) {
        return String(childEl.dataset.groupId || UNGROUPED_ID);
      }

      if (childEl.classList.contains('regex-script-label')) {
        let probe = childEl.previousElementSibling;
        while (probe) {
          if (probe.classList?.contains('st-rmg-sort-anchor')) {
            return String(probe.dataset.groupId || UNGROUPED_ID);
          }
          if (probe.classList?.contains('st-rmg-group-header')) {
            return String(probe.dataset.groupId || UNGROUPED_ID);
          }
          probe = probe.previousElementSibling;
        }
        return UNGROUPED_ID;
      }

      return undefined;
    }

    function getGroupIdFromPointer(listEl, event) {
      if (typeof document.elementsFromPoint !== 'function') return undefined;

      const pointer = getPointerClientPosition(event);
      if (!pointer) return undefined;

      const hoveredElements = document.elementsFromPoint(pointer.clientX, pointer.clientY);
      for (const hoveredEl of hoveredElements) {
        if (!(hoveredEl instanceof HTMLElement)) continue;
        if (hoveredEl.classList.contains('ui-sortable-helper') || hoveredEl.classList.contains('ui-sortable-placeholder')) continue;

        const listChild = hoveredEl.closest('.st-rmg-group-header, .st-rmg-sort-anchor, .regex-script-label');
        const groupId = getGroupIdForListChild(listEl, listChild);
        if (groupId !== undefined) return groupId;
      }

      return undefined;
    }

    function getFolderHeaderByGroupId(listEl, groupId) {
      if (!listEl || !groupId) return null;
      return Array.from(listEl.querySelectorAll('.st-rmg-group-header')).find((headerEl) => headerEl.dataset.groupId === groupId) || null;
    }

    function clearFolderDropIndicators(listEl = getListEl()) {
      if (!listEl) return;
      for (const headerEl of listEl.querySelectorAll('.st-rmg-group-header')) {
        headerEl.classList.remove('st-rmg-folder-dragging', 'st-rmg-folder-drop-before', 'st-rmg-folder-drop-after');
      }
    }

    function updateFolderDropIndicator(listEl, targetGroupId, placeAfter) {
      clearFolderDropIndicators(listEl);

      if (draggingFolderId) {
        getFolderHeaderByGroupId(listEl, draggingFolderId)?.classList.add('st-rmg-folder-dragging');
      }

      if (!targetGroupId) return;
      const targetHeaderEl = getFolderHeaderByGroupId(listEl, targetGroupId);
      if (!targetHeaderEl) return;
      targetHeaderEl.classList.add(placeAfter ? 'st-rmg-folder-drop-after' : 'st-rmg-folder-drop-before');
    }

    function reorderFolders(draggedGroupId, targetGroupId, placeAfter) {
      if (!draggedGroupId || !targetGroupId || draggedGroupId === targetGroupId) return false;

      const orderedGroups = getGroups().map((group) => ({ ...group }));
      const draggedIndex = orderedGroups.findIndex((group) => group.id === draggedGroupId);
      if (draggedIndex < 0) return false;

      const [draggedGroup] = orderedGroups.splice(draggedIndex, 1);
      const targetIndex = orderedGroups.findIndex((group) => group.id === targetGroupId);
      if (targetIndex < 0) return false;

      const insertIndex = targetIndex + (placeAfter ? 1 : 0);
      orderedGroups.splice(insertIndex, 0, draggedGroup);
      store.groups = orderedGroups.map((group, index) => ({ ...group, order: index + 1 }));
      saveStore();
      renderTree();
      return true;
    }

    function bindNativeSortableEvents(listEl = getListEl()) {
      const $ = getJQuery();
      if (!listEl || typeof $ !== 'function' || !$.fn?.sortable) return;

      try {
        const sortable = $(listEl);
        const instance = sortable.sortable('instance');
        if (!instance) return;

        const currentStart = sortable.sortable('option', 'start');
        const currentSort = sortable.sortable('option', 'sort');
        const currentStop = sortable.sortable('option', 'stop');
        if (
          currentStart === listEl.__stRmgWrappedStart
          && currentSort === listEl.__stRmgWrappedSort
          && currentStop === listEl.__stRmgWrappedStop
        ) return;

        const originalStart = typeof currentStart === 'function' ? currentStart : null;
        const originalSort = typeof currentSort === 'function' ? currentSort : null;
        const originalStop = typeof currentStop === 'function' ? currentStop : null;

        const wrappedStart = function (event, ui) {
          sorting = true;
          sortingItemId = getItemId(ui?.item?.[0]);
          sortingTargetGroupId = undefined;
          pauseListObserver();
          return originalStart ? originalStart.call(this, event, ui) : undefined;
        };

        const wrappedSort = function (event, ui) {
          const hoveredGroupId = getGroupIdFromPointer(listEl, event);
          if (hoveredGroupId !== undefined) sortingTargetGroupId = hoveredGroupId;
          movePlaceholderIntoHoveredGroup(listEl, event, ui);
          return originalSort ? originalSort.call(this, event, ui) : undefined;
        };

        const wrappedStop = function (...args) {
          const previousGroupId = sortingItemId ? (store.assignments[sortingItemId] ?? null) : null;

          if (sortingItemId) {
            if (!sortingTargetGroupId || sortingTargetGroupId === UNGROUPED_ID) delete store.assignments[sortingItemId];
            else store.assignments[sortingItemId] = sortingTargetGroupId;
            saveStore();
          }

          syncAssignmentsFromRenderedLayout(listEl);
          const result = originalStop ? originalStop.apply(this, args) : undefined;

          Promise.resolve(result)
            .catch(() => {})
            .then(async () => {
              if (!sortingItemId) return;
              const nextGroupId = store.assignments[sortingItemId] ?? null;
              await syncItemDisabledStateForAssignmentChange(sortingItemId, previousGroupId, nextGroupId);
            })
            .finally(() => {
              sorting = false;
              sortingItemId = '';
              sortingTargetGroupId = undefined;
              schedule(() => {
                renderTree();
              });
            });

          return result;
        };

        listEl.__stRmgWrappedStart = wrappedStart;
        listEl.__stRmgWrappedSort = wrappedSort;
        listEl.__stRmgWrappedStop = wrappedStop;
        sortable.sortable('option', 'start', wrappedStart);
        sortable.sortable('option', 'sort', wrappedSort);
        sortable.sortable('option', 'stop', wrappedStop);
      } catch {
        // ignore
      }
    }

    async function addGroup() {
      const name = validateGroupName(await openPrompt(`输入${FOLDER_LABEL}名称，例如 A文件夹 / B文件夹`));
      if (!name) return;

      store.groups.push({
        id: uid('group'),
        name,
        order: store.groups.length + 1
      });
      saveStore();
      renderTree();
    }

    async function renameGroup(groupId) {
      const group = store.groups.find((entry) => entry.id === groupId);
      if (!group) return;

      const nextName = validateGroupName(await openPrompt(`输入新的${FOLDER_LABEL}名称`, group.name), group.id);
      if (!nextName) return;

      group.name = nextName;
      saveStore();
      renderTree();
    }

    async function deleteGroup(groupId) {
      const group = store.groups.find((entry) => entry.id === groupId);
      if (!group) return;

      const ok = await openConfirm(`删除${FOLDER_LABEL}“${group.name}”后，该${FOLDER_LABEL}中的正则会回到${UNGROUPED_LABEL}，是否继续？`);
      if (!ok) return;

      if (store.disabledFolders?.[groupId]) {
        delete store.disabledFolders[groupId];
        await applyFolderDisabledState(groupId, true, collectItems());
      }
      delete store.disabledSnapshots[groupId];

      store.groups = store.groups.filter((entry) => entry.id !== groupId);
      for (const [itemId, assignedGroupId] of Object.entries(store.assignments)) {
        if (assignedGroupId === groupId) delete store.assignments[itemId];
      }
      delete store.collapsed[groupId];
      saveStore();
      renderTree();
    }

    async function renderTree() {
      const headerEl = getHeaderEl();
      const listEl = getListEl();
      if (!headerEl || !listEl) return;

      loadStoreForCurrentContext();
      pauseListObserver();
      rendering = true;
      try {
        const items = collectItems(listEl);
        migrateLegacyAssignments(items);
        if (alignImportedAssignments(items)) saveStore();
        cleanupAssignments(items);
        renderGroupedList(items);
        syncNativeSortableOptions(listEl);
        bindNativeSortableEvents(listEl);
        renderGroupManager(headerEl.querySelector('.st-rmg-group-manager'));
      } finally {
        rendering = false;
        startListObserver(listEl);
        if (pendingViewportRestore) {
          const restoreState = pendingViewportRestore;
          pendingViewportRestore = null;
          schedule(() => {
            restoreViewportState(restoreState);
          });
        }
      }
    }

    function bindHeaderEvents(headerEl) {
      const panelToggleEl = headerEl.querySelector('[data-st-rmg-panel-toggle]');
      panelToggleEl?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        togglePanelCollapsed();
      });

      panelToggleEl?.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        e.stopPropagation();
        togglePanelCollapsed();
      });

      headerEl.addEventListener('change', (e) => {
        if (e.target?.matches?.(`#${GROUP_SELECT_ID}`)) {
          updateGroupActionState(headerEl.querySelector('.st-rmg-group-manager'));
        }
      });

      headerEl.addEventListener('click', (e) => {
        const addBtn = e.target?.closest?.(`#${NEW_GROUP_ID}`);
        if (addBtn) {
          e.preventDefault();
          e.stopPropagation();
          addGroup();
          return;
        }

        const importPanelBtn = e.target?.closest?.(`#${MODULE_NAME}-${scope}-import-group-panel`);
        if (importPanelBtn) {
          e.preventDefault();
          e.stopPropagation();
          void importGroup();
          return;
        }

        const renameBtn = e.target?.closest?.(`#${RENAME_GROUP_ID}`);
        if (renameBtn) {
          e.preventDefault();
          e.stopPropagation();
          const selectEl = headerEl.querySelector(`#${GROUP_SELECT_ID}`);
          renameGroup(String(selectEl?.value || ''));
          return;
        }

        const deleteBtn = e.target?.closest?.(`#${DELETE_GROUP_ID}`);
        if (deleteBtn) {
          e.preventDefault();
          e.stopPropagation();
          const selectEl = headerEl.querySelector(`#${GROUP_SELECT_ID}`);
          deleteGroup(String(selectEl?.value || ''));
          return;
        }

      });
    }

    function bindListEvents(listEl) {
      if (listEl.dataset.stRmgBound === '1') return;
      listEl.dataset.stRmgBound = '1';

      listEl.addEventListener('click', (e) => {
        const exportBtn = e.target?.closest?.('[data-folder-export]');
        if (exportBtn) {
          e.preventDefault();
          e.stopPropagation();
          const groupId = String(exportBtn.dataset.folderExport || '');
          if (groupId) void exportGroup(groupId);
          return;
        }

        const toggleBtn = e.target?.closest?.('[data-folder-toggle]');
        if (toggleBtn) {
          e.preventDefault();
          e.stopPropagation();
          toggleBtn.blur?.();
          const groupId = String(toggleBtn.dataset.folderToggle || UNGROUPED_ID);
          const enabled = toggleBtn.classList.contains('is-off');
          void setFolderEnabled(groupId, enabled);
          return;
        }

        if (e.target?.closest?.('.st-rmg-folder-handle')) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        const headerEl = e.target?.closest?.('.st-rmg-group-header');
        if (!headerEl) return;

        if (Date.now() - lastFolderDragEndedAt < 250) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        e.preventDefault();
        e.stopPropagation();

        const groupId = String(headerEl.dataset.groupId || UNGROUPED_ID);
        store.collapsed[groupId] = !store.collapsed[groupId];
        saveStore();
        renderTree();
      });

      listEl.addEventListener('dragstart', (e) => {
        const handleEl = e.target?.closest?.('.st-rmg-folder-handle');
        if (!handleEl) return;

        const headerEl = handleEl.closest('.st-rmg-group-header.st-rmg-folder-draggable');
        if (!headerEl) return;

        draggingFolderId = String(headerEl.dataset.groupId || '');
        folderDropTargetId = '';
        folderDropAfter = false;
        updateFolderDropIndicator(listEl, '', false);

        try {
          e.dataTransfer?.setData?.('text/plain', draggingFolderId);
          if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        } catch {
          // ignore
        }
      });

      listEl.addEventListener('dragover', (e) => {
        if (!draggingFolderId) return;

        const targetHeaderEl = e.target?.closest?.('.st-rmg-group-header.st-rmg-folder-draggable');
        if (!targetHeaderEl) {
          updateFolderDropIndicator(listEl, '', false);
          return;
        }

        const targetGroupId = String(targetHeaderEl.dataset.groupId || '');
        if (!targetGroupId || targetGroupId === draggingFolderId) {
          updateFolderDropIndicator(listEl, '', false);
          return;
        }

        e.preventDefault();
        const rect = targetHeaderEl.getBoundingClientRect();
        const placeAfter = Number(e.clientY) > rect.top + rect.height / 2;
        folderDropTargetId = targetGroupId;
        folderDropAfter = placeAfter;
        updateFolderDropIndicator(listEl, targetGroupId, placeAfter);

        try {
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        } catch {
          // ignore
        }
      });

      listEl.addEventListener('drop', (e) => {
        if (!draggingFolderId) return;
        if (!folderDropTargetId || folderDropTargetId === draggingFolderId) return;

        e.preventDefault();
        e.stopPropagation();
        lastFolderDragEndedAt = Date.now();
        clearFolderDropIndicators(listEl);
        reorderFolders(draggingFolderId, folderDropTargetId, folderDropAfter);
        draggingFolderId = '';
        folderDropTargetId = '';
        folderDropAfter = false;
      });

      listEl.addEventListener('dragend', () => {
        if (!draggingFolderId) return;
        lastFolderDragEndedAt = Date.now();
        draggingFolderId = '';
        folderDropTargetId = '';
        folderDropAfter = false;
        clearFolderDropIndicators(listEl);
      });
    }

    function startListObserver(listEl) {
      if (listObserver) listObserver.disconnect();
      if (!listEl || typeof MutationObserver !== 'function') return;

      let scheduled = false;
      listObserver = new MutationObserver(() => {
        if (rendering || sorting || scheduled) return;
        scheduled = true;
        schedule(() => {
          scheduled = false;
          renderTree();
        });
      });

      listObserver.observe(listEl, { childList: true, subtree: true, characterData: true });
    }

    function ensureMounted() {
      const blockEl = getBlockEl();
      const listEl = getListEl();
      if (!blockEl || !listEl) return false;

      let headerEl = getHeaderEl();
      if (!headerEl) {
        headerEl = document.createElement('div');
        headerEl.id = HEADER_ID;
        headerEl.className = 'st-rmg-header';
        headerEl.innerHTML = `
          <div class="st-rmg-title-row st-rmg-panel-toggle" data-st-rmg-panel-toggle role="button" tabindex="0" aria-expanded="true">
            <div class="st-rmg-title-main">
              <span class="st-rmg-panel-arrow" data-st-rmg-panel-arrow>▼</span>
              <b>${escapeHtml(titleText)}${FOLDER_LABEL}</b>
            </div>
          </div>
          <div class="st-rmg-panel-body">
            <div class="st-rmg-toolbar">
              <div class="st-rmg-group-manager"></div>
            </div>
          </div>
        `;
        blockEl.insertAdjacentElement('afterbegin', headerEl);
        bindHeaderEvents(headerEl);
      }

      applyPanelCollapsedState(headerEl);
      bindListEvents(listEl);
      renderTree();
      return true;
    }

    function tryEnsure() {
      if (ensureMounted()) return;
      if (domObserver || typeof MutationObserver !== 'function') return;

      const root = document.body || document.documentElement;
      if (!root) return;

      domObserver = new MutationObserver(() => {
        if (ensureMounted() && domObserver) {
          domObserver.disconnect();
          domObserver = null;
        }
      });

      domObserver.observe(root, { childList: true, subtree: true });
    }

    return { tryEnsure };
  }

  function init() {
    const ctx = getCtx();
    if (!ctx) {
      warn('SillyTavern context not found.');
      return;
    }

    const { eventSource, event_types } = ctx;
    const controllers = [
      createPanelController({ scope: 'global', blockId: 'global_scripts_block', listId: 'saved_regex_scripts', titleText: '全局正则' }),
      createPanelController({ scope: 'preset', blockId: 'preset_scripts_block', listId: 'saved_preset_scripts', titleText: '预设正则' }),
      createPanelController({ scope: 'scoped', blockId: 'scoped_scripts_block', listId: 'saved_scoped_scripts', titleText: '局部正则' })
    ];

    const ensureAll = () => controllers.forEach((controller) => controller.tryEnsure());

    eventSource?.on?.(event_types.APP_READY, ensureAll);
    if (event_types?.SETTINGS_LOADED) eventSource?.on?.(event_types.SETTINGS_LOADED, ensureAll);
    if (event_types?.CHAT_CHANGED) eventSource?.on?.(event_types.CHAT_CHANGED, ensureAll);
    if (event_types?.PRESET_CHANGED) eventSource?.on?.(event_types.PRESET_CHANGED, ensureAll);

    ensureAll();
    log('initialized');
  }

  init();
})();
