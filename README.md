# <img src="https://raw.githubusercontent.com/hkitago/QuickSelect/refs/heads/main/Shared%20(Extension)/Resources/images/icon.svg" height="36" valign="bottom"/> QuickSelect for Safari Extension

This Safari extension enables fast, precise text selection on any webpage by letting you select text at the paragraph, sentence, or word level, with an option to extend the current selection. It works across all parts of the site, respects editable fields and code blocks, and adapts to the content language using built-in sentence segmentation when system support is available. A simple toolbar toggle and status icon make it easy to see when it’s active and which mode is selected.

When text selection feels inconsistent or hard to control, this extension provides a more predictable alternative. Designed for people who read or research online, it supports cleaner quoting, translation, and note-taking workflows. It’s ideal for students, writers, editors, translators, and anyone working across multiple languages. If you regularly scan long articles, compare passages, or collect snippets for documents or study materials, it helps keep text selection consistent and reliable without breaking your flow.

## Installation & Uninstallation

### Installation

To install the extension on iOS or iPadOS, go to Settings > Apps > Safari > Extensions, or enable the extension by toggling it on in the Manage Extensions option found in the Safari address bar.
For macOS, open Safari, go to Safari > Settings > Extensions, and enable the extension from there.

### Uninstallation

To uninstall the extension, similarly to the installation process, toggle the extension off, or remove it completely by selecting the extension icon on the Home Screen and choosing "Delete app".

## Usage

1. Open a webpage in Safari.
2. Tap or click the icon next to the address bar and choose the extension.
3. Switch the "Enable" toggle to ON.
4. Choose a selection level: Paragraph, Sentence, or Word.
5. (Optional) Turn on "Extend Selection" if you want to select multiple areas without clearing your previous selection.
6. Tap or click any text on the page to select it at your chosen level.

> [!IMPORTANT]
> The DOM observer is disabled by design (see toggleDOMObserver). Word-level segmentation introduces a large number of wrapper elements, which can significantly increase DOM size and impact performance.  
> As a result, some highly dynamic pages (such as generative AI services) may not work as expected.

## Latest Version

### 1.0 - 2026-02-XX

- Initial release with basic features

## Known Issues

Ad-heavy websites that frequently update content (e.g., sites using SafeFrame ads), iOS Safari may:

- Clear your text selection unexpectedly.
- Prevent the "Copy" menu from appearing.

## Compatibility

- iOS/iPadOS 16.6+
- macOS 12.4+

## License

This project is open-source and available under the [MIT License](LICENSE). Feel free to use and modify it as needed.

## Contact

You can reach me via [email](mailto:hkitago@icloud.com?subject=Support%20for%20QuickSelect).

## Additional Information

### Related Links

- [Get extensions to customize Safari on iPhone - Apple Support](https://support.apple.com/guide/iphone/iphab0432bf6/18.0/ios/18.0)
- [Get extensions to customize Safari on Mac - Apple Support](https://support.apple.com/guide/safari/get-extensions-sfri32508/mac)
- [Use Safari extensions on your Mac – Apple Support](https://support.apple.com/102343)
- Privacy Policy Page: [Privacy Policy – hkitago software dev](https://hkitago.com/wpautoterms/privacy-policy/)
- Support Page: [hkitago/QuickSelect](https://github.com/hkitago/QuickSelect/)
