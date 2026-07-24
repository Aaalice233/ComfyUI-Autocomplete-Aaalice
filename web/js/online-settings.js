import {
    getLoraManagerStatus,
    searchLoraManagerCandidates,
} from "./integrations/lora-manager-provider.js";
import { getCurrentInterfaceLocale } from "./localization.js";
import { updateOnlineServiceFeatures } from "./online-service-state.js";
import { loadTranslationCatalog } from "./integrations/translation-provider.js";
import { clearDanbooruSessionCache } from "./integrations/danbooru-provider.js";

const API_ROOT = "/autocomplete-plus/translation";

const TEXT = {
    en: {
        title: "Online completion and translation",
        category: "Online Services",
        subtitle: "Keep local suggestions instant while online services enrich results in the background.",
        open: "Configure online completion and translation",
        sources: "Data source status",
        sourcesHint: "Availability is checked without interrupting prompt input.",
        huggingface: "Hugging Face",
        loraManager: "LoRA Manager",
        danbooru: "Danbooru fallback",
        deepseek: "DeepSeek translation",
        ready: "Ready",
        unavailable: "Unavailable",
        waitingLora: "Waiting for first completion",
        waitingDanbooru: "Waiting for fallback",
        waitingDeepSeek: "Waiting for model test",
        notConfigured: "Not configured",
        checkSources: "Check data sources",
        checkingSources: "Checking data sources…",
        sourcesChecked: "Data source check completed",
        features: "Online feature switches",
        enableDanbooru: "Enable Danbooru API supplementation",
        danbooruHelp: "Add newer or missing tags after local results are already visible.",
        enableTranslation: "Enable automatic translation",
        translationHelp: "Translate uncached tags in the background with DeepSeek.",
        completionCache: "Persistent Danbooru result cache",
        cacheHint: "Reusable across browser refreshes and ComfyUI restarts.",
        cachePages: "pages",
        clearCache: "Clear Danbooru result cache",
        cacheCleared: "Danbooru result cache cleared",
        translation: "Translation",
        locale: "Interface language",
        apiKey: "DeepSeek API key",
        showApiKey: "Show API key",
        hideApiKey: "Hide API key",
        model: "Model",
        thinking: "Thinking effort",
        disabled: "Off",
        high: "High",
        max: "Maximum",
        refreshModels: "Load models",
        testModel: "Test model",
        modelsLoaded: "Model list loaded",
        modelAlive: "Model is available",
        cache: "Cached translations",
        configured: "Configured",
        advanced: "Advanced translation settings",
        concurrency: "Concurrency",
        batchSize: "Batch size",
        retries: "Retries",
        timeout: "Timeout (seconds)",
        prompt: "System prompt",
        save: "Save settings",
        cancel: "Cancel",
        close: "Close",
        saved: "Settings saved",
        navDanbooru: "Danbooru API",
        navDictionary: "Chinese dictionary",
        navDeepSeek: "DeepSeek LLM",
        danbooruTitle: "Danbooru API",
        danbooruDescription: "Anonymous read-only completion and related-tag fallback.",
        dictionaryTitle: "Simplified Chinese dictionary",
        dictionaryDescription: "Managed from ffdkj and used only for Simplified Chinese.",
        dictionaryMissing: "Not installed",
        dictionaryDownloading: "Downloading",
        dictionaryReady: "Ready",
        dictionaryChecking: "Checking",
        dictionaryError: "Error",
        dictionaryVersion: "Version",
        dictionaryRows: "records",
        dictionarySize: "Size",
        dictionaryLastCheck: "Last checked",
        dictionaryLastUpdate: "Last updated",
        checkDictionary: "Check for updates",
        updateDictionary: "Install / update",
        repairDictionary: "Repair download",
        dictionaryCurrent: "Dictionary is up to date",
        dictionaryUpdateFound: "A dictionary update is available",
        dictionaryActionStarted: "Dictionary download started",
        deepSeekTitle: "DeepSeek LLM",
        deepSeekDescription: "Translates only tags missing from the primary Simplified Chinese dictionary.",
    },
    zh: {
        title: "在线补全与翻译",
        category: "在线服务",
        subtitle: "本地结果即时显示，在线服务仅在后台补充，不打断输入。",
        open: "配置在线补全与翻译",
        sources: "数据源状态",
        sourcesHint: "检测过程不会影响提示词输入和本地补全。",
        huggingface: "Hugging Face",
        loraManager: "LoRA Manager",
        danbooru: "Danbooru 在线兜底",
        deepseek: "DeepSeek 翻译",
        ready: "可用",
        unavailable: "不可用",
        waitingLora: "等待首次补全",
        waitingDanbooru: "等待兜底触发",
        waitingDeepSeek: "等待模型测活",
        notConfigured: "未配置",
        checkSources: "检测数据源",
        checkingSources: "正在检测数据源…",
        sourcesChecked: "数据源检测完成",
        features: "在线能力",
        enableDanbooru: "启用 Danbooru API 补充",
        danbooruHelp: "本地结果显示后，再补充较新或缺失的标签。",
        enableTranslation: "启用自动翻译",
        translationHelp: "使用 DeepSeek 在后台翻译尚未缓存的标签。",
        completionCache: "Danbooru 结果持久缓存",
        cacheHint: "刷新浏览器或重启 ComfyUI 后仍可复用。",
        cachePages: "页",
        clearCache: "清理缓存",
        cacheCleared: "Danbooru 结果缓存已清空",
        translation: "DeepSeek 翻译",
        locale: "界面语言",
        apiKey: "DeepSeek API Key",
        showApiKey: "显示 API Key",
        hideApiKey: "隐藏 API Key",
        model: "模型",
        thinking: "思考强度",
        disabled: "关闭",
        high: "高",
        max: "最大",
        refreshModels: "拉取模型列表",
        testModel: "测试模型",
        modelsLoaded: "模型列表已更新",
        modelAlive: "模型测活成功",
        cache: "已缓存翻译",
        configured: "已配置",
        advanced: "高级翻译设置",
        concurrency: "并发数",
        batchSize: "批量大小",
        retries: "重试次数",
        timeout: "超时（秒）",
        prompt: "系统提示词",
        save: "保存设置",
        cancel: "取消",
        close: "关闭",
        saved: "设置已保存",
        navDanbooru: "Danbooru API",
        navDictionary: "中文汉化数据库",
        navDeepSeek: "DeepSeek LLM",
        danbooruTitle: "Danbooru API",
        danbooruDescription: "无需账号的只读标签补全与共现兜底。",
        dictionaryTitle: "简体中文汉化数据库",
        dictionaryDescription: "数据来自 ffdkj，仅在简体中文界面中用于主力汉化。",
        dictionaryMissing: "未安装",
        dictionaryDownloading: "正在下载",
        dictionaryReady: "可用",
        dictionaryChecking: "正在检测",
        dictionaryError: "错误",
        dictionaryVersion: "版本",
        dictionaryRows: "条记录",
        dictionarySize: "大小",
        dictionaryLastCheck: "最后检测",
        dictionaryLastUpdate: "最后更新",
        checkDictionary: "检测更新",
        updateDictionary: "安装 / 更新",
        repairDictionary: "修复重装",
        dictionaryCurrent: "汉化数据库已是最新版本",
        dictionaryUpdateFound: "发现新的汉化数据库",
        dictionaryActionStarted: "汉化数据库下载已开始",
        deepSeekTitle: "DeepSeek LLM",
        deepSeekDescription: "仅翻译简体中文主数据库缺失的标签。",
    },
    "zh-TW": {
        title: "線上補全與翻譯",
        category: "線上服務",
        subtitle: "本機結果即時顯示，線上服務僅在背景補充，不打斷輸入。",
        open: "設定線上補全與翻譯",
        sources: "資料來源狀態",
        sourcesHint: "偵測過程不會影響提示詞輸入與本機補全。",
        huggingface: "Hugging Face",
        loraManager: "LoRA Manager",
        danbooru: "Danbooru 線上備援",
        deepseek: "DeepSeek 翻譯",
        ready: "可用",
        unavailable: "不可用",
        waitingLora: "等待首次補全",
        waitingDanbooru: "等待備援觸發",
        waitingDeepSeek: "等待模型測試",
        notConfigured: "未設定",
        checkSources: "偵測資料來源",
        checkingSources: "正在偵測資料來源…",
        sourcesChecked: "資料來源偵測完成",
        features: "線上功能",
        enableDanbooru: "啟用 Danbooru API 補充",
        danbooruHelp: "本機結果顯示後，再補充較新或缺少的標籤。",
        enableTranslation: "啟用自動翻譯",
        translationHelp: "使用 DeepSeek 在背景翻譯尚未快取的標籤。",
        completionCache: "Danbooru 結果持久快取",
        cacheHint: "重新整理瀏覽器或重啟 ComfyUI 後仍可重用。",
        cachePages: "頁",
        clearCache: "清除快取",
        cacheCleared: "Danbooru 結果快取已清除",
        translation: "DeepSeek 翻譯",
        locale: "介面語言",
        apiKey: "DeepSeek API Key",
        showApiKey: "顯示 API Key",
        hideApiKey: "隱藏 API Key",
        model: "模型",
        thinking: "思考強度",
        disabled: "關閉",
        high: "高",
        max: "最大",
        refreshModels: "載入模型清單",
        testModel: "測試模型",
        modelsLoaded: "模型清單已更新",
        modelAlive: "模型測試成功",
        cache: "已快取翻譯",
        configured: "已設定",
        advanced: "進階翻譯設定",
        concurrency: "並行數",
        batchSize: "批次大小",
        retries: "重試次數",
        timeout: "逾時（秒）",
        prompt: "系統提示詞",
        save: "儲存設定",
        cancel: "取消",
        close: "關閉",
        saved: "設定已儲存",
        navDanbooru: "Danbooru API",
        navDictionary: "簡中漢化資料庫",
        navDeepSeek: "DeepSeek LLM",
        danbooruTitle: "Danbooru API",
        danbooruDescription: "免帳號的唯讀標籤補全與共現備援。",
        dictionaryTitle: "簡體中文漢化資料庫",
        dictionaryDescription: "資料來自 ffdkj，僅套用於簡體中文介面。",
        dictionaryMissing: "未安裝",
        dictionaryDownloading: "下載中",
        dictionaryReady: "可用",
        dictionaryChecking: "檢查中",
        dictionaryError: "錯誤",
        dictionaryVersion: "版本",
        dictionaryRows: "筆記錄",
        dictionarySize: "大小",
        dictionaryLastCheck: "最後檢查",
        dictionaryLastUpdate: "最後更新",
        checkDictionary: "檢查更新",
        updateDictionary: "安裝 / 更新",
        repairDictionary: "修復下載",
        dictionaryCurrent: "漢化資料庫已是最新版本",
        dictionaryUpdateFound: "發現新的漢化資料庫",
        dictionaryActionStarted: "漢化資料庫下載已開始",
        deepSeekTitle: "DeepSeek LLM",
        deepSeekDescription: "簡中資料庫以外的語言仍由 DeepSeek 補充。",
    },
    ja: {
        title: "オンライン補完と翻訳",
        category: "オンラインサービス",
        subtitle: "ローカル候補を即座に表示し、オンラインサービスは入力を妨げずに補完します。",
        open: "オンライン補完と翻訳を設定",
        sources: "データソースの状態",
        sourcesHint: "確認中もプロンプト入力とローカル補完はそのまま利用できます。",
        huggingface: "Hugging Face",
        loraManager: "LoRA Manager",
        danbooru: "Danbooru フォールバック",
        deepseek: "DeepSeek 翻訳",
        ready: "利用可能",
        unavailable: "利用不可",
        waitingLora: "最初の補完待ち",
        waitingDanbooru: "フォールバック待ち",
        waitingDeepSeek: "モデルテスト待ち",
        notConfigured: "未設定",
        checkSources: "データソースを確認",
        checkingSources: "データソースを確認中…",
        sourcesChecked: "データソースの確認が完了しました",
        features: "オンライン機能",
        enableDanbooru: "Danbooru API 補足を有効化",
        danbooruHelp: "ローカル結果の表示後に、新しいタグや不足しているタグを補います。",
        enableTranslation: "自動翻訳を有効化",
        translationHelp: "未キャッシュのタグを DeepSeek でバックグラウンド翻訳します。",
        completionCache: "Danbooru 結果の永続キャッシュ",
        cacheHint: "ブラウザー更新や ComfyUI 再起動後も再利用できます。",
        cachePages: "ページ",
        clearCache: "キャッシュを消去",
        cacheCleared: "Danbooru 結果キャッシュを消去しました",
        translation: "DeepSeek 翻訳",
        locale: "表示言語",
        apiKey: "DeepSeek API Key",
        showApiKey: "API Key を表示",
        hideApiKey: "API Key を非表示",
        model: "モデル",
        thinking: "思考強度",
        disabled: "オフ",
        high: "高",
        max: "最大",
        refreshModels: "モデル一覧を取得",
        testModel: "モデルをテスト",
        modelsLoaded: "モデル一覧を更新しました",
        modelAlive: "モデルは利用可能です",
        cache: "キャッシュ済み翻訳",
        configured: "設定済み",
        advanced: "詳細な翻訳設定",
        concurrency: "同時実行数",
        batchSize: "バッチサイズ",
        retries: "再試行回数",
        timeout: "タイムアウト（秒）",
        prompt: "システムプロンプト",
        save: "設定を保存",
        cancel: "キャンセル",
        close: "閉じる",
        saved: "設定を保存しました",
        navDanbooru: "Danbooru API",
        navDictionary: "簡体字中国語辞書",
        navDeepSeek: "DeepSeek LLM",
        danbooruTitle: "Danbooru API",
        danbooruDescription: "アカウント不要の読み取り専用補完・関連タグフォールバックです。",
        dictionaryTitle: "簡体字中国語翻訳辞書",
        dictionaryDescription: "ffdkj が提供し、簡体字中国語 UI でのみ使用します。",
        dictionaryMissing: "未インストール",
        dictionaryDownloading: "ダウンロード中",
        dictionaryReady: "利用可能",
        dictionaryChecking: "確認中",
        dictionaryError: "エラー",
        dictionaryVersion: "バージョン",
        dictionaryRows: "件",
        dictionarySize: "サイズ",
        dictionaryLastCheck: "最終確認",
        dictionaryLastUpdate: "最終更新",
        checkDictionary: "更新を確認",
        updateDictionary: "インストール / 更新",
        repairDictionary: "修復ダウンロード",
        dictionaryCurrent: "辞書は最新です",
        dictionaryUpdateFound: "新しい辞書があります",
        dictionaryActionStarted: "辞書のダウンロードを開始しました",
        deepSeekTitle: "DeepSeek LLM",
        deepSeekDescription: "簡体字中国語辞書にないタグだけを補完翻訳します。",
    },
};

function element(tag, className = "", text = "") {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text) result.textContent = text;
    return result;
}

async function requestJson(url, options) {
    const response = await fetch(url, {
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        ...options,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    return payload;
}

function field(parent, label, type, value, min, max) {
    const wrapper = element("label", "autocomplete-plus-online-field");
    wrapper.append(element("span", "", label));
    const input = document.createElement("input");
    input.type = type;
    input.value = value ?? "";
    if (min !== undefined) input.min = String(min);
    if (max !== undefined) input.max = String(max);
    wrapper.append(input);
    parent.append(wrapper);
    return input;
}

function selectField(parent, label, value, options) {
    const wrapper = element("label", "autocomplete-plus-online-field");
    wrapper.append(element("span", "", label));
    const select = document.createElement("select");
    for (const [optionValue, optionLabel] of options) {
        select.add(new Option(optionLabel, optionValue, false, optionValue === value));
    }
    wrapper.append(select);
    parent.append(wrapper);
    return select;
}

function passwordField(parent, label, value, text, loadSavedValue, handleLoadError) {
    const wrapper = element("div", "autocomplete-plus-online-field");
    wrapper.append(element("span", "", label));
    const inputShell = element("span", "autocomplete-plus-online-input-action");
    const input = document.createElement("input");
    input.className = "autocomplete-plus-online-secret";
    input.type = "password";
    input.value = value ?? "";
    input.ariaLabel = label;
    const reveal = iconButton("eye", text.showApiKey);
    reveal.onclick = async event => {
        event.preventDefault();
        const showing = input.type === "text";
        if (!showing && input.value === "********" && loadSavedValue) {
            reveal.disabled = true;
            try {
                input.value = await loadSavedValue();
            } catch (error) {
                handleLoadError?.(error);
                return;
            } finally {
                reveal.disabled = false;
            }
        }
        input.type = showing ? "password" : "text";
        reveal.ariaLabel = showing ? text.showApiKey : text.hideApiKey;
        reveal.replaceChildren(lucideIcon(showing ? "eye" : "eyeOff"));
    };
    inputShell.append(input, reveal);
    wrapper.append(inputShell);
    parent.append(wrapper);
    return input;
}

function toggleField(parent, label, help, checked) {
    const wrapper = element("label", "autocomplete-plus-online-toggle");
    const copy = element("span", "autocomplete-plus-online-toggle-copy");
    copy.append(
        element("strong", "", label),
        element("small", "", help),
    );
    const input = document.createElement("input");
    input.className = "autocomplete-plus-online-switch";
    input.type = "checkbox";
    input.checked = checked;
    input.setAttribute("role", "switch");
    wrapper.append(copy, input);
    parent.append(wrapper);
    return input;
}

function sectionHeading(title, description, action) {
    const heading = element("div", "autocomplete-plus-online-section-heading");
    const copy = element("div");
    copy.append(element("h3", "", title));
    if (description) copy.append(element("p", "", description));
    heading.append(copy);
    if (action) heading.append(action);
    return heading;
}

function button(label, className = "") {
    const result = element(
        "button",
        `p-button p-component autocomplete-plus-online-button ${className}`.trim(),
        label,
    );
    result.type = "button";
    return result;
}

const LUCIDE_PATHS = {
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    eye: '<path d="M2.1 12a10.8 10.8 0 0 1 19.8 0 10.8 10.8 0 0 1-19.8 0"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="m2 2 20 20M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.2A10.8 10.8 0 0 1 21.9 12a11.4 11.4 0 0 1-2.1 3.2M6.6 6.6A11.2 11.2 0 0 0 2.1 12a10.8 10.8 0 0 0 14.2 6.1"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20M12 2a15.3 15.3 0 0 0 0 20"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>',
    sparkles: '<path d="m12 3-1.9 4.1L6 9l4.1 1.9L12 15l1.9-4.1L18 9l-4.1-1.9ZM5 16l-.9 1.9L2 19l2.1 1.1L5 22l.9-1.9L8 19l-2.1-1.1ZM19 13l-.9 1.9L16 16l2.1 1.1L19 19l.9-1.9L22 16l-2.1-1.1Z"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
};

function lucideIcon(icon) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "autocomplete-plus-online-lucide");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("focusable", "false");
    svg.innerHTML = LUCIDE_PATHS[icon] || LUCIDE_PATHS.sparkles;
    svg.ariaHidden = "true";
    return svg;
}

function iconButton(icon, label) {
    const result = button("", "autocomplete-plus-online-icon-button");
    result.ariaLabel = label;
    result.append(lucideIcon(icon));
    return result;
}

function setButtonBusy(target, busy, busyLabel) {
    if (!target.dataset.idleLabel) target.dataset.idleLabel = target.textContent;
    target.disabled = busy;
    target.ariaBusy = String(busy);
    const label = busy ? busyLabel : target.dataset.idleLabel;
    if (target.dataset.icon) {
        const icon = lucideIcon(target.dataset.icon);
        if (busy) icon.classList.add("is-busy");
        target.replaceChildren(icon, element("span", "", label));
    } else {
        target.textContent = label;
    }
}

function formatBytes(bytes) {
    const value = Math.max(Number(bytes) || 0, 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function statusText(status, text, idleText) {
    if (status?.state === "success") return text.ready;
    if (status?.state === "error") return text.unavailable;
    return idleText;
}

function statusState(value, text) {
    if (value === text.ready) return "ready";
    if (value === text.unavailable) return "error";
    if (value === text.disabled) return "disabled";
    return "waiting";
}

export function createOnlineServicesSetting(app, extensionName, extensionId) {
    const text = TEXT[getCurrentInterfaceLocale()] || TEXT.en;
    return {
        id: `${extensionId}.OnlineServices.Manager`,
        name: "Configure online completion and translation",
        // ComfyUI sorts category keys alphabetically; the leading space keeps this entry first.
        category: [extensionName, ` ${text.category}`, "Online completion and translation"],
        defaultValue: null,
        type: () => {
            const button = element("button", "p-button p-component p-button-primary", text.open);
            button.type = "button";
            button.onclick = () => openOnlineServicesPanel(app);
            return button;
        },
    };
}

export async function openOnlineServicesPanel(_app) {
    const locale = getCurrentInterfaceLocale();
    const text = TEXT[locale] || TEXT.en;
    const dialog = element("dialog", "autocomplete-plus-online-dialog");
    const panel = element("div", "autocomplete-plus-online-panel");
    dialog.append(panel);
    document.body.append(dialog);

    const header = element("header", "autocomplete-plus-online-header");
    const titleGroup = element("div", "autocomplete-plus-online-title");
    titleGroup.append(
        element("h2", "", text.title),
        element("p", "", text.subtitle),
    );
    header.append(titleGroup);
    const closeHeader = iconButton("close", text.close);
    closeHeader.onclick = () => dialog.close();
    header.append(closeHeader);
    panel.append(header);

    const message = element("div", "autocomplete-plus-online-message");
    message.setAttribute("role", "status");
    message.setAttribute("aria-live", "polite");
    panel.append(message);
    const body = element("div", "autocomplete-plus-online-body");
    const navigation = element("nav", "autocomplete-plus-online-nav");
    navigation.ariaLabel = text.title;
    const content = element("main", "autocomplete-plus-online-content");
    const pages = {
        danbooru: element("div", "autocomplete-plus-online-page"),
        dictionary: element("div", "autocomplete-plus-online-page"),
        deepseek: element("div", "autocomplete-plus-online-page"),
    };
    const navButtons = {};
    const selectPage = key => {
        for (const [pageKey, page] of Object.entries(pages)) {
            const selected = pageKey === key;
            page.hidden = !selected;
            navButtons[pageKey].classList.toggle("is-active", selected);
            navButtons[pageKey].setAttribute("aria-selected", String(selected));
            navButtons[pageKey].tabIndex = selected ? 0 : -1;
        }
    };
    for (const [key, label, icon] of [
        ["danbooru", text.navDanbooru, "globe"],
        ["dictionary", text.navDictionary, "database"],
        ["deepseek", text.navDeepSeek, "sparkles"],
    ]) {
        const navButton = element("button", "autocomplete-plus-online-nav-button");
        navButton.type = "button";
        navButton.setAttribute("role", "tab");
        navButton.append(lucideIcon(icon), element("span", "", label));
        navButton.onclick = () => selectPage(key);
        navigation.append(navButton);
        navButtons[key] = navButton;
        pages[key].setAttribute("role", "tabpanel");
        content.append(pages[key]);
    }
    body.append(navigation, content);
    panel.append(body);

    let config;
    let status;
    try {
        [config, status] = await Promise.all([
            requestJson(`${API_ROOT}/config`),
            requestJson(`${API_ROOT}/status`),
        ]);
    } catch (error) {
        message.textContent = error.message;
        dialog.showModal();
        return;
    }
    updateOnlineServiceFeatures(config.features);

    const danbooruFeatureSection = element("section", "autocomplete-plus-online-section");
    danbooruFeatureSection.append(sectionHeading(text.danbooruTitle, text.danbooruDescription));
    const danbooruFeatureGrid = element("div", "autocomplete-plus-online-toggle-grid");
    const danbooruEnabled = toggleField(
        danbooruFeatureGrid,
        text.enableDanbooru,
        text.danbooruHelp,
        config.features?.danbooru_completion !== false,
    );
    danbooruFeatureSection.append(danbooruFeatureGrid);
    pages.danbooru.append(danbooruFeatureSection);

    const translationFeatureSection = element("section", "autocomplete-plus-online-section");
    translationFeatureSection.append(sectionHeading(text.deepSeekTitle, text.deepSeekDescription));
    const translationFeatureGrid = element("div", "autocomplete-plus-online-toggle-grid");
    const translationEnabled = toggleField(
        translationFeatureGrid,
        text.enableTranslation,
        text.translationHelp,
        config.features?.translation !== false,
    );
    translationFeatureSection.append(translationFeatureGrid);
    pages.deepseek.append(translationFeatureSection);

    const statusSection = element("section", "autocomplete-plus-online-section");
    const checkSources = button(text.checkSources);
    statusSection.append(sectionHeading(text.sources, text.sourcesHint, checkSources));
    const statusGrid = element("div", "autocomplete-plus-online-status-grid");
    const statusCards = {};
    for (const [key, label] of [
        ["huggingface", text.huggingface],
        ["loraManager", text.loraManager],
        ["danbooru", text.danbooru],
    ]) {
        const card = element("div", "autocomplete-plus-online-status-card");
        const value = element("strong");
        card.append(element("span", "", label), value);
        statusGrid.append(card);
        statusCards[key] = { card, value };
    }
    statusSection.append(statusGrid);
    const updateStatusCards = nextStatus => {
        status = nextStatus;
        const loraStatus = getLoraManagerStatus();
        const values = {
            huggingface: status.huggingface?.available ? text.ready : text.unavailable,
            loraManager: statusText(loraStatus, text, text.waitingLora),
            danbooru: !danbooruEnabled.checked
                ? text.disabled
                : statusText(status.danbooru, text, text.waitingDanbooru),
            deepseek: !translationEnabled.checked
                ? text.disabled
                : statusText(
                    status.deepseek,
                    text,
                    status.configured ? text.waitingDeepSeek : text.notConfigured,
                ),
        };
        const diagnostics = {
            loraManager: loraStatus.message,
            danbooru: status.danbooru?.message,
            deepseek: status.deepseek?.message,
        };
        for (const [key, card] of Object.entries(statusCards)) {
            card.value.textContent = values[key];
            card.card.title = diagnostics[key] || "";
            card.card.dataset.state = statusState(values[key], text);
        }
    };
    updateStatusCards(status);
    danbooruEnabled.onchange = () => updateStatusCards(status);
    translationEnabled.onchange = () => updateStatusCards(status);
    const statusActions = element("div", "autocomplete-plus-online-cache");
    const clearCache = button(text.clearCache, "is-danger");
    const cacheSummary = element("span", "autocomplete-plus-online-cache-summary");
    const cacheCopy = element("span", "autocomplete-plus-online-cache-copy");
    const updateCacheSummary = () => {
        const cacheStatus = status.danbooru?.cache || {};
        cacheSummary.textContent = `${text.completionCache}: ${cacheStatus.entries || 0} ${text.cachePages}`
            + ` · ${formatBytes(cacheStatus.size_bytes)}`;
    };
    updateCacheSummary();
    cacheCopy.append(cacheSummary, element("small", "", text.cacheHint));
    statusActions.append(cacheCopy, clearCache);
    statusSection.append(statusActions);
    pages.danbooru.append(statusSection);

    const dictionarySection = element("section", "autocomplete-plus-online-section");
    dictionarySection.append(sectionHeading(text.dictionaryTitle, text.dictionaryDescription));
    const dictionaryCard = element("div", "autocomplete-plus-online-dictionary");
    const dictionaryState = element("strong", "autocomplete-plus-online-dictionary-state");
    const dictionaryMeta = element("div", "autocomplete-plus-online-dictionary-meta");
    const dictionaryProgress = element("div", "autocomplete-plus-online-progress");
    const dictionaryProgressBar = element("span");
    dictionaryProgress.append(dictionaryProgressBar);
    const dictionaryError = element("p", "autocomplete-plus-online-dictionary-error");
    const dictionaryActions = element("div", "autocomplete-plus-online-dictionary-actions");
    const checkDictionary = button(text.checkDictionary);
    const updateDictionary = button(text.updateDictionary, "is-emphasized");
    const repairDictionary = button(text.repairDictionary, "is-danger");
    dictionaryActions.append(checkDictionary, updateDictionary, repairDictionary);
    dictionaryCard.append(
        dictionaryState,
        dictionaryMeta,
        dictionaryProgress,
        dictionaryError,
        dictionaryActions,
    );
    dictionarySection.append(dictionaryCard);
    pages.dictionary.append(dictionarySection);

    let dictionaryStatus = null;
    let dictionaryPoll = null;
    const dictionaryStateText = state => ({
        missing: text.dictionaryMissing,
        downloading: text.dictionaryDownloading,
        ready: text.dictionaryReady,
        checking: text.dictionaryChecking,
        error: text.dictionaryError,
    })[state] || state;
    const renderDictionaryStatus = nextStatus => {
        dictionaryStatus = nextStatus;
        dictionaryState.textContent = dictionaryStateText(nextStatus.state);
        dictionaryState.dataset.state = nextStatus.state;
        const metaRows = [
            [text.dictionaryVersion, nextStatus.installed_sha?.slice(0, 12) || "—"],
            [text.dictionaryRows, Number(nextStatus.row_count || 0).toLocaleString()],
            [text.dictionarySize, formatBytes(nextStatus.size_bytes)],
            [text.dictionaryLastCheck, nextStatus.last_checked_at || "—"],
            [text.dictionaryLastUpdate, nextStatus.last_updated_at || "—"],
        ];
        dictionaryMeta.replaceChildren(...metaRows.map(([label, value]) => {
            const row = element("span");
            row.append(element("small", "", label), element("b", "", value));
            return row;
        }));
        const total = Number(nextStatus.total_bytes) || 0;
        const downloaded = Number(nextStatus.downloaded_bytes) || 0;
        dictionaryProgress.hidden = nextStatus.state !== "downloading";
        dictionaryProgressBar.style.width = total > 0
            ? `${Math.min((downloaded / total) * 100, 100)}%`
            : "28%";
        dictionaryError.textContent = nextStatus.error || "";
        updateDictionary.disabled = nextStatus.state === "downloading"
            || (nextStatus.installed && !nextStatus.update_available);
        repairDictionary.disabled = nextStatus.state === "downloading";
        checkDictionary.disabled = ["checking", "downloading"].includes(nextStatus.state);
        if (nextStatus.state === "downloading" && dictionaryPoll === null) {
            dictionaryPoll = window.setInterval(async () => {
                try {
                    renderDictionaryStatus(await requestJson("/autocomplete-plus/chinese-dictionary/status"));
                } catch (_error) {
                    // The next poll or a manual action can recover the status view.
                }
                if (dictionaryStatus?.state !== "downloading") {
                    window.clearInterval(dictionaryPoll);
                    dictionaryPoll = null;
                }
            }, 750);
        }
    };
    try {
        renderDictionaryStatus(await requestJson("/autocomplete-plus/chinese-dictionary/status"));
    } catch (error) {
        renderDictionaryStatus({ state: "error", error: error.message });
    }
    const runDictionaryAction = async (target, path, payload, successMessage) => {
        setButtonBusy(target, true, `${target.dataset.idleLabel || target.textContent}…`);
        try {
            const nextStatus = await requestJson(`/autocomplete-plus/chinese-dictionary/${path}`, {
                method: "POST",
                body: JSON.stringify(payload || {}),
            });
            renderDictionaryStatus(nextStatus);
            message.textContent = successMessage(nextStatus);
            message.dataset.tone = "success";
        } catch (error) {
            message.textContent = error.message;
            message.dataset.tone = "error";
        } finally {
            setButtonBusy(target, false, "");
        }
    };
    checkDictionary.onclick = () => runDictionaryAction(
        checkDictionary,
        "check-update",
        {},
        nextStatus => nextStatus.update_available ? text.dictionaryUpdateFound : text.dictionaryCurrent,
    );
    updateDictionary.onclick = () => runDictionaryAction(
        updateDictionary,
        "update",
        {},
        () => text.dictionaryActionStarted,
    );
    repairDictionary.onclick = () => runDictionaryAction(
        repairDictionary,
        "update",
        { force: true },
        () => text.dictionaryActionStarted,
    );

    const translationSection = element("section", "autocomplete-plus-online-section");
    const localeRow = element("div", "autocomplete-plus-online-summary");
    localeRow.append(
        element("span", "", `${text.locale}: ${locale}`),
        element("span", "", `${text.cache}: ${status.cache_count || 0}`),
    );
    translationSection.append(sectionHeading(text.translation, "", localeRow));
    const form = element("div", "autocomplete-plus-online-grid");
    const apiKey = passwordField(form, text.apiKey, config.deepseek.api_key, text, async () => {
        const payload = await requestJson(`${API_ROOT}/config/reveal`, { method: "POST" });
        return payload.api_key || "";
    }, error => {
        message.textContent = error.message;
        message.dataset.tone = "error";
    });
    if (config.deepseek.api_key_configured) apiKey.placeholder = text.configured;
    const model = selectField(form, text.model, config.deepseek.model, [
        [config.deepseek.model, config.deepseek.model],
    ]);
    const reasoningEffort = selectField(form, text.thinking, config.deepseek.reasoning_effort || "disabled", [
        ["disabled", text.disabled],
        ["high", text.high],
        ["max", text.max],
    ]);
    const modelActions = element("div", "autocomplete-plus-online-model-actions");
    const refreshModels = button(text.refreshModels);
    const testModel = button("", "is-model-test");
    testModel.dataset.icon = "activity";
    testModel.dataset.idleLabel = text.testModel;
    testModel.append(lucideIcon("activity"), element("span", "", text.testModel));
    modelActions.append(refreshModels, testModel);
    form.append(modelActions);
    translationSection.append(form);

    const advanced = element("details", "autocomplete-plus-online-advanced");
    const advancedSummary = element("summary");
    const advancedSummaryValues = element("small");
    advancedSummary.append(
        element("span", "", text.advanced),
        advancedSummaryValues,
    );
    advanced.append(advancedSummary);
    const advancedGrid = element("div", "autocomplete-plus-online-grid");
    const concurrency = field(advancedGrid, text.concurrency, "number", config.deepseek.concurrency, 1, 300);
    const batchSize = field(advancedGrid, text.batchSize, "number", config.deepseek.batch_size, 1, 200);
    const retries = field(advancedGrid, text.retries, "number", config.deepseek.max_retries, 0, 10);
    const timeout = field(advancedGrid, text.timeout, "number", config.deepseek.timeout_seconds, 10, 600);
    const refreshAdvancedSummary = () => {
        advancedSummaryValues.textContent = `${text.concurrency} ${concurrency.value}`
            + ` · ${text.batchSize} ${batchSize.value}`
            + ` · ${text.retries} ${retries.value}`;
    };
    refreshAdvancedSummary();
    const promptLabel = element("label", "autocomplete-plus-online-field autocomplete-plus-online-wide");
    promptLabel.append(element("span", "", text.prompt));
    const prompt = document.createElement("textarea");
    prompt.rows = 5;
    prompt.value = config.deepseek.system_prompt;
    promptLabel.append(prompt);
    advancedGrid.append(promptLabel);
    for (const input of [concurrency, batchSize, retries]) {
        input.addEventListener("input", refreshAdvancedSummary);
    }
    advanced.append(advancedGrid);
    translationSection.append(advanced);
    pages.deepseek.append(translationSection);
    selectPage("danbooru");

    const actions = element("footer", "autocomplete-plus-online-actions");
    const close = button(text.cancel);
    close.onclick = () => dialog.close();
    const save = button(text.save, "is-primary");
    const refreshStatus = async () => {
        updateStatusCards(await requestJson(`${API_ROOT}/status`));
        updateCacheSummary();
    };
    const runModelAction = async (target, path, busyText, successText) => {
        message.textContent = "";
        delete message.dataset.tone;
        setButtonBusy(target, true, busyText);
        try {
            const payload = await requestJson(`${API_ROOT}/${path}`, {
                method: "POST",
                body: JSON.stringify({
                    api_key: apiKey.value,
                    model: model.value,
                    reasoning_effort: reasoningEffort.value,
                }),
            });
            if (Array.isArray(payload.models)) {
                model.replaceChildren(...payload.models.map(modelId => {
                    const option = document.createElement("option");
                    option.value = modelId;
                    option.textContent = modelId;
                    return option;
                }));
                if (!payload.models.includes(model.value) && payload.models.length) model.value = payload.models[0];
            }
            await refreshStatus();
            message.textContent = Array.isArray(payload.models)
                ? `${successText}（${payload.models.length}）`
                : successText;
            message.dataset.tone = "success";
        } finally {
            setButtonBusy(target, false, busyText);
        }
    };
    const showActionError = async error => {
        await refreshStatus().catch(() => {});
        message.textContent = error.message;
        message.dataset.tone = "error";
    };
    refreshModels.onclick = () => runModelAction(
        refreshModels,
        "models",
        `${text.refreshModels}…`,
        text.modelsLoaded,
    ).catch(showActionError);
    testModel.onclick = () => runModelAction(
        testModel,
        "test",
        `${text.testModel}…`,
        text.modelAlive,
    ).catch(showActionError);
    checkSources.onclick = async () => {
        message.textContent = text.checkingSources;
        delete message.dataset.tone;
        setButtonBusy(checkSources, true, text.checkingSources);
        const checks = [
            searchLoraManagerCandidates("blue", {
                limit: 1,
                mode: "auto",
                tagSource: "danbooru",
                includeModels: false,
            }),
        ];
        if (danbooruEnabled.checked) {
            checks.push(requestJson("/autocomplete-plus/danbooru/search?q=blue&limit=1&refresh=1"));
            checks.push(requestJson("/autocomplete-plus/danbooru/related?q=blue_archive&limit=1&refresh=1"));
        }
        if (translationEnabled.checked && (status.configured || apiKey.value.trim())) {
            checks.push(requestJson(`${API_ROOT}/test`, {
                method: "POST",
                body: JSON.stringify({
                    api_key: apiKey.value,
                    model: model.value,
                    reasoning_effort: reasoningEffort.value,
                }),
            }));
        }
        await Promise.allSettled(checks);
        try {
            await refreshStatus();
            message.textContent = text.sourcesChecked;
            message.dataset.tone = "success";
        } catch (error) {
            message.textContent = error.message;
            message.dataset.tone = "error";
        } finally {
            setButtonBusy(checkSources, false, text.checkingSources);
        }
    };
    clearCache.onclick = async () => {
        try {
            await requestJson("/autocomplete-plus/danbooru/cache/clear", { method: "POST" });
            clearDanbooruSessionCache();
            await refreshStatus();
            message.textContent = text.cacheCleared;
            message.dataset.tone = "success";
        } catch (error) {
            message.textContent = error.message;
            message.dataset.tone = "error";
        }
    };
    save.onclick = async () => {
        try {
            config = await requestJson(`${API_ROOT}/config`, {
                method: "PUT",
                body: JSON.stringify({
                    features: {
                        danbooru_completion: danbooruEnabled.checked,
                        translation: translationEnabled.checked,
                    },
                    deepseek: {
                        api_key: apiKey.value,
                        model: model.value,
                        reasoning_effort: reasoningEffort.value,
                        concurrency: Number(concurrency.value),
                        batch_size: Number(batchSize.value),
                        max_retries: Number(retries.value),
                        timeout_seconds: Number(timeout.value),
                        system_prompt: prompt.value,
                    },
                }),
            });
            updateOnlineServiceFeatures(config.features);
            if (config.features.translation) {
                void loadTranslationCatalog(locale);
            }
            apiKey.value = config.deepseek.api_key;
            await refreshStatus();
            message.textContent = text.saved;
            message.dataset.tone = "success";
        } catch (error) {
            message.textContent = error.message;
            message.dataset.tone = "error";
        }
    };
    actions.append(close, save);
    panel.append(actions);
    dialog.addEventListener("click", event => {
        if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", () => {
        if (dictionaryPoll !== null) window.clearInterval(dictionaryPoll);
        dialog.remove();
    }, { once: true });
    dialog.tabIndex = -1;
    dialog.showModal();
    dialog.focus({ preventScroll: true });
}
