import i18n from "i18next";
import { initReactI18next } from "react-i18next";
const resources = {
  zh: {
    translation: {
      nav: {
        home: "首页",
        prepare: "商品处理",
        products: "商品翻译",
        images: "商品图片",
        terms: "术语管理",
        content: "内容翻译",
        tasks: "任务中心",
        social: "社媒发布",
        models: "模型设置",
        connections: "独立站 API",
        storage: "存储归档",
        profile: "个人中心",
        users: "用户管理",
        preferences: "设置",
        developer: "开发者中心",
        recycleBin: "回收站",
      },
      shell: {
        workspace: "工作台",
        online: "服务正常",
        subtitle: "TRANSLATION ADMIN",
      },
    },
  },
  en: {
    translation: {
      nav: {
        home: "Home",
        prepare: "Product preparation",
        products: "Product translation",
        images: "Product images",
        terms: "Terminology",
        content: "Content translation",
        tasks: "Task center",
        social: "Social publish",
        models: "Model settings",
        connections: "Store API",
        storage: "Storage archive",
        profile: "Profile",
        users: "Users",
        preferences: "Preferences",
        developer: "Developer center",
        recycleBin: "Recycle bin",
      },
      shell: {
        workspace: "Workbench",
        online: "Services online",
        subtitle: "TRANSLATION ADMIN",
      },
    },
  },
};
if (!i18n.isInitialized)
  void i18n
    .use(initReactI18next)
    .init({
      resources,
      lng: "zh",
      fallbackLng: "zh",
      interpolation: { escapeValue: false },
    });
export default i18n;
