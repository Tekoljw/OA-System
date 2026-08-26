import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import zhTranslation from './locales/zh.json';
import enTranslation from './locales/en.json';

// 初始化i18next
i18n
  // 检测用户语言
  .use(LanguageDetector)
  // 将i18n实例传递给react-i18next
  .use(initReactI18next)
  // 初始化i18next
  .init({
    debug: process.env.NODE_ENV === 'development',
    fallbackLng: 'zh', // 备用语言
    interpolation: {
      escapeValue: false, // 不转义HTML内容
    },
    resources: {
      zh: {
        translation: zhTranslation
      },
      en: {
        translation: enTranslation
      }
    },
    // 检测语言顺序: localStorage, navigator, ...
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage'],
    }
  });

export default i18n;