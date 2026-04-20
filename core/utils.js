(function () {
  'use strict';

  const root = window.STRegexManualGroups = window.STRegexManualGroups || {};
  if (root.utils) return;

  const { MODULE_NAME } = root.constants;

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

  function getSelectedRegexPreset(ctx = getCtx()) {
    const presets = ctx?.extensionSettings?.regex_presets;
    if (!Array.isArray(presets)) return null;
    return presets.find((preset) => preset?.isSelected) || null;
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

  function toast(message, level = 'info', title = undefined) {
    try {
      const fn = window.toastr?.[level] || window.toastr?.info;
      if (fn) {
        if (title !== undefined) {
          fn(message, title);
        } else {
          fn(message);
        }
        return;
      }
    } catch {
      // ignore
    }
    log(title ? `${title} - ${message}` : message);
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

  function hashString(value) {
    let hash = 5381;
    for (let i = 0; i < value.length; i += 1) {
      hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
    }
    return (hash >>> 0).toString(36);
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

  async function downloadTextFile(fileName, content, mimeType = 'application/json;charset=utf-8') {
    const suggestedName = normalizeName(fileName) || 'export.json';
    const blobMimeType = normalizeName(mimeType) || 'application/json;charset=utf-8';
    const pickerAcceptMime = blobMimeType.split(';', 1)[0] || 'application/json';

    if (typeof window.showSaveFilePicker === 'function') {
      try {
        const extensionMatch = suggestedName.match(/(\.[^./\\]+)$/);
        const extension = extensionMatch?.[1] || '.json';
        const handle = await window.showSaveFilePicker({
          suggestedName,
          types: [
            {
              description: 'JSON 文件',
              accept: {
                [pickerAcceptMime]: [extension]
              }
            }
          ]
        });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        return true;
      } catch (error) {
        if (error?.name === 'AbortError') return false;
        throw error;
      }
    }

    if (typeof Blob !== 'function' || typeof URL?.createObjectURL !== 'function') {
      throw new Error('当前环境不支持文件导出');
    }

    const blob = new Blob([content], { type: blobMimeType });
    const objectUrl = URL.createObjectURL(blob);
    const linkEl = document.createElement('a');
    linkEl.href = objectUrl;
    linkEl.download = suggestedName;
    linkEl.style.display = 'none';
    linkEl.rel = 'noopener';
    document.body.appendChild(linkEl);
    linkEl.click();
    window.setTimeout(() => {
      linkEl.remove();
      URL.revokeObjectURL(objectUrl);
    }, 5000);
    return true;
  }

  function pickImportFile(accept) {
    return new Promise((resolve) => {
      const inputEl = document.createElement('input');
      inputEl.type = 'file';
      inputEl.accept = accept || 'application/json,.json';
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

  root.utils = {
    log,
    warn,
    schedule,
    getCtx,
    getSelectedRegexPreset,
    captureViewportState,
    restoreViewportState,
    loadJson,
    saveJson,
    toast,
    normalizeName,
    escapeHtml,
    uid,
    keySegment,
    cloneJsonData,
    hashString,
    getScriptName,
    getItemKeyCandidate,
    getItemFingerprint,
    getItemId,
    getLegacyItemId,
    getDirectScriptItems,
    getJQuery,
    openPrompt,
    openConfirm,
    downloadTextFile,
    pickImportFile,
    readFileText
  };
})();
