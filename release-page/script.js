const root = document.documentElement;
const demo = document.querySelector(".vault-demo");
const cursorLight = document.querySelector(".cursor-light");
const langToggle = document.querySelector("[data-lang-toggle]");

const I18N_STORAGE_KEY = "shit-vault-release-page-lang";
const translations = {
  en: {
    pageTitle: "SHIT VAULT - Windows Tray Utility",
    metaDescription:
      "SHIT VAULT is a Windows tray-first desktop app for auto mixing, prevent sleep, and small native utilities.",
    navFeatures: "Features",
    navDownload: "Download",
    topbarDownload: "Download",
    langShort: "�?,
    heroEyebrow: "Windows tray-first utility / v1.1.0",
    heroLede: "Made by SHIT BAG. Built like a gem.",
    heroPrimary: "Download for Windows",
    heroSecondary: "View release",
    proof1: "Windows x64",
    proof2: "Tauri native shell",
    proof3: "GitHub Release asset",
    trayAwake: "tray awake",
    mockEyebrow: "CONTROL VAULT",
    mockTitle: "Dashboard",
    mockLive: "LIVE",
    mockMixTitle: "Auto Mixing",
    mockMixState: "ON",
    mockSelectedApps: "Selected apps",
    mockTrigger: "trigger",
    mockSleepTitle: "Prevent Sleep",
    mockSleepState: "READY",
    ticker1: "Auto Mixing",
    ticker2: "Tray-first",
    ticker3: "Native Windows behavior",
    ticker4: "Prevent Sleep",
    ticker5: "Audio session aware",
    featuresKicker: "Why it exists",
    featuresTitle: "Small utilities, treated like a real product.",
    feature1Title: "Auto Mixing",
    feature1Body:
      "Choose the apps that should duck, exclude the apps that should never trigger, and let Windows audio sessions do the work.",
    feature2Title: "Tray First",
    feature2Body:
      "Starts hidden, opens from the tray, and gets out of your way when the window loses focus.",
    feature3Title: "Prevent Sleep",
    feature3Body:
      "A frozen, native keepalive module for the moments when Windows needs a polite but firm nudge.",
    downloadEyebrow: "Public release",
    downloadTitle: "Download SHIT VAULT for Windows.",
    downloadBody:
      "The installer is hosted as a GitHub Release asset so the download link stays public, durable, and easy to verify.",
    downloadPrimary: "Get the installer",
    downloadSecondary: "Release notes",
    footerGithub: "GitHub",
  },
  zh: {
    pageTitle: "SHIT VAULT - Windows 托盘工具",
    metaDescription:
      "SHIT VAULT 是一�?Windows 托盘优先桌面应用，提供自动混音、防休眠和小而直接的原生工具能力�?,
    navFeatures: "功能",
    navDownload: "下载",
    topbarDownload: "下载",
    langShort: "EN",
    heroEyebrow: "Windows 托盘优先工具 / v1.1.0",
    heroLede: "屎包出品 ! 必属精品 !",
    heroPrimary: "下载 Windows �?,
    heroSecondary: "查看发布�?,
    proof1: "Windows x64",
    proof2: "Tauri 原生外壳",
    proof3: "GitHub Release 资源",
    trayAwake: "托盘已唤�?,
    mockEyebrow: "控制�?,
    mockTitle: "控制�?,
    mockLive: "运行�?,
    mockMixTitle: "自动混音",
    mockMixState: "开�?,
    mockSelectedApps: "已选应�?,
    mockTrigger: "触发�?,
    mockSleepTitle: "防休�?,
    mockSleepState: "就绪",
    ticker1: "自动混音",
    ticker2: "托盘优先",
    ticker3: "Windows 原生行为",
    ticker4: "防休�?,
    ticker5: "感知音频会话",
    featuresKicker: "存在理由",
    featuresTitle: "小工具，也值得被认真做成一个产品�?,
    feature1Title: "自动混音",
    feature1Body:
      "选择哪些应用需要被压低，排除哪些应用绝不该触发，并把真正的工作交给 Windows 音频会话�?,
    feature2Title: "托盘优先",
    feature2Body:
      "启动后默认隐藏，从托盘打开，在窗口失焦时安静退回后台，不占你的注意力�?,
    feature3Title: "防休�?,
    feature3Body:
      "一个已经冻结并稳定的原生保活模块，在你需�?Windows 别睡过去的时候，给它一个克制但有效的提醒�?,
    downloadEyebrow: "公开发布",
    downloadTitle: "下载 SHIT VAULT Windows 版�?,
    downloadBody:
      "安装包托管在 GitHub Release 资源里，所以下载链接公开、稳定，也容易验证来源�?,
    downloadPrimary: "获取安装�?,
    downloadSecondary: "发行说明",
    footerGithub: "GitHub",
  },
};

let stage = 0;
let wakeTimer;
let activeLanguage = "en";

function resolveInitialLanguage() {
  const saved = window.localStorage.getItem(I18N_STORAGE_KEY);
  if (saved && translations[saved]) {
    return saved;
  }

  const browserLanguage = navigator.language.toLowerCase();
  return browserLanguage.startsWith("zh") ? "zh" : "en";
}

function applyLanguage(language) {
  const locale = translations[language] ? language : "en";
  const copy = translations[locale];

  activeLanguage = locale;
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  document.title = copy.pageTitle;

  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription) {
    metaDescription.setAttribute("content", copy.metaDescription);
  }

  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.getAttribute("data-i18n");
    if (!key || !copy[key]) {
      return;
    }

    node.textContent = copy[key];
  });

  if (langToggle) {
    const nextLanguage = locale === "en" ? "zh" : "en";
    const label = nextLanguage === "en" ? "Switch to English" : "切换到中�?;
    langToggle.setAttribute("aria-label", label);
    langToggle.setAttribute("title", label);
  }

  window.localStorage.setItem(I18N_STORAGE_KEY, locale);
}

function setPointerPosition(event) {
  const x = `${(event.clientX / window.innerWidth) * 100}%`;
  const y = `${(event.clientY / window.innerHeight) * 100}%`;
  root.style.setProperty("--mx", x);
  root.style.setProperty("--my", y);
}

function wakeDemo() {
  if (!demo) {
    return;
  }

  demo.classList.add("is-awake");
  window.clearTimeout(wakeTimer);
  wakeTimer = window.setTimeout(() => demo.classList.remove("is-awake"), 1400);
}

if (langToggle) {
  langToggle.addEventListener("click", () => {
    applyLanguage(activeLanguage === "en" ? "zh" : "en");
  });
}

applyLanguage(resolveInitialLanguage());

window.addEventListener("pointermove", (event) => {
  setPointerPosition(event);

  if (!demo) {
    return;
  }

  const bounds = demo.getBoundingClientRect();
  const pad = 90;
  const isNear =
    event.clientX >= bounds.left - pad &&
    event.clientX <= bounds.right + pad &&
    event.clientY >= bounds.top - pad &&
    event.clientY <= bounds.bottom + pad;

  if (isNear) {
    wakeDemo();
  }
});

window.addEventListener("pointerleave", () => {
  if (cursorLight) {
    cursorLight.style.opacity = "0";
  }
});

window.addEventListener("pointerenter", () => {
  if (cursorLight) {
    cursorLight.style.opacity = "0.55";
  }
});

if (demo) {
  window.setInterval(() => {
    stage = (stage + 1) % 4;
    demo.dataset.stage = String(stage);

    if (stage === 2 || stage === 3) {
      wakeDemo();
    }
  }, 2600);
}
