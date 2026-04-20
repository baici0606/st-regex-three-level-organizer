(function () {
  'use strict';

  const root = window.STRegexManualGroups = window.STRegexManualGroups || {};
  if (root.features?.panelController) return;

  const {
    MODULE_NAME,
    UNGROUPED_ID,
    GROUPING_CLASS,
    HIDDEN_CLASS,
    FOLDER_LABEL,
    UNGROUPED_LABEL,
    STATE_ENABLED,
    STATE_DISABLED,
    EXPORT_BUNDLE_TYPE,
    EXPORT_BUNDLE_VERSION,
    EXPORT_FILE_EXTENSION,
  } = root.constants;

  const {
    schedule,
    getCtx,
    loadJson,
    saveJson,
    toast,
    normalizeName,
    escapeHtml,
    uid,
    keySegment,
    cloneJsonData,
    getScriptName,
    getItemKeyCandidate,
    getItemId,
    getDirectScriptItems,
    getJQuery,
    openPrompt,
    openConfirm,
    downloadTextFile,
    pickImportFile,
    readFileText,
  } = root.utils;

  const {
    createDefaultStore,
    getSortedGroups,
    getRegexPresetManager,
    getStoreKey,
    loadStoreForScope,
    saveStoreByKey,
  } = root.store;

  function createPanelController({ scope, blockId, listId, titleText }) {
    const HEADER_ID = `${MODULE_NAME}-${scope}-header`;
    const PANEL_COLLAPSED_KEY = `${MODULE_NAME}:${scope}:panel-collapsed`;
    const GROUP_SELECT_ID = `${MODULE_NAME}-${scope}-group-select`;
    const NEW_GROUP_ID = `${MODULE_NAME}-${scope}-new-group`;
    const IMPORT_GROUP_PANEL_ID = `${MODULE_NAME}-${scope}-import-group-panel`;
    const RENAME_GROUP_ID = `${MODULE_NAME}-${scope}-rename-group`;
    const DELETE_GROUP_ID = `${MODULE_NAME}-${scope}-delete-group`;
    const DELETE_GROUP_WITH_SCRIPTS_ID = `${MODULE_NAME}-${scope}-delete-group-with-scripts`;

    let store = createDefaultStore();
    let currentStoreKey = '';
    let rendering = false;
    let domObserver = null;
    let sorting = false;
    let sortingItemId = '';
    let sortingTargetGroupId = undefined;
    let sortingHighlightGroupId = '';
    let draggingFolderId = '';
    let folderDropTargetId = '';
    let folderDropAfter = false;
    let lastFolderDragEndedAt = 0;
    let panelCollapsed = !!loadJson(PANEL_COLLAPSED_KEY, false);

    function getBlockEl() {
      return document.getElementById(blockId);
    }

    function getListEl() {
      return document.getElementById(listId);
    }

    function getHeaderEl() {
      return document.getElementById(HEADER_ID);
    }

    function loadStoreForCurrentContext() {
      const nextStoreKey = getStoreKey(scope);
      if (nextStoreKey === currentStoreKey) return;

      const loaded = loadStoreForScope(scope);
      currentStoreKey = loaded.key;
      store = loaded.store;
    }

    function saveStore() {
      if (!currentStoreKey) currentStoreKey = getStoreKey(scope);
      saveStoreByKey(currentStoreKey, store);
    }

    function savePanelCollapsed() {
      saveJson(PANEL_COLLAPSED_KEY, !!panelCollapsed);
    }

    function getGroups() {
      return getSortedGroups(store.groups);
    }

    function getGroupById(groupId) {
      return store.groups.find((group) => group.id === groupId) || null;
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
        const presetScripts = readPresetScripts(ctx);
        if (Array.isArray(presetScripts)) return presetScripts;

        const presets = ctx?.extensionSettings?.regex_presets;
        if (Array.isArray(presets)) {
          const selectedPreset = presets.find((preset) => preset?.isSelected) || presets[0];
          if (Array.isArray(selectedPreset?.regex_scripts)) return selectedPreset.regex_scripts;
        }

        return [];
      }

      return [];
    }

    function getSelectedPresetContext(ctx = getCtx()) {
      const presetManager = getRegexPresetManager(ctx);
      const presetName = presetManager?.getSelectedPresetName?.();
      if (!presetManager || !presetName) {
        return { presetManager: null, presetName: '' };
      }

      return {
        presetManager,
        presetName: String(presetName),
      };
    }

    function readPresetScripts(ctx = getCtx()) {
      const { presetManager, presetName } = getSelectedPresetContext(ctx);
      if (!presetManager || !presetName) return null;

      const presetScripts = presetManager.readPresetExtensionField({ name: presetName, path: 'regex_scripts' })
        ?? presetManager.readPresetExtensionField({ path: 'regex_scripts' });

      return Array.isArray(presetScripts) ? presetScripts : [];
    }

    async function writePresetScripts(nextScripts, ctx = getCtx()) {
      const { presetManager, presetName } = getSelectedPresetContext(ctx);
      if (!presetManager || !presetName) {
        toast('当前没有可用的预设接口或未选中预设，无法保存预设正则', 'warning');
        return false;
      }

      await presetManager.writePresetExtensionField({ name: presetName, path: 'regex_scripts', value: nextScripts });
      const verifiedScripts = readPresetScripts(ctx);
      if (!Array.isArray(verifiedScripts)) {
        toast('预设正则写入后读回失败', 'error');
        return false;
      }

      return true;
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
        if (characterId === undefined || characterId === null) {
          toast('请先在 ST 中选中一个角色', 'warning');
          return;
        }

        if (typeof ctx?.writeExtensionField === 'function') {
          await ctx.writeExtensionField(characterId, 'regex_scripts', nextScripts);
        } else if (ctx?.characters?.[characterId]) {
          const charData = ctx.characters[characterId];
          if (!charData.data) charData.data = {};
          if (!charData.data.extensions) charData.data.extensions = {};
          charData.data.extensions.regex_scripts = nextScripts;
          ctx?.saveSettingsDebounced?.();
        }
        return;
      }

      if (scriptType === 2) {
        const wrotePreset = await writePresetScripts(nextScripts, ctx);
        if (wrotePreset) {
          return;
        }
        toast('预设正则保存失败：未找到可用的 preset manager 接口', 'error');
        return;
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

    function collectItems(listEl = getListEl()) {
      return getDirectScriptItems(listEl).map((itemEl) => ({
        el: itemEl,
        id: getItemId(itemEl),
        keyCandidate: normalizeName(getItemKeyCandidate(itemEl)),
        name: getScriptName(itemEl),
      }));
    }

    function ensureScriptIds(currentScripts) {
      let changed = false;
      const nextScripts = currentScripts.map((script) => {
        if (!script || typeof script !== 'object') return script;
        if (normalizeName(script.id)) return script;
        changed = true;
        return { ...script, id: uid('regex') };
      });
      return { changed, nextScripts };
    }

    async function ensureScriptsReady(ctx = getCtx()) {
      const currentScripts = getScriptsByCurrentScope(ctx);
      if (!Array.isArray(currentScripts)) return [];

      const { changed, nextScripts } = ensureScriptIds(currentScripts);
      if (changed) {
        await saveScriptsForCurrentScope(nextScripts, ctx);
        await reloadRegexUi(ctx);
        return getScriptsByCurrentScope(ctx);
      }

      return currentScripts;
    }

    function getScriptByItem(item, currentScripts) {
      const scriptId = normalizeName(item?.keyCandidate) || (normalizeName(item?.id).startsWith('dom:') ? normalizeName(item.id).slice(4) : '');
      if (!scriptId) return null;
      return currentScripts.find((script) => normalizeName(script?.id) === scriptId) || null;
    }

    function pruneStore(items = collectItems(), currentScripts = getScriptsByCurrentScope()) {
      const normalizedGroups = getSortedGroups(store.groups).map((group, index) => ({
        ...group,
        order: index + 1,
      }));
      const validGroupIds = new Set(normalizedGroups.map((group) => group.id));
      const validScriptIds = new Set(currentScripts.map((script) => normalizeName(script?.id)).filter(Boolean));
      const nextAssignments = {};

      for (const item of items) {
        const script = getScriptByItem(item, currentScripts);
        const scriptId = normalizeName(script?.id);
        if (!scriptId) continue;
        const assignedGroupId = store.assignments[`dom:${scriptId}`] || store.assignments[item.id];
        if (assignedGroupId && validGroupIds.has(assignedGroupId)) {
          nextAssignments[`dom:${scriptId}`] = assignedGroupId;
        }
      }

      store.assignments = nextAssignments;
      store.collapsed = Object.fromEntries(
        Object.entries(store.collapsed || {}).filter(([groupId]) => groupId === UNGROUPED_ID || validGroupIds.has(groupId)),
      );
      store.disabledFolders = Object.fromEntries(
        Object.entries(store.disabledFolders || {}).filter(([groupId]) => groupId === UNGROUPED_ID || validGroupIds.has(groupId)),
      );
      store.groups = normalizedGroups;

      for (const scriptId of Object.keys(store.assignments)) {
        if (!scriptId.startsWith('dom:')) delete store.assignments[scriptId];
        const pureScriptId = scriptId.slice(4);
        if (!validScriptIds.has(pureScriptId)) delete store.assignments[scriptId];
      }
    }

    function getAssignedGroupIdForScriptId(scriptId) {
      return store.assignments[`dom:${scriptId}`] || null;
    }

    function setAssignedGroupIdForScriptId(scriptId, groupId) {
      const itemId = `dom:${scriptId}`;
      if (!groupId || groupId === UNGROUPED_ID) delete store.assignments[itemId];
      else store.assignments[itemId] = groupId;
    }

    function getFolderState(groupId) {
      return store.disabledFolders?.[groupId] ? STATE_DISABLED : STATE_ENABLED;
    }

    function applyFolderStateToItem(item, groupId) {
      const isDisabled = !!store.disabledFolders?.[groupId];
      item.el.classList.toggle('st-rmg-folder-item-disabled', isDisabled);
      item.el.classList.toggle('st-rmg-folder-item-locked', isDisabled);

      const disableCheckbox = item.el.querySelector?.('.disable_regex');
      if (disableCheckbox instanceof HTMLInputElement) {
        disableCheckbox.disabled = isDisabled;
        disableCheckbox.title = isDisabled ? `当前${FOLDER_LABEL}已关闭，无法单独切换` : '';
      }
    }

    async function setFolderEnabled(groupId, enabled) {
      const ctx = getCtx();
      const currentScripts = await ensureScriptsReady(ctx);
      if (!Array.isArray(currentScripts)) return;

      const targetScriptIds = new Set(
        currentScripts
          .map((script) => normalizeName(script?.id))
          .filter(Boolean)
          .filter((scriptId) => {
            const assignedGroupId = getAssignedGroupIdForScriptId(scriptId) || UNGROUPED_ID;
            return assignedGroupId === groupId;
          }),
      );

      if (enabled) delete store.disabledFolders[groupId];
      else store.disabledFolders[groupId] = true;
      saveStore();

      let changedCount = 0;
      const nextScripts = currentScripts.map((script) => {
        const scriptId = normalizeName(script?.id);
        if (!scriptId || !targetScriptIds.has(scriptId)) return script;
        const nextDisabled = !enabled;
        if (!!script.disabled === nextDisabled) return script;
        changedCount += 1;
        return { ...script, disabled: nextDisabled };
      });

      if (changedCount > 0) {
        await saveScriptsForCurrentScope(nextScripts, ctx);
        await reloadRegexUi(ctx);
      }

      await renderTree();
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

      const duplicate = store.groups.find((group) => group.id !== excludeGroupId && normalizeName(group.name) === normalized);
      if (duplicate) {
        toast(`已存在同名${FOLDER_LABEL}`, 'warning');
        return '';
      }

      return normalized;
    }

    async function addGroup() {
      const result = await openPrompt(`输入${FOLDER_LABEL}名称，例如 A文件夹 / B文件夹`);
      if (result === null) return;
      const name = validateGroupName(result);
      if (!name) return;

      store.groups.push({
        id: uid('group'),
        name,
        order: store.groups.length + 1,
      });
      saveStore();
      renderTree();
    }

    async function renameGroup(groupId) {
      const group = getGroupById(groupId);
      if (!group) return;

      const result = await openPrompt(`输入新的${FOLDER_LABEL}名称`, group.name);
      if (result === null) return;
      const nextName = validateGroupName(result, group.id);
      if (!nextName) return;

      group.name = nextName;
      saveStore();
      renderTree();
    }

    async function deleteGroup(groupId) {
      const group = getGroupById(groupId);
      if (!group) return;

      const ok = await openConfirm(`删除${FOLDER_LABEL}“${group.name}”后，其中正则会回到${UNGROUPED_LABEL}，是否继续？`);
      if (!ok) return;

      store.groups = store.groups.filter((entry) => entry.id !== groupId);
      delete store.collapsed[groupId];
      delete store.disabledFolders[groupId];

      for (const [scriptId, assignedGroupId] of Object.entries(store.assignments)) {
        if (assignedGroupId === groupId) delete store.assignments[scriptId];
      }

      saveStore();
      await renderTree();
    }

    async function deleteGroupAndScripts(groupId) {
      const group = getGroupById(groupId);
      if (!group || groupId === UNGROUPED_ID) return;

      const ctx = getCtx();
      const currentScripts = await ensureScriptsReady(ctx);
      const targetScriptIds = new Set(
        currentScripts
          .map((script) => normalizeName(script?.id))
          .filter(Boolean)
          .filter((scriptId) => getAssignedGroupIdForScriptId(scriptId) === groupId),
      );

      const ok = await openConfirm(`删除${FOLDER_LABEL}“${group.name}”以及其中 ${targetScriptIds.size} 条正则后将无法恢复，是否继续？`);
      if (!ok) return;

      const nextScripts = currentScripts.filter((script) => !targetScriptIds.has(normalizeName(script?.id)));
      await saveScriptsForCurrentScope(nextScripts, ctx);

      store.groups = store.groups.filter((entry) => entry.id !== groupId);
      delete store.collapsed[groupId];
      delete store.disabledFolders[groupId];
      for (const scriptId of Array.from(targetScriptIds)) {
        delete store.assignments[`dom:${scriptId}`];
      }

      saveStore();
      await reloadRegexUi(ctx);
      await renderTree();
    }

    function buildExportFileName(groupName) {
      return `${keySegment(groupName, 'regex-folder')}${EXPORT_FILE_EXTENSION}`;
    }

    async function exportGroup(groupId) {
      const group = getGroupById(groupId);
      if (!group) return;

      const currentScripts = getScriptsByCurrentScope();
      const scripts = currentScripts
        .filter((script) => getAssignedGroupIdForScriptId(normalizeName(script?.id)) === groupId)
        .map((script) => cloneJsonData(script, null))
        .filter(Boolean);

      if (scripts.length < 1) {
        toast(`当前${FOLDER_LABEL}内没有可导出的正则`, 'warning');
        return;
      }

      const payload = {
        type: EXPORT_BUNDLE_TYPE,
        version: EXPORT_BUNDLE_VERSION,
        source: {
          module: MODULE_NAME,
          scope,
          title: titleText,
          exportedAt: new Date().toISOString(),
        },
        group: {
          name: group.name,
          disabled: !!store.disabledFolders?.[groupId],
          collapsed: !!store.collapsed?.[groupId],
        },
        scripts,
      };

      try {
        const exported = await downloadTextFile(buildExportFileName(group.name), JSON.stringify(payload, null, 2));
        if (exported) toast(`已导出${FOLDER_LABEL}“${group.name}”`, 'success');
      } catch (error) {
        toast(error?.message || '导出失败', 'error');
      }
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

      const group = parsed.group && typeof parsed.group === 'object' ? parsed.group : null;
      if (!group) throw new Error('导入文件缺少文件夹信息');

      const scripts = Array.isArray(parsed.scripts)
        ? parsed.scripts.map((script) => cloneJsonData(script, null)).filter((script) => script && typeof script === 'object')
        : [];
      if (scripts.length < 1) throw new Error('导入文件中没有可用的正则数据');

      return {
        group: {
          name: normalizeName(group.name) || `导入${FOLDER_LABEL}`,
          disabled: !!group.disabled,
          collapsed: !!group.collapsed,
        },
        scripts,
      };
    }

    async function importGroup(anchorGroupId = '') {
      const file = await pickImportFile(`${EXPORT_FILE_EXTENSION},application/json,.json`);
      if (!file) return;

      let bundle = null;
      try {
        bundle = parseImportBundle(await readFileText(file));
      } catch (error) {
        toast(error?.message || '导入失败', 'error');
        return;
      }

      const ctx = getCtx();
      const currentScripts = await ensureScriptsReady(ctx);
      if (!Array.isArray(currentScripts)) {
        toast('当前范围的正则列表不可用，导入失败', 'error');
        return;
      }

      if (getScriptType() === 1 && (ctx?.characterId === undefined || ctx?.characterId === null)) {
        toast('请先在 ST 中选中一个角色，然后再向局部正则导入文件夹', 'warning');
        return;
      }

      if (getScriptType() === 2) {
        const { presetManager, presetName } = getSelectedPresetContext(ctx);
        if (!presetManager || !presetName) {
          toast('当前没有可用的预设接口或未选中预设，无法导入文件夹', 'warning');
          return;
        }
      }

      const nextGroupId = uid('group');
      const nextGroupName = validateGroupName(bundle.group.name) || `${bundle.group.name}（导入）`;

      const existingScriptIds = new Set(currentScripts.map((script) => normalizeName(script?.id)).filter(Boolean));
      const importedScripts = bundle.scripts.map((script) => {
        const nextScript = { ...script };
        let nextScriptId = normalizeName(nextScript.id);
        while (!nextScriptId || existingScriptIds.has(nextScriptId)) {
          nextScriptId = uid('regex');
        }
        existingScriptIds.add(nextScriptId);
        nextScript.id = nextScriptId;
        nextScript.disabled = !!bundle.group.disabled;
        return nextScript;
      });

      store.groups.push({
        id: nextGroupId,
        name: nextGroupName,
        order: store.groups.length + 1,
      });
      if (bundle.group.collapsed) store.collapsed[nextGroupId] = true;
      if (bundle.group.disabled) store.disabledFolders[nextGroupId] = true;
      for (const script of importedScripts) {
        setAssignedGroupIdForScriptId(normalizeName(script.id), nextGroupId);
      }

      saveStore();
      const nextScripts = currentScripts.concat(importedScripts);
      await saveScriptsForCurrentScope(nextScripts, ctx);

      if (getScriptType() === 2) {
        const verifiedScripts = readPresetScripts(ctx);
        const importedIds = new Set(importedScripts.map((script) => normalizeName(script.id)).filter(Boolean));
        const verifiedCount = Array.isArray(verifiedScripts)
          ? verifiedScripts.filter((script) => importedIds.has(normalizeName(script?.id))).length
          : 0;
        if (verifiedCount !== importedIds.size) {
          toast(`预设正则导入不完整：期望 ${importedIds.size} 条，实际写入 ${verifiedCount} 条`, 'error');
          return;
        }
      }

      await reloadRegexUi(ctx);
      await renderTree();
      toast(`已导入${FOLDER_LABEL}“${nextGroupName}”`, 'success');
    }

    function applyPanelCollapsedState(headerEl) {
      if (!headerEl) return;
      headerEl.classList.toggle('st-rmg-panel-collapsed', !!panelCollapsed);
      const arrowEl = headerEl.querySelector('[data-st-rmg-panel-arrow]');
      if (arrowEl) arrowEl.textContent = panelCollapsed ? '▶' : '▼';
    }

    function togglePanelCollapsed(nextValue) {
      panelCollapsed = typeof nextValue === 'boolean' ? nextValue : !panelCollapsed;
      savePanelCollapsed();
      applyPanelCollapsedState(getHeaderEl());
    }

    function populateGroupSelect(selectEl) {
      if (!selectEl) return;
      selectEl.innerHTML = '';

      const ungroupedOption = document.createElement('option');
      ungroupedOption.value = UNGROUPED_ID;
      ungroupedOption.textContent = UNGROUPED_LABEL;
      selectEl.appendChild(ungroupedOption);

      for (const group of getGroups()) {
        const optionEl = document.createElement('option');
        optionEl.value = group.id;
        optionEl.textContent = group.name;
        selectEl.appendChild(optionEl);
      }
    }

    function renderGroupManager(containerEl) {
      if (!containerEl) return;

      containerEl.innerHTML = `
        <div class="st-rmg-group-actions st-rmg-group-actions-primary">
          <button type="button" class="menu_button interactable" id="${NEW_GROUP_ID}">新增${FOLDER_LABEL}</button>
          <button type="button" class="menu_button interactable" id="${IMPORT_GROUP_PANEL_ID}">导入${FOLDER_LABEL}</button>
          <button type="button" class="menu_button interactable" id="${RENAME_GROUP_ID}">重命名${FOLDER_LABEL}</button>
        </div>
        <div class="st-rmg-group-actions st-rmg-group-actions-danger">
          <button type="button" class="menu_button interactable st-rmg-danger" id="${DELETE_GROUP_ID}">删除${FOLDER_LABEL}</button>
          <button type="button" class="menu_button interactable st-rmg-danger" id="${DELETE_GROUP_WITH_SCRIPTS_ID}">删除${FOLDER_LABEL}及正则</button>
        </div>
        <select id="${GROUP_SELECT_ID}" class="text_pole st-rmg-group-select"></select>
      `;

      populateGroupSelect(containerEl.querySelector(`#${GROUP_SELECT_ID}`));
      updateGroupActionState(containerEl);
    }

    function updateGroupActionState(containerEl) {
      if (!containerEl) return;
      const selectedGroupId = String(containerEl.querySelector(`#${GROUP_SELECT_ID}`)?.value || UNGROUPED_ID);
      const canEditGroup = selectedGroupId !== UNGROUPED_ID && !!getGroupById(selectedGroupId);
      for (const buttonId of [RENAME_GROUP_ID, DELETE_GROUP_ID, DELETE_GROUP_WITH_SCRIPTS_ID]) {
        const btn = containerEl.querySelector(`#${buttonId}`);
        if (btn) btn.disabled = !canEditGroup;
      }
    }

    function renderGroupedList(items, currentScripts) {
      const listEl = getListEl();
      if (!listEl) return;

      for (const child of Array.from(listEl.children)) {
        if (child.classList.contains('st-rmg-group-header') || child.classList.contains('st-rmg-sort-anchor')) child.remove();
      }

      const itemsByGroup = new Map();
      itemsByGroup.set(UNGROUPED_ID, []);
      for (const group of getGroups()) itemsByGroup.set(group.id, []);

      for (const item of items) {
        const script = getScriptByItem(item, currentScripts);
        const scriptId = normalizeName(script?.id);
        const groupId = scriptId ? (getAssignedGroupIdForScriptId(scriptId) || UNGROUPED_ID) : UNGROUPED_ID;
        if (itemsByGroup.has(groupId)) itemsByGroup.get(groupId).push(item);
        else itemsByGroup.get(UNGROUPED_ID).push(item);
      }

      listEl.classList.add(GROUPING_CLASS);
      const fragment = document.createDocumentFragment();

      function pushHeader(groupId, title, count) {
        const isUngrouped = groupId === UNGROUPED_ID;
        const folderState = getFolderState(groupId);
        const header = document.createElement('div');
        header.className = `st-rmg-group-header${isUngrouped ? ' st-rmg-system-folder' : ' st-rmg-folder-draggable'}`;
        if (folderState === STATE_DISABLED) header.classList.add('st-rmg-folder-disabled');
        header.dataset.groupId = groupId;
        header.innerHTML = `
          <span class="st-rmg-folder-handle" draggable="${isUngrouped ? 'false' : 'true'}" title="${isUngrouped ? `${UNGROUPED_LABEL}不可拖动` : '拖动排序'}" aria-label="${isUngrouped ? `${UNGROUPED_LABEL}不可拖动` : '拖动排序'}">&#8801;</span>
          <span class="st-rmg-group-labels">
            <span class="st-rmg-group-name">${escapeHtml(title)}</span>
            <span class="st-rmg-group-count">(${count})</span>
          </span>
          <span class="st-rmg-folder-controls">
            <span class="${isUngrouped ? 'st-rmg-folder-actions is-placeholder' : 'st-rmg-folder-actions'}">
              <button type="button" class="menu_button interactable st-rmg-folder-action${isUngrouped ? ' st-rmg-folder-action-placeholder' : ''}" ${isUngrouped ? 'disabled data-folder-export-disabled="true"' : `data-folder-export="${escapeHtml(groupId)}"`} title="${isUngrouped ? `${UNGROUPED_LABEL}不可导出` : `导出当前${FOLDER_LABEL}`}">
                <span class="st-rmg-folder-export-icon" aria-hidden="true">
                  <span class="st-rmg-folder-export-arrow">↑</span>
                  <span class="st-rmg-folder-export-tray"></span>
                </span>
              </button>
            </span>
            <button type="button" class="st-rmg-folder-switch ${folderState === STATE_DISABLED ? 'is-off' : 'is-on'}" data-folder-toggle="${escapeHtml(groupId)}" aria-pressed="${folderState === STATE_DISABLED ? 'false' : 'true'}">
              <span class="st-rmg-folder-switch-track"><span class="st-rmg-folder-switch-thumb"></span></span>
            </button>
            <span class="st-rmg-group-arrow">${store.collapsed[groupId] ? '>' : 'v'}</span>
          </span>
        `;
        fragment.appendChild(header);

        const anchor = document.createElement('div');
        anchor.className = 'regex-script-label st-rmg-sort-anchor';
        anchor.dataset.groupId = groupId;
        anchor.setAttribute('aria-hidden', 'true');
        fragment.appendChild(anchor);
      }

      function pushItems(groupId, groupItems) {
        for (const item of groupItems) {
          const hidden = !!store.collapsed[groupId];
          item.el.classList.toggle(HIDDEN_CLASS, hidden);
          applyFolderStateToItem(item, groupId);
          fragment.appendChild(item.el);
        }
      }

      pushHeader(UNGROUPED_ID, UNGROUPED_LABEL, itemsByGroup.get(UNGROUPED_ID).length);
      pushItems(UNGROUPED_ID, itemsByGroup.get(UNGROUPED_ID));

      for (const group of getGroups()) {
        const groupItems = itemsByGroup.get(group.id) || [];
        pushHeader(group.id, group.name, groupItems.length);
        pushItems(group.id, groupItems);
      }

      listEl.appendChild(fragment);
    }

    function syncAssignmentsFromRenderedLayout() {
      const listEl = getListEl();
      if (!listEl) return;

      let currentGroupId = UNGROUPED_ID;
      for (const child of Array.from(listEl.children)) {
        if (child.classList?.contains('st-rmg-group-header')) {
          currentGroupId = String(child.dataset.groupId || UNGROUPED_ID);
          continue;
        }

        if (!child.classList?.contains('regex-script-label') || child.classList.contains('st-rmg-sort-anchor')) continue;
        const itemId = getItemId(child);
        const scriptId = normalizeName(itemId).startsWith('dom:') ? normalizeName(itemId).slice(4) : normalizeName(getItemKeyCandidate(child));
        if (!scriptId) continue;
        setAssignedGroupIdForScriptId(scriptId, currentGroupId);
      }

      saveStore();
    }

    function getGroupIdFromListChild(listEl, childEl) {
      if (!(childEl instanceof HTMLElement) || childEl.parentElement !== listEl) return undefined;

      if (childEl.classList.contains('st-rmg-group-header') || childEl.classList.contains('st-rmg-sort-anchor')) {
        return String(childEl.dataset.groupId || UNGROUPED_ID);
      }

      if (childEl.classList.contains('regex-script-label')) {
        let probe = childEl.previousElementSibling;
        while (probe) {
          if (probe.classList?.contains('st-rmg-sort-anchor') || probe.classList?.contains('st-rmg-group-header')) {
            return String(probe.dataset.groupId || UNGROUPED_ID);
          }
          probe = probe.previousElementSibling;
        }
        return UNGROUPED_ID;
      }

      return undefined;
    }

    function getGroupIdFromVerticalPosition(listEl, clientY) {
      if (!(listEl instanceof HTMLElement) || !Number.isFinite(clientY)) return undefined;

      const listChildren = Array.from(listEl.children).filter((child) => child instanceof HTMLElement);
      for (const child of listChildren) {
        const rect = child.getBoundingClientRect();
        if (clientY < rect.top || clientY > rect.bottom) continue;
        const groupId = getGroupIdFromListChild(listEl, child);
        if (groupId !== undefined) return groupId;
      }

      for (let index = 0; index < listChildren.length - 1; index += 1) {
        const current = listChildren[index];
        const next = listChildren[index + 1];
        const currentRect = current.getBoundingClientRect();
        const nextRect = next.getBoundingClientRect();
        if (clientY > currentRect.bottom && clientY < nextRect.top) {
          const nextGroupId = getGroupIdFromListChild(listEl, next);
          if (nextGroupId !== undefined) return nextGroupId;
          const currentGroupId = getGroupIdFromListChild(listEl, current);
          if (currentGroupId !== undefined) return currentGroupId;
        }
      }

      const lastChild = listChildren[listChildren.length - 1];
      if (lastChild) {
        return getGroupIdFromListChild(listEl, lastChild);
      }

      return UNGROUPED_ID;
    }

    function getHeaderDropTarget(listEl, clientY) {
      if (!(listEl instanceof HTMLElement) || !Number.isFinite(clientY)) return null;

      for (const headerEl of Array.from(listEl.querySelectorAll('.st-rmg-group-header'))) {
        if (!(headerEl instanceof HTMLElement)) continue;
        const rect = headerEl.getBoundingClientRect();
        const lowerBound = rect.top + rect.height * 0.6;
        const forwardEdgeBottom = rect.bottom + 10;
        if (clientY >= lowerBound && clientY <= forwardEdgeBottom) {
          return {
            groupId: String(headerEl.dataset.groupId || UNGROUPED_ID),
            headerEl,
          };
        }
      }

      return null;
    }

    function clearItemDropTargetHighlight(listEl = getListEl()) {
      if (!(listEl instanceof HTMLElement)) return;
      for (const headerEl of Array.from(listEl.querySelectorAll('.st-rmg-group-header.st-rmg-item-drop-target'))) {
        headerEl.classList.remove('st-rmg-item-drop-target');
      }
      sortingHighlightGroupId = '';
    }

    function setItemDropTargetHighlight(groupId, listEl = getListEl()) {
      if (!(listEl instanceof HTMLElement)) return;
      if (sortingHighlightGroupId === groupId) return;
      clearItemDropTargetHighlight(listEl);
      const headerEl = Array.from(listEl.querySelectorAll('.st-rmg-group-header')).find((el) => el.dataset.groupId === groupId);
      if (headerEl instanceof HTMLElement) {
        headerEl.classList.add('st-rmg-item-drop-target');
        sortingHighlightGroupId = groupId;
      }
    }

    function getTargetGroupIdFromPointer(listEl, event) {
      const source = event?.originalEvent || event;
      const clientX = Number(source?.clientX ?? event?.clientX);
      const clientY = Number(source?.clientY ?? event?.clientY);
      if (!Number.isFinite(clientY)) return undefined;

      const headerDropTarget = getHeaderDropTarget(listEl, clientY);
      if (headerDropTarget?.groupId) {
        setItemDropTargetHighlight(headerDropTarget.groupId, listEl);
        return headerDropTarget.groupId;
      }

      if (Number.isFinite(clientX) && typeof document.elementsFromPoint === 'function') {
        const hoveredElements = document.elementsFromPoint(clientX, clientY);
        for (const hoveredElement of hoveredElements) {
          if (!(hoveredElement instanceof HTMLElement)) continue;
          if (hoveredElement.classList.contains('ui-sortable-helper') || hoveredElement.classList.contains('ui-sortable-placeholder')) continue;
          const listChild = hoveredElement.closest('.st-rmg-group-header, .st-rmg-sort-anchor, .regex-script-label');
          const groupId = getGroupIdFromListChild(listEl, listChild);
          if (groupId !== undefined) {
            setItemDropTargetHighlight(groupId, listEl);
            return groupId;
          }
        }
      }

      const fallbackGroupId = getGroupIdFromVerticalPosition(listEl, clientY);
      if (fallbackGroupId !== undefined) {
        setItemDropTargetHighlight(fallbackGroupId, listEl);
      } else {
        clearItemDropTargetHighlight(listEl);
      }
      return fallbackGroupId;
    }

    function movePlaceholderIntoTargetGroup(listEl, event, ui) {
      const placeholderEl = ui?.placeholder?.[0];
      if (!(placeholderEl instanceof HTMLElement)) return;

      const targetGroupId = getTargetGroupIdFromPointer(listEl, event);
      if (!targetGroupId) return;

      const targetAnchor = Array.from(listEl.querySelectorAll('.st-rmg-sort-anchor')).find((anchorEl) => anchorEl.dataset.groupId === targetGroupId);
      if (!(targetAnchor instanceof HTMLElement)) return;
      const targetHeader = targetAnchor.previousElementSibling;
      if (!(targetHeader instanceof HTMLElement) || !targetHeader.classList.contains('st-rmg-group-header')) return;
      if (placeholderEl.previousElementSibling === targetHeader && placeholderEl.nextElementSibling === targetAnchor) return;

      targetHeader.insertAdjacentElement('afterend', placeholderEl);
      sortingTargetGroupId = targetGroupId;
    }

    function bindNativeSortableEvents() {
      const listEl = getListEl();
      const $ = getJQuery();
      if (!listEl || typeof $ !== 'function' || !$.fn?.sortable) return;

      try {
        const sortable = $(listEl);
        if (!sortable.sortable('instance')) return;

        sortable.sortable('option', 'items', '> .regex-script-label:not(.st-rmg-hidden), > .st-rmg-sort-anchor');
        sortable.sortable('option', 'handle', '.drag-handle, .regex_script_name');
        sortable.sortable('option', 'cancel', '.st-rmg-group-header');
        sortable.sortable('option', 'tolerance', 'pointer');

        const originalStart = sortable.sortable('option', 'start');
        const originalSort = sortable.sortable('option', 'sort');
        const originalStop = sortable.sortable('option', 'stop');

        if (sortable.data('stRmgBound')) return;
        sortable.data('stRmgBound', true);

        sortable.sortable('option', 'start', function (event, ui) {
          sorting = true;
          sortingItemId = getItemId(ui?.item?.[0]);
          const currentScriptId = normalizeName(sortingItemId).startsWith('dom:') ? normalizeName(sortingItemId).slice(4) : '';
          sortingTargetGroupId = currentScriptId ? (getAssignedGroupIdForScriptId(currentScriptId) || UNGROUPED_ID) : UNGROUPED_ID;
          clearItemDropTargetHighlight(listEl);
          return typeof originalStart === 'function' ? originalStart.call(this, event, ui) : undefined;
        });

        sortable.sortable('option', 'sort', function (event, ui) {
          const hoveredGroupId = getTargetGroupIdFromPointer(listEl, event);
          if (hoveredGroupId !== undefined) {
            sortingTargetGroupId = hoveredGroupId;
          }
          movePlaceholderIntoTargetGroup(listEl, event, ui);
          return typeof originalSort === 'function' ? originalSort.call(this, event, ui) : undefined;
        });

        sortable.sortable('option', 'stop', function (...args) {
          if (sortingItemId) {
            const scriptId = normalizeName(sortingItemId).startsWith('dom:') ? normalizeName(sortingItemId).slice(4) : '';
            if (scriptId) setAssignedGroupIdForScriptId(scriptId, sortingTargetGroupId || UNGROUPED_ID);
            saveStore();
          }

          const result = typeof originalStop === 'function' ? originalStop.apply(this, args) : undefined;
          Promise.resolve(result).finally(async () => {
            sorting = false;
            sortingItemId = '';
            sortingTargetGroupId = undefined;
            clearItemDropTargetHighlight(listEl);
            await renderTree();
          });
          return result;
        });
      } catch {
        // ignore
      }
    }

    function reorderFolders(draggedGroupId, targetGroupId, placeAfter) {
      if (!draggedGroupId || !targetGroupId || draggedGroupId === targetGroupId) return;
      const orderedGroups = getGroups().map((group) => ({ ...group }));
      const draggedIndex = orderedGroups.findIndex((group) => group.id === draggedGroupId);
      const targetIndex = orderedGroups.findIndex((group) => group.id === targetGroupId);
      if (draggedIndex < 0 || targetIndex < 0) return;

      const [draggedGroup] = orderedGroups.splice(draggedIndex, 1);
      orderedGroups.splice(targetIndex + (placeAfter ? 1 : 0), 0, draggedGroup);
      store.groups = orderedGroups.map((group, index) => ({ ...group, order: index + 1 }));
      saveStore();
      renderTree();
    }

    function bindListEvents(listEl) {
      if (listEl.dataset.stRmgListBound === '1') return;
      listEl.dataset.stRmgListBound = '1';

      listEl.addEventListener('click', (e) => {
        const exportBtn = e.target?.closest?.('[data-folder-export]');
        if (exportBtn) {
          e.preventDefault();
          e.stopPropagation();
          void exportGroup(String(exportBtn.dataset.folderExport || ''));
          return;
        }

        const exportDisabledBtn = e.target?.closest?.('[data-folder-export-disabled]');
        if (exportDisabledBtn) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        const toggleBtn = e.target?.closest?.('[data-folder-toggle]');
        if (toggleBtn) {
          e.preventDefault();
          e.stopPropagation();
          const groupId = String(toggleBtn.dataset.folderToggle || UNGROUPED_ID);
          void setFolderEnabled(groupId, toggleBtn.classList.contains('is-off'));
          return;
        }

        if (e.target?.closest?.('.st-rmg-folder-handle')) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        const headerEl = e.target?.closest?.('.st-rmg-group-header');
        if (!headerEl) return;
        if (Date.now() - lastFolderDragEndedAt < 250) return;

        const groupId = String(headerEl.dataset.groupId || UNGROUPED_ID);
        store.collapsed[groupId] = !store.collapsed[groupId];
        saveStore();
        renderTree();
      });

      listEl.addEventListener('dragstart', (e) => {
        const handleEl = e.target?.closest?.('.st-rmg-folder-handle');
        if (!handleEl) return;
        const headerEl = handleEl.closest('.st-rmg-group-header.st-rmg-folder-draggable');
        if (!headerEl) {
          e.preventDefault();
          return;
        }

        draggingFolderId = String(headerEl.dataset.groupId || '');
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
        if (!targetHeaderEl) return;
        e.preventDefault();
        const targetGroupId = String(targetHeaderEl.dataset.groupId || '');
        if (!targetGroupId || targetGroupId === draggingFolderId) return;
        const rect = targetHeaderEl.getBoundingClientRect();
        folderDropTargetId = targetGroupId;
        folderDropAfter = Number(e.clientY) > rect.top + rect.height / 2;
      });

      listEl.addEventListener('drop', (e) => {
        if (!draggingFolderId || !folderDropTargetId || folderDropTargetId === draggingFolderId) return;
        e.preventDefault();
        reorderFolders(draggingFolderId, folderDropTargetId, folderDropAfter);
        draggingFolderId = '';
        folderDropTargetId = '';
        folderDropAfter = false;
        lastFolderDragEndedAt = Date.now();
      });

      listEl.addEventListener('dragend', () => {
        if (!draggingFolderId) return;
        draggingFolderId = '';
        folderDropTargetId = '';
        folderDropAfter = false;
        lastFolderDragEndedAt = Date.now();
      });
    }

    function bindHeaderEvents(headerEl) {
      if (headerEl.dataset.stRmgHeaderBound === '1') return;
      headerEl.dataset.stRmgHeaderBound = '1';

      headerEl.addEventListener('click', (e) => {
        const panelToggle = e.target?.closest?.('[data-st-rmg-panel-toggle]');
        if (panelToggle) {
          e.preventDefault();
          togglePanelCollapsed();
          return;
        }

        const groupManager = headerEl.querySelector('.st-rmg-group-manager');
        const selectEl = groupManager?.querySelector(`#${GROUP_SELECT_ID}`);
        const selectedGroupId = String(selectEl?.value || UNGROUPED_ID);

        if (e.target?.closest?.(`#${NEW_GROUP_ID}`)) {
          e.preventDefault();
          void addGroup();
          return;
        }
        if (e.target?.closest?.(`#${IMPORT_GROUP_PANEL_ID}`)) {
          e.preventDefault();
          void importGroup();
          return;
        }
        if (e.target?.closest?.(`#${RENAME_GROUP_ID}`)) {
          e.preventDefault();
          void renameGroup(selectedGroupId);
          return;
        }
        if (e.target?.closest?.(`#${DELETE_GROUP_ID}`)) {
          e.preventDefault();
          void deleteGroup(selectedGroupId);
          return;
        }
        if (e.target?.closest?.(`#${DELETE_GROUP_WITH_SCRIPTS_ID}`)) {
          e.preventDefault();
          void deleteGroupAndScripts(selectedGroupId);
        }
      });

      headerEl.addEventListener('change', (e) => {
        if (e.target?.matches?.(`#${GROUP_SELECT_ID}`)) {
          updateGroupActionState(headerEl.querySelector('.st-rmg-group-manager'));
        }
      });
    }

    function startDomObserver(listEl) {
      if (domObserver) domObserver.disconnect();
      if (!listEl || typeof MutationObserver !== 'function') return;
      let queued = false;

      domObserver = new MutationObserver(() => {
        if (rendering || sorting || queued) return;
        queued = true;
        schedule(() => {
          queued = false;
          renderTree();
        });
      });

      domObserver.observe(listEl, { childList: true, subtree: false });
    }

    async function renderTree() {
      const headerEl = getHeaderEl();
      const listEl = getListEl();
      if (!headerEl || !listEl) return;

      loadStoreForCurrentContext();
      rendering = true;
      try {
        const ctx = getCtx();
        const currentScripts = await ensureScriptsReady(ctx);
        const items = collectItems(listEl);
        pruneStore(items, currentScripts);
        renderGroupedList(items, currentScripts);
        renderGroupManager(headerEl.querySelector('.st-rmg-group-manager'));
        bindNativeSortableEvents();
      } finally {
        rendering = false;
        startDomObserver(listEl);
      }
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
          <div class="st-rmg-title-row">
            <div class="st-rmg-title-main st-rmg-panel-toggle" data-st-rmg-panel-toggle="true" tabindex="0" role="button" aria-expanded="true">
              <span class="st-rmg-panel-arrow" data-st-rmg-panel-arrow="true">▼</span>
              <span>${escapeHtml(titleText)} · ${FOLDER_LABEL}</span>
            </div>
          </div>
          <div class="st-rmg-panel-body">
            <div class="st-rmg-toolbar">
              <div class="st-rmg-group-manager"></div>
            </div>
          </div>
        `;
        blockEl.insertBefore(headerEl, listEl);
      }

      bindHeaderEvents(headerEl);
      bindListEvents(listEl);
      applyPanelCollapsedState(headerEl);
      return true;
    }

    async function tryEnsure() {
      if (!ensureMounted()) return false;
      await renderTree();
      return true;
    }

    return {
      tryEnsure,
    };
  }

  root.features = root.features || {};
  root.features.panelController = {
    createPanelController,
  };
})();
