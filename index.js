(function () {
  'use strict';

  const MODULE = 'st-regex-three-level-organizer';
  const VERSION = '0.1.7';
  const PANEL_ID = 'st-r3o-panel';
  const CHOOSER_ID = 'st-r3o-scope-chooser';
  const STORE_GROUPS = `${MODULE}:groups`;
  const STORE_RULES = `${MODULE}:rule-groups`;
  const STORE_GROUP_COLLAPSE = `${MODULE}:group-collapse`;
  const STORE_MODE = `${MODULE}:display-mode`;
  const STORE_VERSION = `${MODULE}:version`;
  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const SCOPES = [
    {
      key: 'global',
      label: '全局正则',
      listId: 'saved_regex_scripts',
      anchorId: 'open_regex_editor',
    },
    {
      key: 'preset',
      label: '预设正则',
      listId: 'saved_preset_scripts',
      anchorId: 'open_preset_editor',
    },
    {
      key: 'scoped',
      label: '局部正则',
      listId: 'saved_scoped_scripts',
      anchorId: 'open_scoped_editor',
    },
  ];

  const DEFAULT_GROUPS = {
    global: [
      { id: uid('g'), name: '酒馆助手', children: [] },
      { id: uid('g'), name: '文本清理', children: [] },
    ],
    preset: [],
    scoped: [],
  };

  let state = loadState();
  let activeScope = 'global';
  let isApplyingGrouping = false;
  let startTimer = null;
  let selectedRuleId = '';

  function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
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

  function loadState() {
    return {
      groups: Object.assign({}, DEFAULT_GROUPS, loadJson(STORE_GROUPS, {})),
      ruleGroups: loadJson(STORE_RULES, {}),
      collapsed: loadJson(STORE_GROUP_COLLAPSE, {}),
      displayMode: loadJson(STORE_MODE, { global: false, preset: false, scoped: false }),
    };
  }

  function saveState() {
    saveJson(STORE_GROUPS, state.groups);
    saveJson(STORE_RULES, state.ruleGroups);
    saveJson(STORE_GROUP_COLLAPSE, state.collapsed);
    saveJson(STORE_MODE, state.displayMode);
  }

  function setAllDisplayModes(enabled) {
    SCOPES.forEach((scope) => {
      state.displayMode[scope.key] = enabled;
    });
    saveState();
    SCOPES.forEach((scope) => applyGrouping(scope.key));
    syncToolbarButtons();
    if (!q(`#${PANEL_ID}`)?.classList.contains('st-r3o-hidden')) {
      renderPanel();
    }
  }

  function setScopeDisplayMode(scopeKey, enabled) {
    state.displayMode[scopeKey] = !!enabled;
    saveState();
    applyGrouping(scopeKey);
    syncToolbarButtons();
    if (!q(`#${PANEL_ID}`)?.classList.contains('st-r3o-hidden')) {
      renderPanel();
    }
  }

  function isGlobalGroupingEnabled() {
    return SCOPES.every((scope) => !!state.displayMode[scope.key]);
  }

  function getDisplayModeSummary() {
    const enabledCount = SCOPES.filter((scope) => !!state.displayMode[scope.key]).length;
    if (enabledCount === 0) return '关';
    if (enabledCount === SCOPES.length) return '开';
    return '部分开';
  }

  function getScopeConfig(scopeKey) {
    return SCOPES.find((scope) => scope.key === scopeKey) || SCOPES[0];
  }

  function getListEl(scopeKey) {
    return document.getElementById(getScopeConfig(scopeKey).listId);
  }

  function getToolbarEl(scopeKey) {
    return document.getElementById(getScopeConfig(scopeKey).anchorId)?.closest?.('.flex-container') || null;
  }

  function getPrimaryToolbarEl() {
    return getToolbarEl('global') || getToolbarEl('preset') || getToolbarEl('scoped');
  }

  function ensureScopeChooser() {
    let chooser = q(`#${CHOOSER_ID}`);
    if (chooser) return chooser;

    chooser = document.createElement('div');
    chooser.id = CHOOSER_ID;
    chooser.className = 'st-r3o-scope-chooser st-r3o-hidden';
    chooser.innerHTML = `
      <div class="st-r3o-scope-chooser-title">选择作用域</div>
      <div class="st-r3o-scope-chooser-buttons">
        ${SCOPES.map((scope) => `<button type="button" class="menu_button interactable" data-r3o-choose-scope="${scope.key}">${scope.label}</button>`).join('')}
      </div>
      <div class="st-r3o-scope-chooser-actions">
        <button type="button" class="menu_button interactable" data-r3o-choose-cancel="1">取消</button>
      </div>
    `;
    document.body.appendChild(chooser);
    return chooser;
  }

  function chooseScopeWithButtons(anchorEl, callback) {
    const chooser = ensureScopeChooser();
    const rect = anchorEl?.getBoundingClientRect?.() || { left: 24, bottom: 24 };
    chooser.style.left = `${Math.max(12, Math.round(rect.left))}px`;
    chooser.style.top = `${Math.max(12, Math.round(rect.bottom + 8))}px`;
    chooser.classList.remove('st-r3o-hidden');

    const close = () => {
      chooser.classList.add('st-r3o-hidden');
      chooser.onclick = null;
    };

    chooser.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const scopeBtn = event.target.closest('[data-r3o-choose-scope]');
      const cancelBtn = event.target.closest('[data-r3o-choose-cancel]');
      if (cancelBtn) {
        close();
        return;
      }
      if (!scopeBtn) return;
      const scopeKey = scopeBtn.dataset.r3oChooseScope;
      close();
      if (scopeKey) callback(scopeKey);
    };
  }

  function ensurePanel() {
    let panel = q(`#${PANEL_ID}`);
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'st-r3o-panel st-r3o-hidden';
    document.body.appendChild(panel);
    return panel;
  }

  function getRules(scopeKey) {
    const listEl = getListEl(scopeKey);
    if (!listEl) return [];

    return Array.from(listEl.children)
      .filter((el) => el?.classList?.contains('regex-script-label'))
      .map((el, index) => ({
        el,
        id: getRuleId(scopeKey, el, index),
        name: getRuleName(el),
      }));
  }

  function getRuleName(itemEl) {
    return itemEl?.querySelector?.('.regex_script_name')?.textContent?.trim()
      || itemEl?.querySelector?.('.name_text')?.textContent?.trim()
      || itemEl?.textContent?.trim()
      || '未命名正则';
  }

  function getRuleId(scopeKey, itemEl, index) {
    const explicit = [
      itemEl?.dataset?.scriptId,
      itemEl?.dataset?.regexScriptId,
      itemEl?.dataset?.regexId,
      itemEl?.dataset?.id,
      itemEl?.id,
    ].find(Boolean);

    if (explicit) return `${scopeKey}:id:${explicit}`;

    const name = getRuleName(itemEl);
    const fields = Array.from(itemEl?.querySelectorAll?.('input, textarea, select') || [])
      .map((field) => `${field.name || field.id || field.className}:${field.value || ''}`)
      .join('|');

    return `${scopeKey}:fp:${hash(`${name}|${fields}|${index}`)}`;
  }

  function hash(input) {
    const str = String(input || '');
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  function normalizeGroupPath(scopeKey, path) {
    if (!Array.isArray(path) || path.length === 0) return [];

    const normalized = [];
    let list = ensureScopeGroups(scopeKey);
    for (const segment of path.slice(0, 3)) {
      const group = Array.isArray(list) ? list.find((item) => item.name === segment) : null;
      if (!group) break;
      normalized.push(group.name);
      list = Array.isArray(group.children) ? group.children : [];
    }
    return normalized;
  }

  function getRulePath(scopeKey, ruleId) {
    const saved = Array.isArray(state.ruleGroups?.[scopeKey]?.[ruleId]) ? state.ruleGroups[scopeKey][ruleId] : [];
    const normalized = normalizeGroupPath(scopeKey, saved);
    if (!same(saved, normalized)) {
      state.ruleGroups[scopeKey] = state.ruleGroups[scopeKey] || {};
      state.ruleGroups[scopeKey][ruleId] = normalized;
      saveState();
    }
    return normalized;
  }

  function setRulePath(scopeKey, ruleId, path) {
    state.ruleGroups[scopeKey] = state.ruleGroups[scopeKey] || {};
    state.ruleGroups[scopeKey][ruleId] = normalizeGroupPath(scopeKey, Array.isArray(path) ? path.slice(0, 3) : []);
    saveState();
  }

  function ensureScopeGroups(scopeKey) {
    if (!Array.isArray(state.groups[scopeKey])) state.groups[scopeKey] = [];
    return state.groups[scopeKey];
  }

  function findGroup(path, scopeKey) {
    let list = ensureScopeGroups(scopeKey);
    let found = null;
    for (const segment of path) {
      found = list.find((item) => item.name === segment);
      if (!found) return null;
      list = Array.isArray(found.children) ? found.children : [];
    }
    return found;
  }

  function addGroup(scopeKey, parentPath) {
    const level = parentPath.length + 1;
    if (level > 3) {
      alert('最多支持三级组');
      return false;
    }
    const name = prompt(`新增 ${level} 级组名称`);
    if (!name) return false;

    const groupName = name.trim();
    if (!groupName) return false;

    const group = { id: uid('g'), name: groupName, children: [] };
    if (!parentPath.length) {
      const root = ensureScopeGroups(scopeKey);
      if (root.some((item) => item.name === group.name)) {
        alert('同级组名已存在');
        return false;
      }
      root.push(group);
    } else {
      const parent = findGroup(parentPath, scopeKey);
      if (!parent) return false;
      parent.children = Array.isArray(parent.children) ? parent.children : [];
      if (parent.children.some((item) => item.name === group.name)) {
        alert('同级组名已存在');
        return false;
      }
      parent.children.push(group);
    }

    state.collapsed[`${scopeKey}:${parentPath.concat(group.name).join('/')}`] = false;
    saveState();
    if (!state.displayMode[scopeKey]) {
      state.displayMode[scopeKey] = true;
      saveState();
    }
    renderPanel();
    applyGrouping(scopeKey);
    syncToolbarButtons();
    return true;
  }

  function renameGroup(scopeKey, path) {
    const group = findGroup(path, scopeKey);
    if (!group) return;
    const nextName = prompt('新的组名', group.name);
    if (!nextName) return;
    const oldPath = path.slice();
    const newPath = path.slice(0, -1).concat(nextName.trim());
    group.name = nextName.trim();

    const rules = state.ruleGroups[scopeKey] || {};
    Object.keys(rules).forEach((ruleId) => {
      const savedPath = Array.isArray(rules[ruleId]) ? rules[ruleId] : [];
      if (oldPath.every((part, index) => savedPath[index] === part)) {
        rules[ruleId] = newPath.concat(savedPath.slice(oldPath.length));
      }
    });

    saveState();
    renderPanel();
    applyGrouping(scopeKey);
  }

  function deleteGroup(scopeKey, path) {
    if (!confirm(`删除组 ${path.join(' / ')} ？其中规则会退回未分组`)) return;
    const parentPath = path.slice(0, -1);
    const targetName = path[path.length - 1];
    const list = parentPath.length ? findGroup(parentPath, scopeKey)?.children : ensureScopeGroups(scopeKey);
    if (!Array.isArray(list)) return;
    const index = list.findIndex((item) => item.name === targetName);
    if (index < 0) return;
    list.splice(index, 1);

    const rules = state.ruleGroups[scopeKey] || {};
    Object.keys(rules).forEach((ruleId) => {
      const savedPath = Array.isArray(rules[ruleId]) ? rules[ruleId] : [];
      if (path.every((part, idx) => savedPath[idx] === part)) rules[ruleId] = [];
    });

    saveState();
    renderPanel();
    applyGrouping(scopeKey);
  }

  function toggleGroupCollapse(scopeKey, path) {
    const key = `${scopeKey}:${path.join('/')}`;
    state.collapsed[key] = !state.collapsed[key];
    saveState();
    renderPanel();
    applyGrouping(scopeKey);
  }

  function isCollapsed(scopeKey, path) {
    return !!state.collapsed[`${scopeKey}:${path.join('/')}`];
  }

  function renderPanel() {
    const panel = ensurePanel();
    const rules = getRules(activeScope);
    const ungrouped = rules.filter((rule) => getRulePath(activeScope, rule.id).length === 0);
    const scopeGroupingEnabled = !!state.displayMode[activeScope];
    const selectedRule = rules.find((rule) => rule.id === selectedRuleId) || null;
    const selectedRuleName = selectedRule?.name || '';

    panel.innerHTML = `
      <div class="st-r3o-head">
        <b>正则三级分组整理器</b>
        <button type="button" data-r3o-action="close">关闭</button>
      </div>
      <div class="st-r3o-scope-tabs">
        ${SCOPES.map((scope) => `<button type="button" class="st-r3o-scope-tab" data-r3o-action="scope" data-scope="${scope.key}" data-active="${scope.key === activeScope ? '1' : '0'}">${scope.label}</button>`).join('')}
      </div>
      <div class="st-r3o-tools">
        <button type="button" class="menu_button interactable" data-r3o-action="toggle-display">${scopeGroupingEnabled ? '关闭当前分组' : '开启当前分组'}</button>
        <button type="button" class="menu_button interactable" data-r3o-action="expand-all">全部展开</button>
        <button type="button" class="menu_button interactable" data-r3o-action="collapse-all">全部收纳</button>
        <button type="button" class="menu_button interactable" data-r3o-action="add-root">新建一级组</button>
        <button type="button" class="menu_button interactable" data-r3o-action="scan">刷新规则列表</button>
      </div>
      <div class="st-r3o-picker ${selectedRule ? '' : 'st-r3o-picker-idle'}">
        <b>${selectedRule ? `已选规则: ${escapeHtml(selectedRuleName)}` : '手机模式: 先点规则，再点“放入此组”'}</b>
        <button type="button" class="menu_button interactable" data-r3o-action="clear-selection" ${selectedRule ? '' : 'disabled'}>取消选择</button>
      </div>
      <div class="st-r3o-dropzone" data-r3o-drop="[]">
        <b>未分组</b>
        <span class="st-r3o-meta">${ungrouped.length} 条，可拖回这里或点此放入</span>
        <button type="button" class="menu_button interactable" data-r3o-action="assign-here" data-path="[]" ${selectedRule ? '' : 'disabled'}>放到未分组</button>
      </div>
      ${ungrouped.map((rule) => renderRuleRow(rule, 1)).join('')}
      ${renderGroups(activeScope, ensureScopeGroups(activeScope), [], 0)}
    `;

    bindPanelEvents(panel);
    bindPanelDnD(panel);
  }

  function renderGroups(scopeKey, groups, parentPath, depth) {
    return groups.map((group) => {
      const path = parentPath.concat(group.name);
      const rules = getRules(scopeKey).filter((rule) => same(getRulePath(scopeKey, rule.id), path));
      const collapsed = isCollapsed(scopeKey, path);

      return `
        <div>
          <div class="st-r3o-group" data-r3o-drop='${escapeAttr(JSON.stringify(path))}' style="margin-left:${depth * 14}px">
            <button type="button" class="menu_button interactable" data-r3o-action="toggle-group" data-path='${escapeAttr(JSON.stringify(path))}'>${collapsed ? '+' : '-'}</button>
            <b>${escapeHtml(group.name)}</b>
            <span class="st-r3o-level">L${path.length}</span>
            <button type="button" class="menu_button interactable" data-r3o-action="assign-here" data-path='${escapeAttr(JSON.stringify(path))}' ${selectedRuleId ? '' : 'disabled'}>放入此组</button>
            <button type="button" class="menu_button interactable" data-r3o-action="add-child" data-path='${escapeAttr(JSON.stringify(path))}'>+子组</button>
            <button type="button" class="menu_button interactable" data-r3o-action="rename-group" data-path='${escapeAttr(JSON.stringify(path))}'>改名</button>
            <button type="button" class="menu_button interactable" data-r3o-action="delete-group" data-path='${escapeAttr(JSON.stringify(path))}'>删组</button>
          </div>
          ${collapsed ? '' : rules.map((rule) => renderRuleRow(rule, depth + 1)).join('')}
          ${collapsed ? '' : renderGroups(scopeKey, Array.isArray(group.children) ? group.children : [], path, depth + 1)}
        </div>
      `;
    }).join('');
  }

  function renderRuleRow(rule, depth) {
    const path = getRulePath(activeScope, rule.id);
    const selected = rule.id === selectedRuleId;
    return `
      <div class="st-r3o-rule ${selected ? 'st-r3o-rule-selected' : ''}" draggable="true" data-r3o-rule-id="${escapeHtml(rule.id)}" data-r3o-action="pick-rule" style="margin-left:${depth * 14}px">
        <span>${escapeHtml(rule.name)}</span>
        <span class="st-r3o-meta">${escapeHtml(path.length ? path.join(' / ') : '未分组')}</span>
        <button type="button" class="menu_button interactable" data-r3o-action="pick-rule" data-rule-id="${escapeHtml(rule.id)}">${selected ? '已选中' : '选择'}</button>
      </div>
    `;
  }

  function assignRuleToPath(ruleId, path) {
    if (!ruleId) return;
    setRulePath(activeScope, ruleId, path);
    selectedRuleId = '';
    renderPanel();
    applyGrouping(activeScope);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function bindPanelEvents(panel) {
    panel.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const target = event.target.closest('[data-r3o-action]');
      if (!target) return;
      const action = target.dataset.r3oAction;
      const path = parsePath(target.dataset.path);
      const ruleId = target.dataset.ruleId || target.closest('[data-r3o-rule-id]')?.dataset.r3oRuleId || '';

      if (action === 'close') panel.classList.add('st-r3o-hidden');
      if (action === 'scope') {
        activeScope = target.dataset.scope || 'global';
        selectedRuleId = '';
        renderPanel();
      }
      if (action === 'toggle-display') {
        toggleScopeDisplay(activeScope);
      }
      if (action === 'expand-all') {
        Object.keys(state.collapsed)
          .filter((key) => key.startsWith(`${activeScope}:`))
          .forEach((key) => { state.collapsed[key] = false; });
        saveState();
        renderPanel();
        applyGrouping(activeScope);
      }
      if (action === 'collapse-all') {
        collectGroupPaths(activeScope, ensureScopeGroups(activeScope)).forEach((path) => {
          state.collapsed[`${activeScope}:${path.join('/')}`] = true;
        });
        saveState();
        renderPanel();
        applyGrouping(activeScope);
      }
      if (action === 'add-root') addGroup(activeScope, []);
      if (action === 'scan') renderPanel();
      if (action === 'clear-selection') {
        selectedRuleId = '';
        renderPanel();
      }
      if (action === 'pick-rule' && ruleId) {
        selectedRuleId = selectedRuleId === ruleId ? '' : ruleId;
        renderPanel();
      }
      if (action === 'assign-here' && selectedRuleId) {
        assignRuleToPath(selectedRuleId, path);
      }
      if (action === 'add-child') addGroup(activeScope, path);
      if (action === 'rename-group') renameGroup(activeScope, path);
      if (action === 'delete-group') deleteGroup(activeScope, path);
      if (action === 'toggle-group') toggleGroupCollapse(activeScope, path);
    };
  }

  function bindPanelDnD(panel) {
    qa('.st-r3o-rule', panel).forEach((el) => {
      el.ondragstart = (event) => {
        event.dataTransfer.setData('text/plain', el.dataset.r3oRuleId || '');
        el.classList.add('st-r3o-dragging');
      };
      el.ondragend = () => el.classList.remove('st-r3o-dragging');
    });

    qa('[data-r3o-drop]', panel).forEach((el) => {
      el.ondragover = (event) => {
        event.preventDefault();
        el.classList.add('st-r3o-over');
      };
      el.ondragleave = () => el.classList.remove('st-r3o-over');
      el.ondrop = (event) => {
        event.preventDefault();
        el.classList.remove('st-r3o-over');
        const ruleId = event.dataTransfer.getData('text/plain');
        assignRuleToPath(ruleId, parsePath(el.dataset.r3oDrop));
      };
    });
  }

  function parsePath(raw) {
    try {
      const parsed = JSON.parse(raw || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function collectGroupPaths(scopeKey, groups, parentPath = []) {
    const out = [];
    for (const group of groups) {
      const path = parentPath.concat(group.name);
      out.push(path);
      if (Array.isArray(group.children) && group.children.length) {
        out.push(...collectGroupPaths(scopeKey, group.children, path));
      }
    }
    return out;
  }

  function applyGrouping(scopeKey) {
    if (isApplyingGrouping) return;
    const listEl = getListEl(scopeKey);
    if (!listEl) return;

    isApplyingGrouping = true;
    try {
      cleanupGrouping(listEl);
      if (!state.displayMode[scopeKey]) return;

      const rules = getRules(scopeKey);
      listEl.classList.add('st-r3o-grouping');

      const miscEls = Array.from(listEl.children).filter((el) => !el.classList.contains('regex-script-label'));
      miscEls.forEach((el) => {
        el.dataset.r3oPrevOrder = el.style.order || '';
        el.style.order = '999999';
      });

      for (const rule of rules) {
        const path = getRulePath(scopeKey, rule.id);
        const l1 = path[0] || '未分组';
        const l2 = path[1] || '';
        const l3 = path[2] || '';
        rule.el.dataset.r3oDepth = String(Math.max(1, Math.min(path.length || 1, 3)));
        rule.el.dataset.r3oL1 = l1;
        rule.el.dataset.r3oL2 = l2;
        rule.el.dataset.r3oL3 = l3;
      }

      const rulesByPath = new Map();
      rules.forEach((rule) => {
        const path = getRulePath(scopeKey, rule.id);
        const key = path.join('\u001f');
        const bucket = rulesByPath.get(key) || [];
        bucket.push(rule);
        rulesByPath.set(key, bucket);
      });

      const orderState = { value: 0 };
      const ungroupedRules = rulesByPath.get('') || [];
      if (ungroupedRules.length) {
        appendListHeader(listEl, createListHeader(scopeKey, [], 0, `${ungroupedRules.length} 条`), orderState);
        appendRules(listEl, ungroupedRules, orderState);
      }

      appendGroupBranches(listEl, scopeKey, ensureScopeGroups(scopeKey), [], rulesByPath, orderState);

      applyListCollapse(scopeKey, listEl);
    } finally {
      isApplyingGrouping = false;
    }
  }

  function cleanupGrouping(listEl) {
    qa('.st-r3o-list-group-header', listEl).forEach((el) => el.remove());
    qa('.regex-script-label', listEl).forEach((el) => {
      if (el.dataset.r3oPrevOrder !== undefined) {
        el.style.order = el.dataset.r3oPrevOrder;
        delete el.dataset.r3oPrevOrder;
      } else {
        el.style.order = '';
      }
      el.classList.remove('st-r3o-list-hidden');
      delete el.dataset.r3oDepth;
      delete el.dataset.r3oL1;
      delete el.dataset.r3oL2;
      delete el.dataset.r3oL3;
    });
    Array.from(listEl.children)
      .filter((el) => !el.classList.contains('regex-script-label'))
      .forEach((el) => {
        if (el.dataset.r3oPrevOrder !== undefined) {
          el.style.order = el.dataset.r3oPrevOrder;
          delete el.dataset.r3oPrevOrder;
        }
      });
    listEl.classList.remove('st-r3o-grouping');
  }

  function appendListHeader(listEl, headerEl, orderState) {
    listEl.appendChild(headerEl);
    listEl.lastElementChild.style.order = String(orderState.value++);
  }

  function appendRules(listEl, rules, orderState) {
    rules.forEach((rule) => {
      rule.el.dataset.r3oPrevOrder = rule.el.style.order || '';
      rule.el.style.order = String(orderState.value++);
    });
  }

  function getBranchRuleCount(groups, parentPath, rulesByPath) {
    let total = 0;
    groups.forEach((group) => {
      const path = parentPath.concat(group.name);
      total += (rulesByPath.get(path.join('\u001f')) || []).length;
      if (Array.isArray(group.children) && group.children.length) {
        total += getBranchRuleCount(group.children, path, rulesByPath);
      }
    });
    return total;
  }

  function appendGroupBranches(listEl, scopeKey, groups, parentPath, rulesByPath, orderState) {
    groups.forEach((group) => {
      const path = parentPath.concat(group.name);
      const ownRules = rulesByPath.get(path.join('\u001f')) || [];
      const childGroups = Array.isArray(group.children) ? group.children : [];
      const totalCount = ownRules.length + getBranchRuleCount(childGroups, path, rulesByPath);

      appendListHeader(listEl, createListHeader(scopeKey, path, path.length, `${totalCount} 条`), orderState);
      appendRules(listEl, ownRules, orderState);
      appendGroupBranches(listEl, scopeKey, childGroups, path, rulesByPath, orderState);
    });
  }

  function createListHeader(scopeKey, path, level, metaText) {
    const el = document.createElement('div');
    const collapsed = isCollapsed(scopeKey, path);
    el.className = 'st-r3o-list-group-header';
    el.dataset.level = String(level);
    el.dataset.path = JSON.stringify(path);
    const title = path.length ? path[path.length - 1] : '未分组';
    const levelText = path.length ? `L${level}` : '默认';
    const suffix = metaText ? `${levelText} · ${metaText}` : levelText;
    el.innerHTML = `<span class="st-r3o-arrow">${collapsed ? '▶' : '▼'}</span><b>${escapeHtml(title)}</b><span class="st-r3o-meta">${escapeHtml(suffix)}</span>`;
    el.addEventListener('click', () => {
      toggleGroupCollapse(scopeKey, path);
    });
    return el;
  }

  function applyListCollapse(scopeKey, listEl) {
    const headers = qa('.st-r3o-list-group-header', listEl);
    const rules = qa('.regex-script-label', listEl);

    headers.forEach((header) => {
      const path = parsePath(header.dataset.path);
      const collapsed = isCollapsed(scopeKey, path);
      const arrow = header.querySelector('.st-r3o-arrow');
      if (arrow) arrow.textContent = collapsed ? '▶' : '▼';
    });

    rules.forEach((ruleEl) => {
      const path = [ruleEl.dataset.r3oL1, ruleEl.dataset.r3oL2, ruleEl.dataset.r3oL3].filter(Boolean);
      const hidden = [1, 2, 3].some((len) => isCollapsed(scopeKey, path.slice(0, len)));
      ruleEl.classList.toggle('st-r3o-list-hidden', hidden);
    });

    headers.forEach((header) => {
      const path = parsePath(header.dataset.path);
      const hidden = path.length > 1 && isCollapsed(scopeKey, path.slice(0, path.length - 1));
      header.classList.toggle('st-r3o-list-hidden', hidden);
    });
  }

  function ensureToolbarButtons() {
    return !!createStandaloneToolbar();
  }

  function syncToolbarButtons() {
    const btn = q('[data-r3o-toggle="primary"]');
    if (!btn) return;
    btn.textContent = `全部分组: ${getDisplayModeSummary()}`;
  }

  function showPanel() {
    const panel = ensurePanel();
    panel.classList.remove('st-r3o-hidden');
    renderPanel();
  }

  function toggleGlobalDisplay() {
    const next = !isGlobalGroupingEnabled();
    setAllDisplayModes(next);
  }

  function toggleScopeDisplay(scopeKey) {
    setScopeDisplayMode(scopeKey, !state.displayMode[scopeKey]);
  }

  function ensureVersionRefresh() {
    const saved = localStorage.getItem(STORE_VERSION);
    const sessionKey = `${STORE_VERSION}:reloaded`;
    if (saved === VERSION) return;
    localStorage.setItem(STORE_VERSION, VERSION);
    if (sessionStorage.getItem(sessionKey) === VERSION) return;
    sessionStorage.setItem(sessionKey, VERSION);
    location.reload();
  }

  function createStandaloneToolbar() {
    const host = getPrimaryToolbarEl();
    if (!host) return null;

    let wrap = q('[data-r3o-anchor="primary"]');
    if (wrap && wrap.parentElement) return wrap;

    wrap = document.createElement('div');
    wrap.className = 'st-r3o-toolbar-anchor';
    wrap.dataset.r3oAnchor = 'primary';

    const row = document.createElement('div');
    row.className = 'st-r3o-toolbar-row';

    const addGroupBtn = document.createElement('button');
    addGroupBtn.type = 'button';
    addGroupBtn.className = 'menu_button interactable';
    addGroupBtn.textContent = '新建分组';
    addGroupBtn.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      chooseScopeWithButtons(event.currentTarget, (scopeKey) => {
        activeScope = scopeKey;
        const created = addGroup(scopeKey, []);
        if (created) showPanel();
      });
    };

    const organizerBtn = document.createElement('button');
    organizerBtn.type = 'button';
    organizerBtn.className = 'menu_button interactable';
    organizerBtn.textContent = '分组整理';
    organizerBtn.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      chooseScopeWithButtons(event.currentTarget, (scopeKey) => {
        activeScope = scopeKey;
        showPanel();
      });
    };

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'menu_button interactable';
    toggleBtn.textContent = '开关分组';
    toggleBtn.dataset.r3oToggle = 'primary';
    toggleBtn.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleGlobalDisplay();
    };

    row.append(addGroupBtn, organizerBtn, toggleBtn);
    wrap.appendChild(row);
    host.insertAdjacentElement('afterend', wrap);
    return wrap;
  }

  function init() {
    ensureVersionRefresh();

    const tryStart = () => {
      if (isApplyingGrouping) return false;
      let hasAny = false;
      SCOPES.forEach((scope) => {
        hasAny = ensureToolbarButtons() || hasAny;
        applyGrouping(scope.key);
      });
      syncToolbarButtons();
      return hasAny;
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryStart, { once: true });
    } else {
      tryStart();
    }

    if (typeof MutationObserver === 'function') {
      const observer = new MutationObserver(() => {
        clearTimeout(startTimer);
        startTimer = setTimeout(tryStart, 80);
      });
      const root = document.body || document.documentElement;
      if (root) observer.observe(root, { childList: true, subtree: true });
    }
  }

  init();
})();
