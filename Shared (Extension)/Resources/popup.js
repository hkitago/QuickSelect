import { getCurrentLangLabelString, applyRTLSupport } from './localization.js';
import { applyPlatformClass, settings } from './utils.js';

const buildPopup = (settings) => {
  applyPlatformClass();
  applyRTLSupport();

  // Radios
  const configRadioBtns = [
    { key: 'granularityParagraph', label: `${getCurrentLangLabelString('granularityParagraph')}` },
    { key: 'granularitySentence', label: `${getCurrentLangLabelString('granularitySentence')}` },
    { key: 'granularityWord', label: `${getCurrentLangLabelString('granularityWord')}` },
  ];

  // Checkboxes
  const configCheckboxes = [
    { key: 'configEnabled', label: `${getCurrentLangLabelString('configEnabled')}` },
    { key: 'configExtendSelection', label: `${getCurrentLangLabelString('configExtendSelection')}` },
  ];

  const toggleCursors = (isEnabled) => {
    const parentIds = ['#configGranularities', '#configOptions'];
    const selector = parentIds.flatMap(id => [
      `${id} label`,
      `${id} .checkmark`,
      `${id} .toggle`
    ]).join(', ');

    const selectorElements = document.querySelectorAll(selector);
    const cursorStyle = isEnabled ? 'pointer' : 'default';
    const pointerEventsStyle = isEnabled ? 'auto' : 'none';

    selectorElements.forEach(element => {
      element.style.cursor = cursorStyle;
      element.style.pointerEvents = pointerEventsStyle;
    });
  };

  const toggleConfigEnabled = async (event) => {
    const isConfigEnabled = settings.get('configEnabled');;
    const configGranularities = document.getElementById('configGranularities');
    const configOptions = document.getElementById('configOptions');

    if (isConfigEnabled) {
      toggleCursors(true);
      configGranularities.style.opacity = '1';
      configOptions.style.opacity = '1';
    } else {
      toggleCursors(false);
      configGranularities.style.opacity = '0.5';
      configOptions.style.opacity = '0.5';
    }
  };

  const renderRadioBtns = () => {
    const currentGranularity = settings.get('configGranularity');

    configRadioBtns.forEach(({ key, label }) => {
      const radio = document.getElementById(key);
      const labelElement = document.querySelector(`label[for="${key}"]`);
      if (!radio || !labelElement) return;

      labelElement.textContent = label;

      radio.checked = (radio.value === currentGranularity);

      const checkmarkSpan = radio.nextElementSibling;
      if (checkmarkSpan) {
        checkmarkSpan.addEventListener('click', () => {
          radio.click();
        });
      }

      radio.addEventListener('change', async () => {
        if (radio.checked) {
          await settings.set('configGranularity', radio.value);
        }
      });
    });
  };

  const renderCheckboxes = () => {
    configCheckboxes.forEach(({ key, label }) => {
      const checkbox = document.getElementById(key);
      const labelElement = document.querySelector(`label[for="${key}"]`);
      if (!checkbox || !labelElement) return;

      labelElement.textContent = label;

      checkbox.checked = settings.get(key);

      checkbox.addEventListener('click', (event) => {
        event.target.classList.remove('toggle-disabled');
      });

      const toggleSpan = checkbox.nextElementSibling;
      if (toggleSpan) {
        toggleSpan.addEventListener('click', () => {
          checkbox.click();
        });
      }

      checkbox.addEventListener('change', async () => {
        checkbox.classList.remove('toggle-disabled');
        await settings.set(key, checkbox.checked);

        if (key === 'configEnabled') {
          toggleConfigEnabled();
        }
      });
    });

    toggleConfigEnabled();
  };

  renderRadioBtns();
  renderCheckboxes();
};

let isInitialized = false;

const initializePopup = async () => {
  if (isInitialized) return;
  isInitialized = true;
  
  await settings.load();
  try {
    await buildPopup(settings);
  } catch (error) {
    console.error('[QuickSelectExtension] Fail to initialize to build the popup:', error);
    isInitialized = false;
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePopup, { once: true });
} else {
  initializePopup();
}
