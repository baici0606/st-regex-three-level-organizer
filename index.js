(function () {
  'use strict';

  const MODULE_NAME = 'st-regex-manual-groups';
  const HIDDEN_CLASS = 'st-rmg-hidden';
  const GROUPING_CLASS = 'st-rmg-grouping';
  const UNGROUPED_ID = '__ungrouped__';
  const STORAGE_VERSION = 1;

  function log(...args) {
    console.log(`[${MODULE_NAME}]`, ...args);
  }

  function warn(...args) {
    console.warn(`[${MODULE_NAME}]`, ...args);
  }

  function schedule(fn) {
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(fn);
    } else {
      setTimeout(fn, 16);
    }
  }

  function getCtx() {
    return window.SillyTavern?.getContext?.();
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

  function normalizeName(input) {
    return String(input ?? '').trim();
  }

  function getScriptName(itemEl) {
    const nameEl = itemEl?.querySelector?.('.regex_script_name');
    return nameEl?.textContent?.trim() || nameEl?.getAttribute?.('title')?.trim() || '';
  }

  function getItemId(itemEl, index) {
    const value = [
      itemEl?.dataset?.scriptId,
      itemEl?.dataset?.regexScriptId,
      itemEl?.dataset?.regexId,
      itemEl?.dataset?.id,
      itemEl?.getAttribute?.('data-script-id'),
      itemEl?.getAttribute?.('data-regex-script-id'),
      itemEl?.getAttribute?.('data-regex-id'),
      itemEl?.getAttribute?.('data-id'),
      itemEl?.id,
      getScriptName(itemEl)
    ].find(Boolean);
    return `${String(value || 'item').trim()}#${index}`;
  }

  function getDirectScriptItems(listEl) {
    if (!listEl?.children) return [];
    return Array.from(listEl.children).filter((el) => el?.classList?.contains('regex-script-label'));
  }

  function createDefaultStore() {
    return {
      version: STORAGE_VERSION,
      groups: [],
      assignments: {},
      collapsed: {}
    };
  }

  function sanitizeStore(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const groups = Array.isArray(source.groups) ? source.groups : [];
    const assignments = source.assignments && typeof source.assignments === 'object' ? source.assignments : {};
    const collapsed = source.collapsed && typeof source.collapsed === 'object' ? source.collapsed : {};

    return {
      version: STORAGE_VERSION,
      groups: groups
        .map((group) => ({
          id: String(group?.id || uid('group')),
          name: normalizeName(group?.name) || '未命名分组',
          parentId: group?.parentId ? String(group.parentId) : null,
          order: Number.isFinite(group?.order) ? Number(group.order) : 0
        }))
        .slice(0, 500),
      assignments: Object.fromEntries(
        Object.entries(assignments)
          .filter(([key, value]) => !!key && (typeof value === 'string' || value === null))
          .map(([key, value]) => [String(key), value ? String(value) : null])
      ),
      collapsed: Object.fromEntries(
        Object.entries(collapsed)
          .filter(([key]) => !!key)
          .map(([key, value]) => [String(key), !!value])
      )
    };
  }

  function buildTree(groups) {
    const byId = new Map();
    const roots = [];

    for (const group of groups) {
      byId.set(group.id, { ...group, children: [] });
    }

    for (const group of groups.slice().sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'zh-Hans-CN'))) {
      const node = byId.get(group.id);
      const parent = group.parentId ? byId.get(group.parentId) : null;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }

    return { byId, roots };
  }

  function getNodeDepth(groupId, byId) {
    let depth = 1;
    let current = byId.get(groupId);
    while (current?.parentId) {
      depth += 1;
      current = byId.get(current.parentId);
      if (depth > 10) break;
    }
    return depth;
  }

  function getFullPath(groupId, byId) {
    if (!groupId || groupId === UNGROUPED_ID) return '未分组';
    const parts = [];
    let current = byId.get(groupId);
    while (current) {
      parts.unshift(current.name);
      current = current.parentId ? byId.get(current.parentId) : null;
    }
    return parts.join(' / ');
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

  function createPanelController({ scope, blockId, listId, titleText }) {
    const STORAGE_KEY = `${MODULE_NAME}:${scope}:store`;
    const HEADER_ID = `${MODULE_NAME}-${scope}-header`;
    const TREE_ID = `${MODULE_NAME}-${scope}-tree`;
    const SELECT_ID = `${MODULE_NAME}-${scope}-select`;
    const TARGETS_ID = `${MODULE_NAME}-${scope}-targets`;
    const NEW_ROOT_ID = `${MODULE_NAME}-${scope}-new-root`;
    const ASSIGN_ID = `${MODULE_NAME}-${scope}-assign`;
    const UNGROUP_ID = `${MODULE_NAME}-${scope}-ungroup`;
    const REFRESH_ID = `${MODULE_NAME}-${scope}-refresh`;

    let store = sanitizeStore(loadJson(STORAGE_KEY, createDefaultStore()));
    let listObserver = null;
    let domObserver = null;
    let rendering = false;
    let selectedItemIds = new Set();

    function saveStore() {
      store = sanitizeStore(store);
      saveJson(STORAGE_KEY, store);
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

    function collectItems(listEl = getListEl()) {
      return getDirectScriptItems(listEl).map((itemEl, index) => ({
        el: itemEl,
        index,
        id: getItemId(itemEl, index),
        name: getScriptName(itemEl)
      }));
    }

    function cleanupOrphanAssignments(items, byId) {
      const validItemIds = new Set(items.map((item) => item.id));
      const validGroupIds = new Set(byId.keys());
      let changed = false;
      for (const [itemId, groupId] of Object.entries(store.assignments)) {
        if (!validItemIds.has(itemId) || (groupId && !validGroupIds.has(groupId))) {
          delete store.assignments[itemId];
          changed = true;
        }
      }
      if (changed) saveStore();
    }

    function removeGroupAndChildren(groupId) {
      const { byId } = buildTree(store.groups);
      const toDelete = new Set();
      const walk = (id) => {
        toDelete.add(id);
        for (const group of store.groups) {
          if (group.parentId === id) walk(group.id);
        }
      };
      walk(groupId);
      store.groups = store.groups.filter((group) => !toDelete.has(group.id));
      for (const [itemId, assignedGroupId] of Object.entries(store.assignments)) {
        if (assignedGroupId && toDelete.has(assignedGroupId)) {
          delete store.assignments[itemId];
        }
      }
      for (const deletedId of toDelete) {
        delete store.collapsed[deletedId];
      }
      saveStore();
      return byId;
    }

    function getSelectedItemIds() {
      return Array.from(selectedItemIds);
    }

    function syncSelectedIdsWithItems(items) {
      const validIds = new Set(items.map((item) => item.id));
      selectedItemIds = new Set(Array.from(selectedItemIds).filter((itemId) => validIds.has(itemId)));
    }

    function populateGroupSelect(selectEl, roots, byId) {
      if (!selectEl) return;

      const previousValue = selectEl.value;
      selectEl.innerHTML = '';

      const ungroupedOption = document.createElement('option');
      ungroupedOption.value = UNGROUPED_ID;
      ungroupedOption.textContent = '未分组';
      selectEl.appendChild(ungroupedOption);

      function appendNodeOption(node, depth) {
        const optionEl = document.createElement('option');
        optionEl.value = node.id;
        optionEl.textContent = `${' '.repeat(Math.max(0, depth - 1) * 4)}${getFullPath(node.id, byId)}`;
        selectEl.appendChild(optionEl);

        for (const child of node.children) {
          appendNodeOption(child, depth + 1);
        }
      }

      for (const root of roots) {
        appendNodeOption(root, 1);
      }

      const nextValue = Array.from(selectEl.options).some((option) => option.value === previousValue)
        ? previousValue
        : UNGROUPED_ID;
      selectEl.value = nextValue;
    }

    function renderTargetButtons(containerEl, roots, byId) {
      if (!containerEl) return;

      const buttons = [];

      function pushNode(node, depth) {
        buttons.push(`
          <button
            type="button"
            class="menu_button interactable st-rmg-target-btn"
            data-group-target="${escapeHtml(node.id)}"
            data-depth="${depth}"
            title="分配到 ${escapeHtml(getFullPath(node.id, byId))}"
          >${escapeHtml(getFullPath(node.id, byId))}</button>
        `);

        for (const child of node.children) {
          pushNode(child, depth + 1);
        }
      }

      buttons.push(`
        <button type="button" class="menu_button interactable st-rmg-target-btn st-rmg-target-ungrouped" data-group-target="${UNGROUPED_ID}" data-depth="1" title="移到未分组">未分组</button>
      `);

      for (const root of roots) {
        pushNode(root, 1);
      }

      containerEl.innerHTML = buttons.join('');
    }

    function updateSelectedCount() {
      const headerEl = getHeaderEl();
      if (!headerEl) return;
      const count = selectedItemIds.size;
      const badge = headerEl.querySelector('.st-rmg-selected-count');
      if (badge) badge.textContent = `已选 ${count}`;
    }

    function renderTree() {
      const headerEl = getHeaderEl();
      const listEl = getListEl();
      if (!headerEl || !listEl) return;

      rendering = true;

      try {
        const items = collectItems(listEl);
        const { byId, roots } = buildTree(store.groups);
        cleanupOrphanAssignments(items, byId);

        syncSelectedIdsWithItems(items);

        const itemsByGroup = new Map();
        itemsByGroup.set(UNGROUPED_ID, []);
        for (const group of store.groups) {
          itemsByGroup.set(group.id, []);
        }

        for (const item of items) {
          const groupId = store.assignments[item.id];
          if (groupId && itemsByGroup.has(groupId)) itemsByGroup.get(groupId).push(item);
          else itemsByGroup.get(UNGROUPED_ID).push(item);
        }

        listEl.classList.add(GROUPING_CLASS);

        for (const child of Array.from(listEl.children)) {
          if (child.classList.contains('st-rmg-group-header')) child.remove();
        }

        let order = 0;

        function pushHeader(groupId, title, depth, count) {
          const header = document.createElement('div');
          header.className = 'st-rmg-group-header';
          header.dataset.groupId = groupId;
          header.dataset.depth = String(depth);
          header.innerHTML = `
            <span class="st-rmg-group-arrow">${store.collapsed[groupId] ? '▶' : '▼'}</span>
            <span class="st-rmg-group-name">${escapeHtml(title)}</span>
            <span class="st-rmg-group-count">(${count})</span>
            ${groupId === UNGROUPED_ID ? '' : '<button type="button" class="menu_button interactable st-rmg-mini" data-action="add-child" title="新增子组">+</button><button type="button" class="menu_button interactable st-rmg-mini" data-action="rename" title="重命名组">改名</button><button type="button" class="menu_button interactable st-rmg-mini st-rmg-danger" data-action="delete" title="删除组">删</button>'}
          `;
          listEl.appendChild(header);
          header.style.order = String(order++);
        }

        function pushItem(item, depth, hidden) {
          item.el.dataset.stRmgAssignedGroup = store.assignments[item.id] || '';
          item.el.dataset.stRmgDepth = String(depth);
          item.el.classList.toggle(HIDDEN_CLASS, !!hidden);
          item.el.style.order = String(order++);
        }

        function renderNode(node, depth, parentHidden) {
          const childItems = itemsByGroup.get(node.id) || [];
          let total = childItems.length;
          for (const child of node.children) {
            total += countSubtree(child);
          }

          pushHeader(node.id, node.name, depth, total);

          const collapsed = !!store.collapsed[node.id];
          const hidden = parentHidden || collapsed;

          for (const item of childItems) {
            pushItem(item, depth, hidden);
          }

          for (const child of node.children) {
            renderNode(child, depth + 1, hidden);
          }
        }

        function countSubtree(node) {
          let count = (itemsByGroup.get(node.id) || []).length;
          for (const child of node.children) count += countSubtree(child);
          return count;
        }

        pushHeader(UNGROUPED_ID, '未分组', 1, (itemsByGroup.get(UNGROUPED_ID) || []).length);
        for (const item of itemsByGroup.get(UNGROUPED_ID) || []) {
          pushItem(item, 1, false);
        }

        for (const root of roots) {
          renderNode(root, 1, false);
        }

        const selectEl = headerEl.querySelector(`#${SELECT_ID}`);
        populateGroupSelect(selectEl, roots, byId);

        const targetsEl = headerEl.querySelector(`#${TARGETS_ID}`);
        renderTargetButtons(targetsEl, roots, byId);

        syncSelectionUI(items);
        updateSelectedCount();
      } finally {
        rendering = false;
      }
    }

    function syncSelectionUI(items = collectItems()) {
      const headerEl = getHeaderEl();
      if (!headerEl) return;

      const container = headerEl.querySelector('.st-rmg-script-list');
      if (!container) return;

      container.innerHTML = items
        .map((item) => {
          const assigned = store.assignments[item.id];
          const label = assigned ? getFullPath(assigned, buildTree(store.groups).byId) : '未分组';
          const checked = selectedItemIds.has(item.id) ? 'checked' : '';
          return `
            <label class="st-rmg-script-entry" title="${escapeHtml(item.name)}">
              <input type="checkbox" class="st-rmg-script-check" value="${escapeHtml(item.id)}" ${checked}>
              <span class="st-rmg-script-entry-name">${escapeHtml(item.name || '(未命名正则)')}</span>
              <span class="st-rmg-script-entry-path">${escapeHtml(label)}</span>
            </label>
          `;
        })
        .join('');
    }

    async function addGroup(parentId = null) {
      const { byId } = buildTree(store.groups);
      if (parentId && getNodeDepth(parentId, byId) >= 3) {
        toast('最多只支持三级分组', 'warning');
        return;
      }

      const name = normalizeName(await openPrompt(parentId ? '输入子分组名称' : '输入一级分组名称'));
      if (!name) return;

      const siblings = store.groups.filter((group) => String(group.parentId || '') === String(parentId || ''));
      store.groups.push({
        id: uid('group'),
        name,
        parentId,
        order: siblings.length + 1
      });
      saveStore();
      renderTree();
    }

    async function renameGroup(groupId) {
      const group = store.groups.find((entry) => entry.id === groupId);
      if (!group) return;
      const nextName = normalizeName(await openPrompt('输入新的分组名称', group.name));
      if (!nextName) return;
      group.name = nextName;
      saveStore();
      renderTree();
    }

    async function deleteGroup(groupId) {
      const { byId } = buildTree(store.groups);
      const group = byId.get(groupId);
      if (!group) return;
      const ok = await openConfirm(`删除分组“${group.name}”及其所有子分组后，组内脚本会回到未分组，是否继续？`);
      if (!ok) return;
      removeGroupAndChildren(groupId);
      renderTree();
    }

    function assignSelected(targetGroupId) {
      const selected = getSelectedItemIds();
      if (selected.length < 1) {
        toast('请先勾选要分组的正则', 'warning');
        return;
      }

      for (const itemId of selected) {
        if (!targetGroupId || targetGroupId === UNGROUPED_ID) delete store.assignments[itemId];
        else store.assignments[itemId] = targetGroupId;
      }

      selectedItemIds.clear();
      saveStore();
      renderTree();
    }

    function bindHeaderEvents(headerEl) {
      headerEl.addEventListener('click', (e) => {
        if (!e.target?.closest?.('.st-rmg-script-entry')) return;
        e.stopPropagation();
      });

      headerEl.addEventListener('change', (e) => {
        if (e.target?.classList?.contains('st-rmg-script-check')) {
          const itemId = String(e.target.value || '');
          if (itemId) {
            if (e.target.checked) selectedItemIds.add(itemId);
            else selectedItemIds.delete(itemId);
          }
          updateSelectedCount();
        }
      });

      headerEl.querySelector(`#${NEW_ROOT_ID}`)?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        addGroup(null);
      });

      headerEl.querySelector(`#${ASSIGN_ID}`)?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const selectEl = headerEl.querySelector(`#${SELECT_ID}`);
        assignSelected(selectEl?.value || UNGROUPED_ID);
      });

      headerEl.querySelector(`#${UNGROUP_ID}`)?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        assignSelected(UNGROUPED_ID);
      });

      headerEl.querySelector(`#${REFRESH_ID}`)?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        renderTree();
      });

      headerEl.addEventListener('click', (e) => {
        const targetBtn = e.target?.closest?.('[data-group-target]');
        if (!targetBtn) return;
        e.preventDefault();
        e.stopPropagation();
        assignSelected(String(targetBtn.dataset.groupTarget || UNGROUPED_ID));
      });
    }

    function bindListEvents(listEl) {
      if (listEl.dataset.stRmgBound === '1') return;
      listEl.dataset.stRmgBound = '1';

      listEl.addEventListener('click', (e) => {
        const headerEl = e.target?.closest?.('.st-rmg-group-header');
        if (!headerEl) return;

        const groupId = headerEl.dataset.groupId;
        const action = e.target?.dataset?.action;

        e.preventDefault();
        e.stopPropagation();

        if (action === 'add-child') {
          addGroup(groupId);
          return;
        }

        if (action === 'rename') {
          renameGroup(groupId);
          return;
        }

        if (action === 'delete') {
          deleteGroup(groupId);
          return;
        }

        if (!groupId || groupId === UNGROUPED_ID) return;
        store.collapsed[groupId] = !store.collapsed[groupId];
        saveStore();
        renderTree();
      });
    }

    function startListObserver(listEl) {
      if (listObserver) listObserver.disconnect();
      if (!listEl || typeof MutationObserver !== 'function') return;

      let scheduled = false;
      listObserver = new MutationObserver(() => {
        if (rendering) return;
        if (scheduled) return;
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
          <div class="st-rmg-title-row">
            <b>${escapeHtml(titleText)}手动分组</b>
            <span class="st-rmg-selected-count">已选 0</span>
          </div>
          <div class="st-rmg-toolbar">
            <button type="button" class="menu_button interactable" id="${NEW_ROOT_ID}">新增一级组</button>
            <select id="${SELECT_ID}" class="text_pole st-rmg-select"></select>
            <button type="button" class="menu_button interactable" id="${ASSIGN_ID}">分配到组</button>
            <button type="button" class="menu_button interactable" id="${UNGROUP_ID}">移出分组</button>
            <button type="button" class="menu_button interactable" id="${REFRESH_ID}">刷新分组</button>
          </div>
          <div class="st-rmg-targets" id="${TARGETS_ID}"></div>
          <div class="st-rmg-script-list" id="${TREE_ID}"></div>
        `;
        blockEl.insertAdjacentElement('afterbegin', headerEl);
        bindHeaderEvents(headerEl);
      }

      bindListEvents(listEl);
      startListObserver(listEl);
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
      createPanelController({
        scope: 'global',
        blockId: 'global_scripts_block',
        listId: 'saved_regex_scripts',
        titleText: '全局正则'
      }),
      createPanelController({
        scope: 'preset',
        blockId: 'preset_scripts_block',
        listId: 'saved_preset_scripts',
        titleText: '预设正则'
      }),
      createPanelController({
        scope: 'scoped',
        blockId: 'scoped_scripts_block',
        listId: 'saved_scoped_scripts',
        titleText: '局部正则'
      })
    ];

    const ensureAll = () => controllers.forEach((controller) => controller.tryEnsure());

    eventSource?.on?.(event_types.APP_READY, ensureAll);
    if (event_types?.SETTINGS_LOADED) eventSource?.on?.(event_types.SETTINGS_LOADED, ensureAll);
    if (event_types?.PRESET_CHANGED) eventSource?.on?.(event_types.PRESET_CHANGED, ensureAll);

    ensureAll();
    log('initialized');
  }

  init();
})();
