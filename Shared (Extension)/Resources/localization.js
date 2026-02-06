const labelStrings = {
  "en": { "configEnabled": "Enable", "granularityParagraph": "Paragraph", "granularitySentence": "Sentence", "granularityWord": "Word", "configExtendSelection": "Extend selection" },
  "ar": { "configEnabled": "تمكين", "granularityParagraph": "فقرة", "granularitySentence": "جملة", "granularityWord": "كلمة", "configExtendSelection": "توسيع التحديد" },
  "ar-SA": { "configEnabled": "تمكين", "granularityParagraph": "فقرة", "granularitySentence": "جملة", "granularityWord": "كلمة", "configExtendSelection": "توسيع التحديد" },
  "ca": { "configEnabled": "Activa", "granularityParagraph": "Paràgraf", "granularitySentence": "Frase", "granularityWord": "Paraula", "configExtendSelection": "Ampliar la selecció" },
  "cs": { "configEnabled": "Zapnout", "granularityParagraph": "Odstavec", "granularitySentence": "Věta", "granularityWord": "Slovo", "configExtendSelection": "Rozšířit výběr" },
  "da": { "configEnabled": "Aktiver", "granularityParagraph": "Afsnit", "granularitySentence": "Sætning", "granularityWord": "Ord", "configExtendSelection": "Udvid markering" },
  "de": { "configEnabled": "Aktivieren", "granularityParagraph": "Absatz", "granularitySentence": "Satz", "granularityWord": "Wort", "configExtendSelection": "Auswahl erweitern" },
  "el": { "configEnabled": "Ενεργοποίηση", "granularityParagraph": "Παράγραφος", "granularitySentence": "Πρόταση", "granularityWord": "Λέξη", "configExtendSelection": "Επέκταση επιλογής" },
  "en-AU": { "configEnabled": "Enable", "granularityParagraph": "Paragraph", "granularitySentence": "Sentence", "granularityWord": "Word", "configExtendSelection": "Extend selection" },
  "en-CA": { "configEnabled": "Enable", "granularityParagraph": "Paragraph", "granularitySentence": "Sentence", "granularityWord": "Word", "configExtendSelection": "Extend selection" },
  "en-GB": { "configEnabled": "Enable", "granularityParagraph": "Paragraph", "granularitySentence": "Sentence", "granularityWord": "Word", "configExtendSelection": "Extend selection" },
  "es": { "configEnabled": "Activar", "granularityParagraph": "Párrafo", "granularitySentence": "Frase", "granularityWord": "Palabra", "configExtendSelection": "Extender selección" },
  "es-MX": { "configEnabled": "Activar", "granularityParagraph": "Párrafo", "granularitySentence": "Oración", "granularityWord": "Palabra", "configExtendSelection": "Extender selección" },
  "fi": { "configEnabled": "Ota käyttöön", "granularityParagraph": "Kappale", "granularitySentence": "Lause", "granularityWord": "Sana", "configExtendSelection": "Laajenna valintaa" },
  "fr": { "configEnabled": "Activer", "granularityParagraph": "Paragraphe", "granularitySentence": "Phrase", "granularityWord": "Mot", "configExtendSelection": "Étendre la sélection" },
  "fr-CA": { "configEnabled": "Activer", "granularityParagraph": "Paragraphe", "granularitySentence": "Phrase", "granularityWord": "Mot", "configExtendSelection": "Étendre la sélection" },
  "he": { "configEnabled": "הפעל", "granularityParagraph": "פסקה", "granularitySentence": "משפט", "granularityWord": "מילה", "configExtendSelection": "הרחב בחירה" },
  "hi": { "configEnabled": "सक्षम करें", "granularityParagraph": "अनुच्छेद", "granularitySentence": "वाक्य", "granularityWord": "शब्द", "configExtendSelection": "चयन बढ़ाएं" },
  "hr": { "configEnabled": "Omogući", "granularityParagraph": "Odlomak", "granularitySentence": "Rečenica", "granularityWord": "Riječ", "configExtendSelection": "Proširi odabir" },
  "hu": { "configEnabled": "Engedélyezés", "granularityParagraph": "Bekezdés", "granularitySentence": "Mondat", "granularityWord": "Szó", "configExtendSelection": "Kijelölés kiterjesztése" },
  "id": { "configEnabled": "Aktifkan", "granularityParagraph": "Paragraf", "granularitySentence": "Kalimat", "granularityWord": "Kata", "configExtendSelection": "Perluas pilihan" },
  "it": { "configEnabled": "Abilita", "granularityParagraph": "Paragrafo", "granularitySentence": "Frase", "granularityWord": "Parola", "configExtendSelection": "Estendi selezione" },
  "ja": { "configEnabled": "有効", "granularityParagraph": "段落", "granularitySentence": "文", "granularityWord": "単語", "configExtendSelection": "選択範囲を拡張" },
  "ko-KR": { "configEnabled": "활성화", "granularityParagraph": "단락", "granularitySentence": "문장", "granularityWord": "단어", "configExtendSelection": "선택 영역 확장" },
  "ms": { "configEnabled": "Dayakan", "granularityParagraph": "Perenggan", "granularitySentence": "Ayat", "granularityWord": "Perkataan", "configExtendSelection": "Luaskan pilihan" },
  "nb": { "configEnabled": "Aktiver", "granularityParagraph": "Avsnitt", "granularitySentence": "Setning", "granularityWord": "Ord", "configExtendSelection": "Utvid markering" },
  "nl": { "configEnabled": "Inschakelen", "granularityParagraph": "Paragraaf", "granularitySentence": "Zin", "granularityWord": "Woord", "configExtendSelection": "Selectie uitbreiden" },
  "pl": { "configEnabled": "Włącz", "granularityParagraph": "Akapit", "granularitySentence": "Zdanie", "granularityWord": "Słowo", "configExtendSelection": "Rozszerz zaznaczenie" },
  "pt": { "configEnabled": "Ativar", "granularityParagraph": "Parágrafo", "granularitySentence": "Frase", "granularityWord": "Palavra", "configExtendSelection": "Expandir seleção" },
  "pt-PT": { "configEnabled": "Ativar", "granularityParagraph": "Parágrafo", "granularitySentence": "Frase", "granularityWord": "Palavra", "configExtendSelection": "Expandir seleção" },
  "pt-BR": { "configEnabled": "Habilitar", "granularityParagraph": "Parágrafo", "granularitySentence": "Frase", "granularityWord": "Palavra", "configExtendSelection": "Expandir seleção" },
  "ro": { "configEnabled": "Activare", "granularityParagraph": "Paragraf", "granularitySentence": "Propoziție", "granularityWord": "Cuvânt", "configExtendSelection": "Extinde selecția" },
  "ru": { "configEnabled": "Включить", "granularityParagraph": "Абзац", "granularitySentence": "Предложение", "granularityWord": "Слово", "configExtendSelection": "Расширить выделение" },
  "sv": { "configEnabled": "Aktivera", "granularityParagraph": "Stycke", "granularitySentence": "Mening", "granularityWord": "Ord", "configExtendSelection": "Utöka markering" },
  "sk": { "configEnabled": "Zapnúť", "granularityParagraph": "Odstavec", "granularitySentence": "Veta", "granularityWord": "Slovo", "configExtendSelection": "Rozšíriť výber" },
  "th": { "configEnabled": "เปิดใช้งาน", "granularityParagraph": "ย่อหน้า", "granularitySentence": "ประโยค", "granularityWord": "คำ", "configExtendSelection": "ขยายการเลือก" },
  "tr": { "configEnabled": "Etkinleştir", "granularityParagraph": "Paragraf", "granularitySentence": "Cümle", "granularityWord": "Kelime", "configExtendSelection": "Seçimi genişlet" },
  "uk": { "configEnabled": "Увімкнути", "granularityParagraph": "Абзац", "granularitySentence": "Речення", "granularityWord": "Слово", "configExtendSelection": "Розширити виділення" },
  "vi": { "configEnabled": "Bật", "granularityParagraph": "Đoạn văn", "granularitySentence": "Câu", "granularityWord": "Từ", "configExtendSelection": "Mở rộng vùng chọn" },
  "zh":    { "configEnabled": "启用", "granularityParagraph": "段落", "granularitySentence": "句子", "granularityWord": "词", "configExtendSelection": "扩展选择" },
  "zh-CN": { "configEnabled": "启用", "granularityParagraph": "段落", "granularitySentence": "句子", "granularityWord": "词", "configExtendSelection": "扩展选区" },
  "zh-TW": { "configEnabled": "啟用", "granularityParagraph": "段落", "granularitySentence": "句子", "granularityWord": "詞", "configExtendSelection": "擴展選取範圍" },
  "zh-HK": { "configEnabled": "啟用", "granularityParagraph": "段落", "granularitySentence": "句子", "granularityWord": "詞", "configExtendSelection": "擴展選取項目" },
};

export const getCurrentLangLabelString = (key = 'onError') => {
  const langCode = window.navigator.language || 'en';
  const baseLang = langCode.split('-')[0];

  return (
    labelStrings[langCode]?.[key] ??
    labelStrings[baseLang]?.[key] ??
    labelStrings.en[key]
  );
};

export const applyRTLSupport = () => {
  const langCode = window.navigator.language || 'en';
  const baseLang = langCode.split('-')[0];

  if (baseLang === 'ar' || baseLang === 'he') {
    document.body.classList.add('rtl');
    document.documentElement.setAttribute('lang', baseLang);
    document.documentElement.setAttribute('dir', 'rtl');
  } else {
    document.body.classList.remove('rtl');
    document.documentElement.removeAttribute('dir');
  }
};
