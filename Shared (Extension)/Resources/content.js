(() => {
  const DEFAULT_SETTINGS = {
    configEnabled: false,
    configGranularity: 'paragraph',
    configExtendSelection: false,
  };

  let config = { ...DEFAULT_SETTINGS };
  let lastAppliedSelectionState = null;

  browser.storage.onChanged.addListener(async (changes, area) => {
    if (area === 'local' && changes.settings) {
      const nextConfig = { ...DEFAULT_SETTINGS, ...changes.settings.newValue };
      applyConfig(nextConfig);
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
  const CUSTOM_WORD_TAG = 'span';
  const CUSTOM_WORD_ATTR = 'data-qs';
  const CUSTOM_WORD_ATTR_VALUE = 'word';
  const SENTENCE_SELECTOR = `${CUSTOM_SENTENCE_TAG}[${CUSTOM_SENTENCE_ATTR}="${CUSTOM_SENTENCE_ATTR_VALUE}"]`;
  const WORD_SELECTOR = `${CUSTOM_WORD_TAG}[${CUSTOM_WORD_ATTR}="${CUSTOM_WORD_ATTR_VALUE}"]`;
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
  const SKIP_SELECTOR = Array.from(SKIP_TAGS).map(tag => tag.toLowerCase()).join(', ');

  let sentenceSegmenter = null;
  let wordSegmenter = null;
  let sentenceIdCounter = 0;
  let wordIdCounter = 0;
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

  const getActiveSegmentSelector = () => {
    if (config?.configGranularity === 'sentence') return SENTENCE_SELECTOR;
    if (config?.configGranularity === 'word') return WORD_SELECTOR;
    return null;
  };

  const isActiveSegmentTarget = (target) => {
    const selector = getActiveSegmentSelector();
    if (selector) return Boolean(target?.closest?.(selector));
    if (config?.configGranularity === 'paragraph') {
      return Boolean(getParagraphElementFromTarget(target));
    }
    return false;
  };

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

  const initWordSegmenter = () => {
    if (wordSegmenter) return wordSegmenter;
    if (!Intl?.Segmenter) {
      console.warn('[QuickSelectExtension] Intl.Segmenter is not supported in this browser.');
      return null;
    }
    const lang = document.documentElement.lang || navigator.language || 'en';
    wordSegmenter = new Intl.Segmenter(lang, { granularity: 'word' });
    return wordSegmenter;
  };

  const isSkippableNode = (node) => {
    if (!node?.parentElement) return true;
    const parent = node.parentElement;
    if (parent.isContentEditable) return true;
    if (parent.closest(SENTENCE_SELECTOR)) return true;
    if (parent.closest(WORD_SELECTOR)) return true;
    if (SKIP_TAGS.has(parent.tagName)) return true;
    return false;
  };

  const isInsideSkippableElement = (target) => {
    if (!target?.closest || !SKIP_SELECTOR) return false;
    return Boolean(target.closest(SKIP_SELECTOR));
  };

  const isRangeInDocument = (range) => {
    if (!range?.startContainer || !range?.endContainer) return false;
    return document.contains(range.startContainer) && document.contains(range.endContainer);
  };

  const findTextNodeInElement = (element, direction = 'first') => {
    if (!element) return null;
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (!node?.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    if (direction === 'last') {
      let last = null;
      while (walker.nextNode()) {
        last = walker.currentNode;
      }
      return last;
    }

    return walker.nextNode() ? walker.currentNode : null;
  };

  const resolveTextNodeFromPosition = (node, offset) => {
    if (!node) return null;
    if (node.nodeType === Node.TEXT_NODE) return node;
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const element = node;
    if (!element.childNodes || element.childNodes.length === 0) {
      return findTextNodeInElement(element, 'first');
    }

    const clampedOffset = Math.max(0, Math.min(offset ?? 0, element.childNodes.length));
    let child = element.childNodes[clampedOffset] || element.childNodes[clampedOffset - 1];
    if (!child) {
      return findTextNodeInElement(element, 'first');
    }

    if (child.nodeType === Node.TEXT_NODE) return child;
    if (child.nodeType === Node.ELEMENT_NODE) {
      const direction = clampedOffset >= element.childNodes.length ? 'last' : 'first';
      return findTextNodeInElement(child, direction) || findTextNodeInElement(element, 'first');
    }

    return findTextNodeInElement(element, 'first');
  };

  const getTextNodeAtPoint = (element, x, y) => {
    if (!element || x == null || y == null) return null;
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (!node?.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    while (walker.nextNode()) {
      const textNode = walker.currentNode;
      const range = document.createRange();
      range.selectNodeContents(textNode);
      const rects = range.getClientRects();
      for (const rect of rects) {
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          return textNode;
        }
      }
    }

    return null;
  };

  const getPointNodeFromEvent = (event) => {
    if (!event || event.clientX == null || event.clientY == null) return null;
    if (document.caretPositionFromPoint) {
      const position = document.caretPositionFromPoint(event.clientX, event.clientY);
      return resolveTextNodeFromPosition(position?.offsetNode ?? null, position?.offset ?? 0)
        ?? position?.offsetNode
        ?? null;
    }
    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(event.clientX, event.clientY);
      return resolveTextNodeFromPosition(range?.startContainer ?? null, range?.startOffset ?? 0)
        ?? range?.startContainer
        ?? null;
    }
    if (event.rangeParent) {
      return resolveTextNodeFromPosition(event.rangeParent, event.rangeOffset ?? 0)
        ?? event.rangeParent
        ?? null;
    }

    const element = document.elementFromPoint(event.clientX, event.clientY);
    if (element) {
      return getTextNodeAtPoint(element, event.clientX, event.clientY) ?? element;
    }

    return null;
  };

  const getParagraphElementFromTarget = (target) => {
    if (!target) return null;
    const element = target.nodeType === Node.ELEMENT_NODE ? target : target.parentElement;
    if (!element) return null;
    if (isInsideSkippableElement(element)) return null;

    let current = element;
    while (current && current !== document.body && current !== document.documentElement) {
      if (current.matches?.(BLOCK_SELECTOR)) {
        if (current.isContentEditable) return null;
        if (SKIP_TAGS.has(current.tagName)) return null;
        if (!current.querySelector(BLOCK_SELECTOR)) return current;
      }
      current = current.parentElement;
    }

    if (document.body && !document.body.querySelector(BLOCK_SELECTOR)) {
      return document.body;
    }

    return null;
  };

  const collectDoubleBrSequences = (container) => {
    const sequences = [];
    let current = null;

    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT,
      {
        acceptNode: (node) => {
          if (node.nodeType === Node.COMMENT_NODE) return NodeFilter.FILTER_REJECT;
          if (node.nodeType === Node.TEXT_NODE) {
            return node.nodeValue?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
          }
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (SKIP_TAGS.has(node.tagName)) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_REJECT;
        }
      }
    );

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const isBr = node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR';

      if (isBr) {
        if (!current) {
          current = { firstBr: node, lastBr: node, length: 1 };
        } else {
          current.lastBr = node;
          current.length += 1;
        }
        continue;
      }

      if (current && current.length >= 2) {
        sequences.push(current);
      }
      current = null;
    }

    if (current && current.length >= 2) {
      sequences.push(current);
    }

    return sequences;
  };

  const getParagraphRangeFromDoubleBr = (container, target) => {
    const sequences = collectDoubleBrSequences(container);
    if (!sequences.length) return null;

    let targetNode = target?.nodeType === Node.TEXT_NODE ? target : null;
    if (!targetNode) {
      targetNode = target?.nodeType === Node.ELEMENT_NODE ? target : target?.parentElement;
    }
    if (!targetNode) return null;
    if (!container.contains(targetNode) && container !== targetNode) return null;

    let prev = null;
    let next = null;

    if (targetNode.nodeType === Node.ELEMENT_NODE && targetNode.tagName === 'BR') {
      const targetIndex = sequences.findIndex(seq =>
        isNodeBefore(seq.firstBr, targetNode) && isNodeBefore(targetNode, seq.lastBr)
      );
      if (targetIndex >= 0) {
        prev = sequences[targetIndex];
        next = sequences[targetIndex + 1] ?? null;
      }
    }

    if (!prev && !next) {
      for (const seq of sequences) {
        if (isNodeBefore(seq.lastBr, targetNode)) {
          prev = seq;
          continue;
        }
        if (isNodeBefore(targetNode, seq.firstBr)) {
          next = seq;
          break;
        }
      }
    }

    const range = document.createRange();
    if (prev) {
      range.setStartAfter(prev.lastBr);
    } else {
      range.setStartBefore(container);
    }

    if (next) {
      range.setEndBefore(next.firstBr);
    } else {
      range.setEndAfter(container);
    }

    return range;
  };

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
            if (node.closest(SENTENCE_SELECTOR)) {
              return NodeFilter.FILTER_REJECT;
            }
            if (node.closest(WORD_SELECTOR)) {
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

  const collectTextNodeRunsOutsideBlocks = (container) => {
    const runs = [];
    let currentRun = [];

    const pushRun = () => {
      if (currentRun.length > 0) {
        runs.push(currentRun);
        currentRun = [];
      }
    };

    const traverse = (node) => {
      if (!node) return;

      if (node.nodeType === Node.TEXT_NODE) {
        if (!node.nodeValue || !node.nodeValue.trim()) return;
        if (isSkippableNode(node)) return;
        currentRun.push(node);
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const element = node;

      if (element.tagName === 'BR') {
        pushRun();
        return;
      }

      if (element.isContentEditable) return;
      if (SKIP_TAGS.has(element.tagName)) return;
      if (element.closest(SENTENCE_SELECTOR) || element.closest(WORD_SELECTOR)) return;

      if (element.matches?.(BLOCK_SELECTOR)) {
        pushRun();
        return;
      }

      element.childNodes.forEach(traverse);
    };

    container.childNodes.forEach(traverse);
    pushRun();

    return runs;
  };

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
    
    const blockElements = Array.from(root.querySelectorAll(BLOCK_SELECTOR));
    blockElements.forEach(element => {
      if (element.closest(SENTENCE_SELECTOR)) return;
      const runs = collectTextNodeRunsOutsideBlocks(element);
      runs.forEach(run => {
        wrapSentenceRun(run);
      });
    });
    
    const outsideRuns = collectTextNodeRunsOutsideBlocks(root);
    outsideRuns.forEach(run => {
      wrapSentenceRun(run);
    });
  };

  const unwrapSentenceTags = () => {
    const sentenceTags = document.querySelectorAll(SENTENCE_SELECTOR);
    sentenceTags.forEach(tag => {
      tag.replaceWith(document.createTextNode(tag.textContent || ''));
    });
  };

  const handleSentenceClick = (event) => {
    const target = event.target?.closest?.(SENTENCE_SELECTOR);
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
    disableWordMode();
    disableParagraphMode();
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
    const isSegmentTarget = isActiveSegmentTarget(event.target);
    if (isSegmentTarget) return;

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
  // Word Segmentation
  // ========================================
  const wrapWordRun = (nodes) => {
    if (!nodes || nodes.length === 0) return;

    const segmenter = initWordSegmenter();
    if (!segmenter) return;

    const fullText = nodes.map(node => node.nodeValue || '').join('');
    if (!fullText.trim()) return;

    const segments = Array.from(segmenter.segment(fullText));
    if (!segments.length) return;

    const wordBoundaries = [];
    segments.forEach(({ segment, index, isWordLike }) => {
      if (!isWordLike) return;
      if (!segment || /^\s+$/.test(segment)) return;
      wordIdCounter += 1;
      wordBoundaries.push({
        id: wordIdCounter,
        start: index,
        end: index + segment.length,
        text: segment
      });
    });

    if (!wordBoundaries.length) return;

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
      wordBoundaries.forEach(({ id, start, end }) => {
        const overlapStart = Math.max(start, startOffset);
        const overlapEnd = Math.min(end, endOffset);

        if (overlapStart < overlapEnd) {
          const localStart = overlapStart - startOffset;
          const localEnd = overlapEnd - startOffset;

          if (lastPos < localStart) {
            fragment.appendChild(document.createTextNode(nodeValue.substring(lastPos, localStart)));
          }

          const wrapper = document.createElement(CUSTOM_WORD_TAG);
          wrapper.setAttribute(CUSTOM_WORD_ATTR, CUSTOM_WORD_ATTR_VALUE);
          wrapper.setAttribute('data-word-id', id);
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

  const wrapWordsInParent = (parent) => {
    if (!parent) return;

    const runs = collectTextNodeRuns(parent);
    if (!runs.length) return;

    runs.forEach(run => {
      wrapWordRun(run);
    });
  };

  const wrapWordsInRoot = (root) => {
    if (!root) return;

    const blockElements = Array.from(root.querySelectorAll(BLOCK_SELECTOR));
    blockElements.forEach(element => {
      if (element.closest(WORD_SELECTOR)) return;
      const runs = collectTextNodeRunsOutsideBlocks(element);
      runs.forEach(run => {
        wrapWordRun(run);
      });
    });

    const outsideRuns = collectTextNodeRunsOutsideBlocks(root);
    outsideRuns.forEach(run => {
      wrapWordRun(run);
    });
  };

  const unwrapWordTags = () => {
    const wordTags = document.querySelectorAll(WORD_SELECTOR);
    wordTags.forEach(tag => {
      tag.replaceWith(document.createTextNode(tag.textContent || ''));
    });
  };

  const getContiguousWordParts = (target, wordId, scope) => {
    const wordParts = Array.from(scope.querySelectorAll(`${CUSTOM_WORD_TAG}[data-word-id="${wordId}"]`));
    if (!wordParts.length) return [];

    const targetIndex = wordParts.indexOf(target);
    if (targetIndex === -1) return [target];

    const hasNoTextBetween = (left, right) => {
      const range = document.createRange();
      range.setStartAfter(left);
      range.setEndBefore(right);
      return range.toString().length === 0;
    };

    let start = targetIndex;
    for (let i = targetIndex - 1; i >= 0; i--) {
      if (!hasNoTextBetween(wordParts[i], wordParts[i + 1])) break;
      start = i;
    }

    let end = targetIndex;
    for (let i = targetIndex; i < wordParts.length - 1; i++) {
      if (!hasNoTextBetween(wordParts[i], wordParts[i + 1])) break;
      end = i + 1;
    }

    return wordParts.slice(start, end + 1);
  };

  const handleWordClick = (event) => {
    const target = event.target?.closest?.(WORD_SELECTOR);
    if (!target) return;

    if (event?.type === 'pointerup') {
      lastPointerUpTs = Date.now();
    } else if (event?.type === 'click') {
      if (Date.now() - lastPointerUpTs < 400) return;
    }

    pendingOutsideTap = false;
    const wordId = target.getAttribute('data-word-id');
    const scope = target.closest(BLOCK_SELECTOR) || target.parentElement || document.body || document.documentElement;
    const wordParts = getContiguousWordParts(target, wordId, scope);
    if (!wordParts.length) return;

    const firstPart = wordParts[0];
    const lastPart = wordParts[wordParts.length - 1];

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

  const enableWordMode = () => {
    disableSentenceMode();
    disableParagraphMode();
    unwrapWordTags();
    selectionAnchor = null;
    wordIdCounter = 0;
    const root = document.body || document.documentElement;
    if (root) {
      wrapWordsInRoot(root);
    }

    document.addEventListener('click', handleWordClick, true);
  };

  const disableWordMode = () => {
    document.removeEventListener('click', handleWordClick, true);
    unwrapWordTags();
    wordIdCounter = 0;
    selectionAnchor = null;
    pendingOutsideTap = false;
  };

  // ========================================
  // Paragraph Selection
  // ========================================
  const handleParagraphClick = (event) => {
    const paragraph = getParagraphElementFromTarget(event.target);
    if (!paragraph) return;

    if (event?.type === 'pointerup') {
      lastPointerUpTs = Date.now();
    } else if (event?.type === 'click') {
      if (Date.now() - lastPointerUpTs < 400) return;
    }

    pendingOutsideTap = false;
    const selection = window.getSelection();
    if (!selection) return;

    const shouldExtend = Boolean(config?.configExtendSelection);
    const referenceNode = getPointNodeFromEvent(event) ?? event.target;
    const paragraphRange = getParagraphRangeFromDoubleBr(paragraph, referenceNode);
    const baseRange = paragraphRange ?? (() => {
      const range = document.createRange();
      range.setStartBefore(paragraph);
      range.setEndAfter(paragraph);
      return range;
    })();

    if (!shouldExtend) {
      selectionAnchor = null;
      selection.removeAllRanges();
      selection.addRange(baseRange);
    } else {
      if (!selectionAnchor?.range || !isRangeInDocument(selectionAnchor.range)) {
        selectionAnchor = { range: baseRange.cloneRange() };
      }

      const anchorRange = selectionAnchor.range;
      const startRange = anchorRange.compareBoundaryPoints(Range.START_TO_START, baseRange) <= 0
        ? anchorRange
        : baseRange;
      const endRange = anchorRange.compareBoundaryPoints(Range.END_TO_END, baseRange) >= 0
        ? anchorRange
        : baseRange;

      const range = document.createRange();
      range.setStart(startRange.startContainer, startRange.startOffset);
      range.setEnd(endRange.endContainer, endRange.endOffset);
      selectionAnchor = { range: range.cloneRange() };
      selection.removeAllRanges();
      selection.addRange(range);
    }
  };

  const enableParagraphMode = () => {
    disableSentenceMode();
    disableWordMode();
    selectionAnchor = null;
    document.addEventListener('click', handleParagraphClick, true);
  };

  const disableParagraphMode = () => {
    document.removeEventListener('click', handleParagraphClick, true);
    selectionAnchor = null;
    pendingOutsideTap = false;
  };

  // ========================================
  // Configuration Application
  // ========================================
  const applySelectionModeFromConfig = () => {
    const nextState = {
      enabled: Boolean(config.configEnabled),
      granularity: config.configGranularity ?? null
    };

    if (
      lastAppliedSelectionState &&
      lastAppliedSelectionState.enabled === nextState.enabled &&
      lastAppliedSelectionState.granularity === nextState.granularity
    ) {
      return;
    }

    lastAppliedSelectionState = nextState;

    if (config.configEnabled) {
      if (config.configGranularity === 'sentence') {
        enableSentenceMode();
      } else if (config.configGranularity === 'word') {
        enableWordMode();
      } else if (config.configGranularity === 'paragraph') {
        enableParagraphMode();
      } else {
        disableSentenceMode();
        disableWordMode();
        disableParagraphMode();
      }
    } else {
      disableSentenceMode();
      disableWordMode();
      disableParagraphMode();
    }
  };

  const applyConfig = (newConfig) => {
    config = { ...DEFAULT_SETTINGS, ...newConfig };

    toggleQuickSelectCSS(config);
    toggleEventRestrictions(config);
//    toggleDOMObserver(config);
    requestUpdateIconToBackground();

    applySelectionModeFromConfig();
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
    
    return;
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

    applySelectionModeFromConfig();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeContent, { once: true });
  } else {
    initializeContent();
  }
})();
