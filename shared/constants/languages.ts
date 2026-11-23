export interface LanguageDefinition {
  code: string;           // BCP-47 language tag
  name: string;           // English name
  nativeName: string;     // Native script name
  countryCode: string;    // ISO 3166-1 alpha-2 flag code for flags/1x1/{countryCode}.svg
  isIndianLanguage?: boolean;
}

export const AUTO_DETECT_LANGUAGE: LanguageDefinition = {
  code: 'auto',
  name: 'Auto-detect',
  nativeName: 'Auto-detect',
  countryCode: 'globe',
};

/**
 * Canonical 99-Language Registry supported by Gemini 3.5 Transcribe Live
 * Plus 'auto' for dynamic multilingual automatic speech recognition and code-mixing.
 */
export const SUPPORTED_LANGUAGES: LanguageDefinition[] = [
  AUTO_DETECT_LANGUAGE,
  { code: 'af', name: 'Afrikaans', nativeName: 'Afrikaans', countryCode: 'za' },
  { code: 'ak', name: 'Akan', nativeName: 'Akan', countryCode: 'gh' },
  { code: 'sq', name: 'Albanian', nativeName: 'Shqip', countryCode: 'al' },
  { code: 'am', name: 'Amharic', nativeName: 'አማርኛ', countryCode: 'et' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', countryCode: 'sa' },
  { code: 'hy', name: 'Armenian', nativeName: 'Հայերեն', countryCode: 'am' },
  { code: 'as', name: 'Assamese', nativeName: 'অসমীয়া', countryCode: 'in', isIndianLanguage: true },
  { code: 'az', name: 'Azerbaijani', nativeName: 'Azərbaycan', countryCode: 'az' },
  { code: 'eu', name: 'Basque', nativeName: 'Euskara', countryCode: 'es' },
  { code: 'be', name: 'Belarusian', nativeName: 'Беларуская', countryCode: 'by' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', countryCode: 'in', isIndianLanguage: true },
  { code: 'bs', name: 'Bosnian', nativeName: 'Bosanski', countryCode: 'ba' },
  { code: 'bg', name: 'Bulgarian', nativeName: 'Български', countryCode: 'bg' },
  { code: 'my', name: 'Burmese', nativeName: 'မြန်မာဘာသာ', countryCode: 'mm' },
  { code: 'ca', name: 'Catalan', nativeName: 'Català', countryCode: 'es' },
  { code: 'ceb', name: 'Cebuano', nativeName: 'Sinugboanon', countryCode: 'ph' },
  { code: 'zh-Hans', name: 'Chinese (Simplified)', nativeName: '简体中文', countryCode: 'cn' },
  { code: 'zh-Hant', name: 'Chinese (Traditional)', nativeName: '繁體中文', countryCode: 'tw' },
  { code: 'hr', name: 'Croatian', nativeName: 'Hrvatski', countryCode: 'hr' },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština', countryCode: 'cz' },
  { code: 'da', name: 'Danish', nativeName: 'Dansk', countryCode: 'dk' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', countryCode: 'nl' },
  { code: 'en', name: 'English', nativeName: 'English', countryCode: 'us' },
  { code: 'et', name: 'Estonian', nativeName: 'Eesti', countryCode: 'ee' },
  { code: 'fo', name: 'Faroese', nativeName: 'Føroyskt', countryCode: 'fo' },
  { code: 'fil', name: 'Filipino', nativeName: 'Wikang Filipino', countryCode: 'ph' },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi', countryCode: 'fi' },
  { code: 'fr', name: 'French', nativeName: 'Français', countryCode: 'fr' },
  { code: 'gl', name: 'Galician', nativeName: 'Galego', countryCode: 'es' },
  { code: 'ka', name: 'Georgian', nativeName: 'ქართული', countryCode: 'ge' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', countryCode: 'de' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', countryCode: 'gr' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', countryCode: 'in', isIndianLanguage: true },
  { code: 'ha', name: 'Hausa', nativeName: 'Harshen Hausa', countryCode: 'ng' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית', countryCode: 'il' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', countryCode: 'in', isIndianLanguage: true },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar', countryCode: 'hu' },
  { code: 'is', name: 'Icelandic', nativeName: 'Íslenska', countryCode: 'is' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', countryCode: 'id' },
  { code: 'ga', name: 'Irish', nativeName: 'Gaeilge', countryCode: 'ie' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', countryCode: 'it' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', countryCode: 'jp' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', countryCode: 'in', isIndianLanguage: true },
  { code: 'kk', name: 'Kazakh', nativeName: 'Қазақ тілі', countryCode: 'kz' },
  { code: 'km', name: 'Khmer', nativeName: 'ភាសាខ្មែរ', countryCode: 'kh' },
  { code: 'rw', name: 'Kinyarwanda', nativeName: 'Ikinyarwanda', countryCode: 'rw' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', countryCode: 'kr' },
  { code: 'ku', name: 'Kurdish', nativeName: 'Kurdî', countryCode: 'iq' },
  { code: 'ky', name: 'Kyrgyz', nativeName: 'Кыргызча', countryCode: 'kg' },
  { code: 'lo', name: 'Lao', nativeName: 'ພາສາລາວ', countryCode: 'la' },
  { code: 'lv', name: 'Latvian', nativeName: 'Latviešu', countryCode: 'lv' },
  { code: 'lt', name: 'Lithuanian', nativeName: 'Lietuvių', countryCode: 'lt' },
  { code: 'mk', name: 'Macedonian', nativeName: 'Македонски', countryCode: 'mk' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu', countryCode: 'my' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', countryCode: 'in', isIndianLanguage: true },
  { code: 'mt', name: 'Maltese', nativeName: 'Malti', countryCode: 'mt' },
  { code: 'mi', name: 'Maori', nativeName: 'Te Reo Māori', countryCode: 'nz' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', countryCode: 'in', isIndianLanguage: true },
  { code: 'mn', name: 'Mongolian', nativeName: 'Монгол хэл', countryCode: 'mn' },
  { code: 'ne', name: 'Nepali', nativeName: 'नेपाली', countryCode: 'np' },
  { code: 'no', name: 'Norwegian', nativeName: 'Norsk', countryCode: 'no' },
  { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ', countryCode: 'in', isIndianLanguage: true },
  { code: 'om', name: 'Oromo', nativeName: 'Afaan Oromoo', countryCode: 'et' },
  { code: 'ps', name: 'Pashto', nativeName: 'پښتو', countryCode: 'af' },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی', countryCode: 'ir' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', countryCode: 'pl' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)', nativeName: 'Português do Brasil', countryCode: 'br' },
  { code: 'pt-PT', name: 'Portuguese (Portugal)', nativeName: 'Português de Portugal', countryCode: 'pt' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', countryCode: 'in', isIndianLanguage: true },
  { code: 'qu', name: 'Quechua', nativeName: 'Runasimi', countryCode: 'pe' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română', countryCode: 'ro' },
  { code: 'rm', name: 'Romansh', nativeName: 'Rumantsch', countryCode: 'ch' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', countryCode: 'ru' },
  { code: 'sr', name: 'Serbian', nativeName: 'Српски', countryCode: 'rs' },
  { code: 'sd', name: 'Sindhi', nativeName: 'سنڌي', countryCode: 'in', isIndianLanguage: true },
  { code: 'si', name: 'Sinhala', nativeName: 'සිංහල', countryCode: 'lk' },
  { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina', countryCode: 'sk' },
  { code: 'sl', name: 'Slovenian', nativeName: 'Slovenščina', countryCode: 'si' },
  { code: 'so', name: 'Somali', nativeName: 'Soomaaliga', countryCode: 'so' },
  { code: 'st', name: 'Southern Sotho', nativeName: 'Sesotho', countryCode: 'za' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', countryCode: 'es' },
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili', countryCode: 'ke' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska', countryCode: 'se' },
  { code: 'tg', name: 'Tajik', nativeName: 'Тоҷикӣ', countryCode: 'tj' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', countryCode: 'in', isIndianLanguage: true },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', countryCode: 'in', isIndianLanguage: true },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', countryCode: 'th' },
  { code: 'tn', name: 'Tswana', nativeName: 'Setswana', countryCode: 'bw' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', countryCode: 'tr' },
  { code: 'tk', name: 'Turkmen', nativeName: 'Türkmençe', countryCode: 'tm' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', countryCode: 'ua' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', countryCode: 'pk' },
  { code: 'uz', name: 'Uzbek', nativeName: 'Oʻzbekcha', countryCode: 'uz' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', countryCode: 'vn' },
  { code: 'cy', name: 'Welsh', nativeName: 'Cymraeg', countryCode: 'gb' },
  { code: 'fy', name: 'Western Frisian', nativeName: 'Frysk', countryCode: 'nl' },
  { code: 'wo', name: 'Wolof', nativeName: 'Wolof', countryCode: 'sn' },
  { code: 'yo', name: 'Yoruba', nativeName: 'Èdè Yorùbá', countryCode: 'ng' },
  { code: 'zu', name: 'Zulu', nativeName: 'isiZulu', countryCode: 'za' },
];

export function getFlagAssetUrl(countryCode: string, format: 'svg' | 'png' = 'svg'): string {
  if (!countryCode || countryCode === 'globe') {
    return '';
  }
  return `/flags/1x1/${countryCode.toLowerCase()}.${format}`;
}

export function findLanguageByCode(code: string): LanguageDefinition {
  const normalized = (code || '').trim().toLowerCase();
  const match = SUPPORTED_LANGUAGES.find(
    (l) => l.code.toLowerCase() === normalized
  );
  return match || AUTO_DETECT_LANGUAGE;
}
