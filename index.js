(function () {
  'use strict';

  const ROOT_KEY = 'STRegexManualGroups';
  const root = window[ROOT_KEY] = window[ROOT_KEY] || {};

  function resolveBaseUrl() {
    const currentSrc = document.currentScript?.src;
    if (currentSrc) {
      return new URL('.', currentSrc).href;
    }

    const matchedScript = Array.from(document.querySelectorAll('script[src]')).find((scriptEl) => {
      const src = String(scriptEl.getAttribute('src') || '');
      return /(?:^|\/)index\.js(?:[?#].*)?$/.test(src) && /st-regex-three-level-organizer/i.test(src);
    });
    if (matchedScript?.src) {
      return new URL('.', matchedScript.src).href;
    }

    return new URL('./', window.location.href).href;
  }

  function buildModuleUrl(baseUrl, relativePath) {
    return new URL(relativePath, baseUrl).href;
  }

  function getVersionToken(baseUrl) {
    try {
      const matchedScript = Array.from(document.querySelectorAll('script[src]')).find((scriptEl) => {
        try {
          return new URL(scriptEl.src, window.location.href).href.startsWith(baseUrl)
            && /(?:^|\/)index\.js(?:[?#].*)?$/.test(String(scriptEl.getAttribute('src') || ''));
        } catch {
          return false;
        }
      });
      const scriptUrl = matchedScript?.src ? new URL(matchedScript.src, window.location.href) : null;
      return scriptUrl?.searchParams?.get('v') || scriptUrl?.search || `ts=${Date.now()}`;
    } catch {
      return `ts=${Date.now()}`;
    }
  }

  function logLoader(level, ...args) {
    const prefix = '[st-regex-manual-groups:loader]';
    const output = console[level] || console.log;
    output.call(console, prefix, ...args);
  }

  function loadScriptOnce(url) {
    const normalizedUrl = String(url);
    root.loader.loadedScripts = root.loader.loadedScripts || {};

    if (root.loader.loadedScripts[normalizedUrl]) {
      return root.loader.loadedScripts[normalizedUrl];
    }

    const existingScript = Array.from(document.querySelectorAll('script[src]')).find((scriptEl) => {
      try {
        return new URL(scriptEl.src, window.location.href).href === normalizedUrl;
      } catch {
        return false;
      }
    });

    const loadPromise = new Promise((resolve, reject) => {
      const scriptEl = existingScript || document.createElement('script');
      const handleLoad = () => {
        scriptEl.removeEventListener('load', handleLoad);
        scriptEl.removeEventListener('error', handleError);
        resolve();
      };
      const handleError = () => {
        scriptEl.removeEventListener('load', handleLoad);
        scriptEl.removeEventListener('error', handleError);
        reject(new Error(`模块加载失败: ${normalizedUrl}`));
      };

      scriptEl.addEventListener('load', handleLoad, { once: true });
      scriptEl.addEventListener('error', handleError, { once: true });

      if (!existingScript) {
        scriptEl.src = normalizedUrl;
        scriptEl.async = false;
        document.head.appendChild(scriptEl);
      }
    });

    root.loader.loadedScripts[normalizedUrl] = loadPromise;
    return loadPromise;
  }

  async function bootstrapModules() {
    const baseUrl = resolveBaseUrl();
    const versionToken = getVersionToken(baseUrl);
    const modulePaths = [
      'core/constants.js',
      'core/utils.js',
      'core/store.js',
      'features/panel-controller.js',
      'bootstrap/init.js'
    ];

    root.loader.baseUrl = baseUrl;
    root.loader.modulePaths = modulePaths.slice();
    root.loader.versionToken = versionToken;

    for (const relativePath of modulePaths) {
      const moduleUrl = `${buildModuleUrl(baseUrl, relativePath)}${String(versionToken).startsWith('?') ? String(versionToken) : `?${versionToken}`}`;
      await loadScriptOnce(moduleUrl);
    }

    if (typeof root.bootstrap?.init !== 'function') {
      throw new Error('bootstrap.init 未就绪，插件初始化失败');
    }

    root.bootstrap.init();
  }

  root.loader = root.loader || {};
  root.loader.version = 'module-loader-v1';
  if (root.loader.loadPromise) {
    if (typeof root.bootstrap?.init === 'function') {
      root.bootstrap.init();
    }
    return;
  }
  root.loader.loadPromise = bootstrapModules().catch((error) => {
    logLoader('error', error?.message || error, error);
    throw error;
  });
})();
