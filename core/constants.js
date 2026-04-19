(function () {
  'use strict';

  const root = window.STRegexManualGroups = window.STRegexManualGroups || {};
  if (root.constants) return;

  root.constants = Object.freeze({
    MODULE_NAME: 'st-regex-manual-groups',
    STORAGE_VERSION: 2,
    UNGROUPED_ID: '__ungrouped__',
    GROUPING_CLASS: 'st-rmg-grouping',
    HIDDEN_CLASS: 'st-rmg-hidden',
    FOLDER_LABEL: '文件夹',
    UNGROUPED_LABEL: '未分组',
    STATE_ENABLED: 'enabled',
    STATE_DISABLED: 'disabled',
    EXPORT_BUNDLE_TYPE: 'st-rmg-folder-bundle',
    EXPORT_BUNDLE_VERSION: 1,
    EXPORT_FILE_EXTENSION: '.st-regex-folder.json',
    PANEL_DEFINITIONS: Object.freeze([
      Object.freeze({ scope: 'global', blockId: 'global_scripts_block', listId: 'saved_regex_scripts', titleText: '全局正则' }),
      Object.freeze({ scope: 'preset', blockId: 'preset_scripts_block', listId: 'saved_preset_scripts', titleText: '预设正则' }),
      Object.freeze({ scope: 'scoped', blockId: 'scoped_scripts_block', listId: 'saved_scoped_scripts', titleText: '局部正则' })
    ])
  });
})();
