import { sendMessageSafe, getPlatformInfo, settings } from './utils.js';

// ========================================
// Icon Handlings
// ========================================
const activeTabs = new Set();

const getAllTabIds = async () => {
  try {
    const tabs = await browser.tabs.query({});
    tabs.forEach(tab => activeTabs.add(tab.id));
  } catch (error) {
    console.error('[QuickSelectExtension] Failed to initialize tabs:', error);
  }
};

const setIconForAllTabs = async (iconPath) => {
  if (activeTabs.size === 0) {
    await getAllTabIds();
  }
  
  const promises = Array.from(activeTabs).map(async (tabId) => {
    try {
      await browser.action.setIcon({
        path: iconPath,
        tabId: tabId
      });
    } catch (error) {
      console.warn(`[QuickSelectExtension] Failed to set icon for tab ${tabId}:`, error);
      activeTabs.delete(tabId);
    }
  });
  
  await Promise.all(promises);
};

const updateToolbarIcon = async (tabId = null, config) => {

  const currentConfig = config ?? settings.get();

  let iconPath;

  if (currentConfig.configEnabled) {
    iconPath = `./images/toolbar-icon-${currentConfig.configGranularity}.svg`;
  } else {
    iconPath = './images/toolbar-icon.svg';
  }

  if (tabId === null) {
    setIconForAllTabs(iconPath);
  } else {
    browser.action.setIcon({ path: iconPath, tabId: tabId });
  }
};

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  activeTabs.add(tab.id);

  if (changeInfo.status === 'complete') {
    updateToolbarIcon(tab.id, settings.get());
  }
});

browser.tabs.onCreated.addListener((tab) => {
  // Prevent duplicate event handling for setIcon
  if (tab.index === 0) return; // for itself
  if (Number.isNaN(tab.index)) return; // for iOS/iPadOS

  updateToolbarIcon(tab.id, settings.get());
});

browser.tabs.onRemoved.addListener((tabId) => {
  activeTabs.delete(tabId);
});

// ========================================
// Event Listeners
// ========================================
browser.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === browser.windows.WINDOW_ID_NONE) return;
  if (!settings.get('configEnabled')) return;
  
  const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id) return;

  sendMessageSafe(activeTab.id, { type: 'CONFIG_UPDATED', config: settings.get() });
  updateToolbarIcon(activeTab.id, settings.get());
});

browser.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'local' && changes.settings) {
    const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) return;

    await updateToolbarIcon(activeTab?.id ?? null, changes.settings.newValue);
  }
});

browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  // Get current config
  if (message.type === 'GET_CURRENT_CONFIG') {
    sendResponse({ config: settings.get() });
    return true;
  }
});

// ========================================
// Initialization: Load config from storage
// ========================================
await settings.load();
