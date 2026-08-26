import React from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Globe } from 'lucide-react';

const LanguageSwitcher: React.FC = () => {
  const { language, changeLanguage } = useLanguage();
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="rounded-full">
          <Globe className="h-4 w-4" />
          <span className="sr-only">{t('common.language')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem 
          onClick={() => changeLanguage('zh')}
          className={language === 'zh' ? 'bg-accent text-accent-foreground' : ''}
        >
          {t('common.chinese')}
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => changeLanguage('en')}
          className={language === 'en' ? 'bg-accent text-accent-foreground' : ''}
        >
          {t('common.english')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LanguageSwitcher;