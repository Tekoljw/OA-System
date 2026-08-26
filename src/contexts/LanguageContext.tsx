import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

type LanguageContextType = {
  language: string;
  changeLanguage: (lang: string) => void;
};

const LanguageContext = createContext<LanguageContextType | null>(null);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const { i18n } = useTranslation();
  // 确保初始化时有一个默认值，不完全依赖于i18n.language
  const [language, setLanguage] = useState<string>(() => {
    // 首先尝试从本地存储获取
    const storedLang = typeof localStorage !== 'undefined' ? localStorage.getItem('i18nextLng') : null;
    // 然后尝试从i18n获取
    const i18nLang = i18n?.language;
    // 最后使用默认值
    return storedLang || i18nLang || 'zh-CN';
  });

  const changeLanguage = (lang: string) => {
    if (i18n) {
      i18n.changeLanguage(lang);
    }
    setLanguage(lang);
    // 记录到本地存储
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('i18nextLng', lang);
    }
  };

  // 初始化时从本地存储获取语言设置
  useEffect(() => {
    const storedLang = typeof localStorage !== 'undefined' ? localStorage.getItem('i18nextLng') : null;
    if (storedLang && storedLang !== language) {
      changeLanguage(storedLang);
    }
  }, []);

  // 当i18n实例的语言变化时更新状态
  useEffect(() => {
    if (i18n && i18n.language && i18n.language !== language) {
      setLanguage(i18n.language);
    }
  }, [i18n?.language, language]);

  return (
    <LanguageContext.Provider value={{ language, changeLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};

// 使用函数声明而不是箭头函数，避免Hot Module Replacement问题
export function useLanguage(): LanguageContextType {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}