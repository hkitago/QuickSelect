//export const isIOS = () => {
//  return /iPhone|iPod/.test(navigator.userAgent);
//};
//
//export const isIPadOS = () => {
//  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
//};
//
//export const isMacOS = () => {
//  return navigator.platform.includes('Mac') && !isIPadOS();
//};
//
//export const applyPlatformClass = () => {
//  const body = document.body;
//
//  if (isIOS()) {
//    body.classList.add('os-ios');
//  } else if (isIPadOS()) {
//    body.classList.add('os-ipados');
//  } else if (isMacOS()) {
//    body.classList.add('os-macos');
//  }
//};

// ============================================
// Platform Detection (自動初期化版)
// ============================================

const PLATFORM_KEY = 'platformInfo';

/**
 * プラットフォーム情報を検出してストレージに保存
 */
const detectAndSavePlatform = async () => {
  const userAgent = navigator.userAgent;
  const platform = navigator.platform;
  const maxTouchPoints = navigator.maxTouchPoints || 0;

  const isIPadOS = platform === 'MacIntel' && maxTouchPoints > 1;
  const isIOS = /iPhone|iPod/.test(userAgent);
  const isMacOS = platform.includes('Mac') && !isIPadOS;

  const platformInfo = {
    isIOS,
    isIPadOS,
    isMacOS,
    detectedAt: Date.now()
  };

  try {
    await browser.storage.local.set({ [PLATFORM_KEY]: platformInfo });
    console.log('[QuickSelectExtension] Platform detected:', platformInfo);
  } catch (error) {
    console.error('[QuickSelectExtension] Failed to save platform info:', error);
  }

  return platformInfo;
};

/**
 * utils.jsが読み込まれた時点で自動的にプラットフォーム検出を実行
 * background/service workerで最初にこのファイルがimportされることを想定
 */
(async () => {
  // ストレージに既に存在するかチェック
  try {
    const { [PLATFORM_KEY]: existing } = await browser.storage.local.get(PLATFORM_KEY);
    
    if (!existing) {
      // 未初期化の場合のみ検出・保存
      await detectAndSavePlatform();
    } else {
      console.log('[QuickSelectExtension] Platform info already initialized:', existing);
    }
  } catch (error) {
    console.error('[QuickSelectExtension] Platform initialization error:', error);
  }
})();

/**
 * ストレージからプラットフォーム情報を取得
 * すべてのコンテキスト（popup, content script等）で使用可能
 */
export const getPlatformInfo = async () => {
  try {
    const { [PLATFORM_KEY]: platformInfo } = await browser.storage.local.get(PLATFORM_KEY);
    
    if (!platformInfo) {
      console.warn('[QuickSelectExtension] Platform info not initialized, detecting now...');
      // フォールバック: その場で検出
      return await detectAndSavePlatform();
    }
    
    return platformInfo;
  } catch (error) {
    console.error('[QuickSelectExtension] Failed to get platform info:', error);
    // エラー時のフォールバック
    return {
      isIOS: false,
      isIPadOS: false,
      isMacOS: false
    };
  }
};

/**
 * プラットフォーム情報を強制的に再検出（通常は不要）
 */
export const reinitializePlatform = async () => {
  return await detectAndSavePlatform();
};

/**
 * content scriptやpopupで<body>にプラットフォームクラスを適用
 */
export const applyPlatformClass = async () => {
  const { isIOS, isIPadOS, isMacOS } = await getPlatformInfo();
  const body = document.body;

  if (isIOS) {
    body.classList.add('os-ios');
  } else if (isIPadOS) {
    body.classList.add('os-ipados');
  } else if (isMacOS) {
    body.classList.add('os-macos');
  }
};

// ============================================
// Settings
// ============================================
export const settings = (() => {
  const DEFAULT_SETTINGS = {
    configEnabled: false,
    configGranularity: null,  // 'word' | 'sentence' | 'paragraph'
    configExtendSelection: false,
  };

  let cache = { ...DEFAULT_SETTINGS };

  const load = async () => {
    try {
      const { settings: stored } = await browser.storage.local.get('settings');
      cache = { ...DEFAULT_SETTINGS, ...stored };
    } catch (error) {
      console.error('[QuickSelectExtension] Failed to load settings:', error);
    }
  };

  const get = (key) => {
    if (key === undefined) return { ...cache };
    return cache[key];
  };

  const set = async (key, value) => {
    cache[key] = value;
    try {
      await browser.storage.local.set({ settings: cache });
    } catch (error) {
      console.error('[QuickSelectExtension] Failed to save settings:', error);
    }
  };

  browser.storage.onChanged.addListener(async (changes, area) => {
    if (area === 'local' && changes.settings) {
      cache = { ...DEFAULT_SETTINGS, ...changes.settings.newValue };
    }
  });

  return { load, get, set };
})();
