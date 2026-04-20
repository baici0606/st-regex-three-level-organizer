(function () {
  'use strict';

  const root = window.STRegexManualGroups = window.STRegexManualGroups || {};
  root.bootstrap = root.bootstrap || {};
  if (root.bootstrap.init) return;

  const { PANEL_DEFINITIONS } = root.constants;
  const { warn, log, getCtx } = root.utils;
  const { createPanelController } = root.features.panelController;

  function init() {
    if (root.bootstrap._initialized) return;

    const ctx = getCtx();
    if (!ctx) {
      warn('SillyTavern context not found.');
      return;
    }

    const { eventSource, event_types } = ctx;
    const controllers = PANEL_DEFINITIONS.map((definition) => createPanelController(definition));
    const ensureAll = () => controllers.forEach((controller) => controller.tryEnsure());

    eventSource?.on?.(event_types.APP_READY, ensureAll);
    if (event_types?.SETTINGS_LOADED) eventSource?.on?.(event_types.SETTINGS_LOADED, ensureAll);
    if (event_types?.CHAT_CHANGED) eventSource?.on?.(event_types.CHAT_CHANGED, ensureAll);
    if (event_types?.PRESET_CHANGED) eventSource?.on?.(event_types.PRESET_CHANGED, ensureAll);

    root.bootstrap._initialized = true;
    root.bootstrap._controllers = controllers;
    ensureAll();
    log('initialized');
  }

  root.bootstrap.init = init;
})();
