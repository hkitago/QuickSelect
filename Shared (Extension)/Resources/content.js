(() => {
  const DEFAULT_SETTINGS = {
    configEnabled: false,
    configGranularity: null,
    configExtendSelection: false,
  };

  let config = { ...DEFAULT_SETTINGS };

  browser.storage.onChanged.addListener(async (changes, area) => {
    if (area === 'local' && changes.settings) {
      config = { ...DEFAULT_SETTINGS, ...changes.settings.newValue };
    }
  });

  const requestUpdateIconToBackground = async () => {
    try {
      await browser.runtime.sendMessage({ type: 'UPDATE_CURRENT_ICON' });
    } catch (error) {
      console.error('[QuickSelectExtension] Failed to update icon on background:', error);
    }
  };

  const requestConfigFromBackground = async () => {
    try {
      const response = await browser.runtime.sendMessage({
        type: 'GET_CURRENT_CONFIG'
      });

      if (response?.config) {
        applyConfig(response.config);
      }
    } catch (error) {
      console.error('[QuickSelectExtension] Failed to get config from background:', error);
    }
  };

  // ========================================
  // Sentence Segmentation
  // ========================================
  const CUSTOM_SENTENCE_TAG = 'span';
  const CUSTOM_SENTENCE_ATTR = 'data-qs';
  const CUSTOM_SENTENCE_ATTR_VALUE = 'sentence';
  const BLOCK_SELECTOR = 'p, div, li, td, th, h1, h2, h3, h4, h5, h6, blockquote, dd, dt';
  const SKIP_TAGS = new Set([
    'SCRIPT',
    'STYLE',
    'NOSCRIPT',
    'TEXTAREA',
    'INPUT',
    'SELECT',
    'OPTION',
    'CODE',
    'PRE',
    'SVG',
    'MATH',
    'A',
    'BUTTON'
  ]);

  let sentenceSegmenter = null;
  let sentenceIdCounter = 0;
  let selectionAnchor = null;
  let lastPointerUpTs = 0;
  let pendingOutsideTap = false;
  const OUTSIDE_CLEAR_DELAYS_MS = [120, 300];

  const isNodeBefore = (a, b) => {
    if (!a || !b) return false;
    if (a === b) return true;
    return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  };

  const getEarlierNode = (a, b) => (isNodeBefore(a, b) ? a : b);
  const getLaterNode = (a, b) => (isNodeBefore(a, b) ? b : a);
  const isNodeInDocument = (node) => Boolean(node && document.contains(node));

  const initSentenceSegmenter = () => {
    if (sentenceSegmenter) return sentenceSegmenter;
    if (!Intl?.Segmenter) {
      console.warn('[QuickSelectExtension] Intl.Segmenter is not supported in this browser.');
      return null;
    }
    const lang = document.documentElement.lang || navigator.language || 'en';
    sentenceSegmenter = new Intl.Segmenter(lang, { granularity: 'sentence' });
    return sentenceSegmenter;
  };

  const isSkippableNode = (node) => {
    if (!node?.parentElement) return true;
    const parent = node.parentElement;
    if (parent.isContentEditable) return true;
    if (parent.closest(`${CUSTOM_SENTENCE_TAG}[${CUSTOM_SENTENCE_ATTR}="${CUSTOM_SENTENCE_ATTR_VALUE}"]`)) return true;
    if (SKIP_TAGS.has(parent.tagName)) return true;
    return false;
  };

  // 新規: テキストノードを収集する関数
  const collectTextNodes = (root) => {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (!node?.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          if (isSkippableNode(node)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textNodes = [];
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }
    return textNodes;
  };

  // 新規: 連続するテキストノードをグループ化
  const groupTextNodesByParent = (textNodes) => {
    const groups = [];
    let currentGroup = [];
    let currentParent = null;

    textNodes.forEach(node => {
      const parent = node.parentElement;
      if (parent !== currentParent) {
        if (currentGroup.length > 0) {
          groups.push({ parent: currentParent, nodes: currentGroup });
        }
        currentParent = parent;
        currentGroup = [node];
      } else {
        currentGroup.push(node);
      }
    });

    if (currentGroup.length > 0) {
      groups.push({ parent: currentParent, nodes: currentGroup });
    }

    return groups;
  };

  // 新規: 親要素内の全テキストを取得
  const getFullTextFromParent = (parent) => {
    let text = '';
    const walker = document.createTreeWalker(
      parent,
      NodeFilter.SHOW_TEXT,
      null
    );
    
    while (walker.nextNode()) {
      if (!isSkippableNode(walker.currentNode)) {
        text += walker.currentNode.nodeValue;
      }
    }
    return text;
  };

  // 新規: <br> を境界としてテキストノードを分割
  const collectTextNodeRuns = (parent) => {
    const runs = [];
    let currentRun = [];

    const walker = document.createTreeWalker(
      parent,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === 'BR') return NodeFilter.FILTER_ACCEPT;
            if (node.isContentEditable) return NodeFilter.FILTER_REJECT;
            if (SKIP_TAGS.has(node.tagName)) return NodeFilter.FILTER_REJECT;
            if (node.closest(`${CUSTOM_SENTENCE_TAG}[${CUSTOM_SENTENCE_ATTR}="${CUSTOM_SENTENCE_ATTR_VALUE}"]`)) {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_SKIP;
          }

          if (node.nodeType === Node.TEXT_NODE) {
            if (!node?.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
            if (isSkippableNode(node)) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }

          return NodeFilter.FILTER_REJECT;
        }
      }
    );

    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR') {
        if (currentRun.length > 0) {
          runs.push(currentRun);
          currentRun = [];
        }
        continue;
      }

      if (node.nodeType === Node.TEXT_NODE) {
        currentRun.push(node);
      }
    }

    if (currentRun.length > 0) {
      runs.push(currentRun);
    }

    return runs;
  };

  // 新規: テキストノードの配列を文単位にラップ
  const wrapSentenceRun = (nodes) => {
    if (!nodes || nodes.length === 0) return;

    const segmenter = initSentenceSegmenter();
    if (!segmenter) return;

    const fullText = nodes.map(node => node.nodeValue || '').join('');
    if (!fullText.trim()) return;

    const segments = Array.from(segmenter.segment(fullText));
    if (!segments.length) return;

    const sentenceBoundaries = [];
    segments.forEach(({ segment, index }) => {
      if (!/^\s+$/.test(segment)) {
        sentenceIdCounter += 1;
        sentenceBoundaries.push({
          id: sentenceIdCounter,
          start: index,
          end: index + segment.length,
          text: segment
        });
      }
    });

    let currentOffset = 0;
    const nodesToProcess = nodes.map(node => {
      const startOffset = currentOffset;
      const endOffset = currentOffset + node.nodeValue.length;
      currentOffset = endOffset;
      return { node, startOffset, endOffset };
    });

    nodesToProcess.forEach(({ node, startOffset, endOffset }) => {
      const nodeValue = node.nodeValue;
      const fragment = document.createDocumentFragment();

      let lastPos = 0;
      sentenceBoundaries.forEach(({ id, start, end }) => {
        const overlapStart = Math.max(start, startOffset);
        const overlapEnd = Math.min(end, endOffset);

        if (overlapStart < overlapEnd) {
          const localStart = overlapStart - startOffset;
          const localEnd = overlapEnd - startOffset;

          if (lastPos < localStart) {
            fragment.appendChild(document.createTextNode(nodeValue.substring(lastPos, localStart)));
          }

          const wrapper = document.createElement(CUSTOM_SENTENCE_TAG);
          wrapper.setAttribute(CUSTOM_SENTENCE_ATTR, CUSTOM_SENTENCE_ATTR_VALUE);
          wrapper.setAttribute('data-sentence-id', id);
          wrapper.textContent = nodeValue.substring(localStart, localEnd);
          fragment.appendChild(wrapper);

          lastPos = localEnd;
        }
      });

      if (lastPos < nodeValue.length) {
        fragment.appendChild(document.createTextNode(nodeValue.substring(lastPos)));
      }

      if (fragment.hasChildNodes()) {
        node.parentNode?.replaceChild(fragment, node);
      }
    });
  };

  // 修正: 親要素単位で文をセグメント化
  const wrapSentencesInParent = (parent) => {
    if (!parent) return;

    const runs = collectTextNodeRuns(parent);
    if (!runs.length) return;

    runs.forEach(run => {
      wrapSentenceRun(run);
    });
  };

  const wrapSentencesInRoot = (root) => {
    if (!root) return;
    
    // ブロックレベル要素ごとに処理
    const blockElements = root.querySelectorAll(BLOCK_SELECTOR);
    
    blockElements.forEach(element => {
      if (!element.closest(`${CUSTOM_SENTENCE_TAG}[${CUSTOM_SENTENCE_ATTR}="${CUSTOM_SENTENCE_ATTR_VALUE}"]`)) {
        wrapSentencesInParent(element);
      }
    });
    
    // body直下のテキストノードも処理
    const directTextNodes = collectTextNodes(root).filter(node => node.parentElement === root);
    if (directTextNodes.length > 0) {
      wrapSentencesInParent(root);
    }
  };

  const unwrapSentenceTags = () => {
    const sentenceTags = document.querySelectorAll(`${CUSTOM_SENTENCE_TAG}[${CUSTOM_SENTENCE_ATTR}="${CUSTOM_SENTENCE_ATTR_VALUE}"]`);
    sentenceTags.forEach(tag => {
      tag.replaceWith(document.createTextNode(tag.textContent || ''));
    });
  };

  const handleSentenceClick = (event) => {
    const target = event.target?.closest?.(`${CUSTOM_SENTENCE_TAG}[${CUSTOM_SENTENCE_ATTR}="${CUSTOM_SENTENCE_ATTR_VALUE}"]`);
    if (!target) return;

    if (event?.type === 'pointerup') {
      lastPointerUpTs = Date.now();
    } else if (event?.type === 'click') {
      if (Date.now() - lastPointerUpTs < 400) return;
    }

    pendingOutsideTap = false;
    const sentenceId = target.getAttribute('data-sentence-id');
    const scope = target.closest(BLOCK_SELECTOR) || target.parentElement || document.body || document.documentElement;
    const sentenceParts = scope.querySelectorAll(`${CUSTOM_SENTENCE_TAG}[data-sentence-id="${sentenceId}"]`);
    if (!sentenceParts.length) return;

    const firstPart = sentenceParts[0];
    const lastPart = sentenceParts[sentenceParts.length - 1];

    const selection = window.getSelection();
    if (!selection) return;

    const shouldExtend = Boolean(config?.configExtendSelection);

    if (!shouldExtend) {
      selectionAnchor = null;
      const range = document.createRange();
      range.setStartBefore(firstPart);
      range.setEndAfter(lastPart);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      if (!selectionAnchor || !isNodeInDocument(selectionAnchor.startNode) || !isNodeInDocument(selectionAnchor.endNode)) {
        selectionAnchor = { startNode: firstPart, endNode: lastPart };
      }

      const startNode = getEarlierNode(selectionAnchor.startNode, firstPart);
      const endNode = getLaterNode(selectionAnchor.endNode, lastPart);

      const range = document.createRange();
      range.setStartBefore(startNode);
      range.setEndAfter(endNode);
      selection.removeAllRanges();
      selection.addRange(range);
    }

  };

  const enableSentenceMode = () => {
    unwrapSentenceTags();
    selectionAnchor = null;
    sentenceIdCounter = 0;
    const root = document.body || document.documentElement;
    if (root) {
      wrapSentencesInRoot(root);
    }

    document.addEventListener('click', handleSentenceClick, true);
  };

  const disableSentenceMode = () => {
    document.removeEventListener('click', handleSentenceClick, true);
    unwrapSentenceTags();
    sentenceIdCounter = 0;
    selectionAnchor = null;
    pendingOutsideTap = false;
  };

  const handleOutsideSelectionClear = (event) => {
    if (!config?.configExtendSelection) return;
    if (!selectionAnchor) return;
    const isSentenceTarget = event.target?.closest?.(`${CUSTOM_SENTENCE_TAG}[${CUSTOM_SENTENCE_ATTR}="${CUSTOM_SENTENCE_ATTR_VALUE}"]`);
    if (isSentenceTarget) return;

    pendingOutsideTap = true;

    const checkAndClear = () => {
      if (!pendingOutsideTap) return;
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        selectionAnchor = null;
        pendingOutsideTap = false;
      }
    };

    requestAnimationFrame(checkAndClear);
    OUTSIDE_CLEAR_DELAYS_MS.forEach((delay) => {
      setTimeout(checkAndClear, delay);
    });
  };

  const handleSelectionChange = () => {
    if (!config?.configExtendSelection) return;
    if (!selectionAnchor) return;
    if (!pendingOutsideTap) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      selectionAnchor = null;
      pendingOutsideTap = false;
    }
  };

  // ========================================
  // Configuration Application
  // ========================================
  const applyConfig = (newConfig) => {
//    console.log('[QuickSelectExtension] Apply config:', newConfig);
    config = { ...DEFAULT_SETTINGS, ...newConfig };

    toggleQuickSelectCSS(config);
    toggleEventRestrictions(config);
//    toggleDOMObserver(config);
    requestUpdateIconToBackground();

    if (config.configEnabled) {
      if (config.configGranularity === 'sentence') {
        enableSentenceMode();
      } else {
        disableSentenceMode();
      }
    } else {
      disableSentenceMode();
    }

  };

  // ========================================
  // Extension for Safari (macOS/iOS):
  // Core logic for removing selection & copy restrictions
  // ========================================
  let selectionObserver = null;
  const RESTRICTION_EVENTS = ['contextmenu', 'selectstart', 'copy', 'cut', 'paste', 'dragstart'];

  // ========================================
  // Toggle CSS rules to force user-select and touch-callout
  // ========================================
  const toggleQuickSelectCSS = (config) => {
    const STYLE_ID = 'QuickSelectStyle';
    let existingLink = document.getElementById(STYLE_ID);

    if (!config?.configEnabled) {
      existingLink?.remove();
      return;
    }

    if (!existingLink) {
      const link = document.createElement('link');
      link.id = STYLE_ID;
      link.rel = 'stylesheet';
      link.href = browser.runtime.getURL('quickselect-ext.css');
      document.documentElement.appendChild(link); // Immediate injection to <html>
    }
  };

  // ========================================
  // Intercept and block restriction events at the capture phase
  // ========================================
  const handleRestrictionEvent = (event) => {
    event.stopPropagation();
    event.stopImmediatePropagation();
    // Do not call preventDefault() to keep native browser behavior
  };

  // ========================================
  // Toggle JS-based event listeners
  // ========================================
  const toggleEventRestrictions = (config) => {
    const method = config?.configEnabled ? 'addEventListener' : 'removeEventListener';
    
    RESTRICTION_EVENTS.forEach(type => {
      window[method](type, handleRestrictionEvent, { capture: true });
    });
  };

  // ========================================
  // Observe DOM changes for SPA and lazy-loaded content
  // ========================================
  const toggleDOMObserver = (config) => {
    if (!config?.configEnabled) {
      selectionObserver?.disconnect();
      selectionObserver = null;
      return;
    }

    if (selectionObserver) return;

    selectionObserver = new MutationObserver(() => {
      // Re-verify styles if necessary for dynamic elements
    });

    selectionObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  };

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;

    try {
      const stored = await browser.storage.local.get('settings');
      const freshConfig = { ...DEFAULT_SETTINGS, ...stored.settings };
      applyConfig(freshConfig);
    } catch (error) {
      console.warn('[QuickSelectExtension] Storage refresh failed, fallback to background');
      requestConfigFromBackground();
    }
  });

  document.addEventListener('pointerdown', handleOutsideSelectionClear, true);
  document.addEventListener('mousedown', handleOutsideSelectionClear, true);
  document.addEventListener('touchstart', handleOutsideSelectionClear, true);
  document.addEventListener('click', handleOutsideSelectionClear, true);
  document.addEventListener('selectionchange', handleSelectionChange, true);

  // ========================================
  // Config update: Receive from background
  // ========================================
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CONFIG_UPDATED') {
      applyConfig(message.config);

      sendResponse({ success: true });
    }
    
    return true;
  });

  // ========================================
  // Initialization: Load config from storage
  // ========================================
  (async () => {
    try {
      const stored = await browser.storage.local.get('settings');
      config = { ...DEFAULT_SETTINGS, ...stored.settings };

      if (config.configEnabled) {
        applyConfig(config);
      }
    } catch (error) {
      console.error('[QuickSelectExtension] Failed to load config:', error);
      requestConfigFromBackground();
    }
  })();

  let isInitialized = false;
  const initializeContent = async () => {
    if (isInitialized) return;
    isInitialized = true;

    if (config.configEnabled) {
      if (config.configGranularity === 'sentence') {
        enableSentenceMode();
      } else {
        disableSentenceMode();
      }
    } else {
      disableSentenceMode();
    }

  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeContent, { once: true });
  } else {
    initializeContent();
  }
})();
