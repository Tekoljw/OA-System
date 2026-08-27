/**
 * 统一 localStorage 访问层
 * 所有本地存储操作通过此模块，避免直接访问 localStorage 和 key 名散落各处
 */

const KEYS = {
  TOKEN: 'token',
  USER: 'user',
  PROJECT: 'currentProject',
  LANG: 'oa_language',
} as const;

export interface StoredUser {
  id: number;
  username: string;
  fullName?: string;
  role: string;
  email?: string;
  isSuperAdmin?: boolean;
  is_super_admin?: boolean;
  projectId?: number;
  projectsList?: any[];
  hasMultipleProjects?: boolean;
  currentProject?: any;
  token?: string;
}

export const storage = {
  // Token
  getToken: (): string | null => localStorage.getItem(KEYS.TOKEN),
  setToken: (token: string) => localStorage.setItem(KEYS.TOKEN, token),

  // User
  getUser: (): StoredUser | null => {
    const raw = localStorage.getItem(KEYS.USER);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  },
  setUser: (user: StoredUser) => localStorage.setItem(KEYS.USER, JSON.stringify(user)),

  // Project
  getProject: (): any | null => {
    const raw = localStorage.getItem(KEYS.PROJECT);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  },
  setProject: (project: any) => localStorage.setItem(KEYS.PROJECT, JSON.stringify(project)),

  getProjectId: (): number | null => {
    const project = storage.getProject();
    return project?.id || null;
  },

  // Language
  getLang: (): string => localStorage.getItem(KEYS.LANG) || 'zh',
  setLang: (lang: string) => localStorage.setItem(KEYS.LANG, lang),

  // Clear all auth data
  clearAuth: () => {
    localStorage.removeItem(KEYS.TOKEN);
    localStorage.removeItem(KEYS.USER);
    localStorage.removeItem(KEYS.PROJECT);
    // 清除可能的旧 key
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_data');
    localStorage.removeItem('projectId');
    localStorage.removeItem('projectsCount');
  },
};
