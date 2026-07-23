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
    const reveal = iconButton("pi-eye", text.showApiKey);
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
        reveal.firstElementChild.className = `pi ${showing ? "pi-eye" : "pi-eye-slash"}`;
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

function iconButton(icon, label) {
    const result = button("", "autocomplete-plus-online-icon-button");
    result.ariaLabel = label;
    const iconElement = element("i", `pi ${icon}`);
    iconElement.ariaHidden = "true";
    result.append(iconElement);
    return result;
}

function setButtonBusy(target, busy, busyLabel) {
    if (!target.dataset.idleLabel) target.dataset.idleLabel = target.textContent;
    target.disabled = busy;
    target.ariaBusy = String(busy);
    target.textContent = busy ? busyLabel : target.dataset.idleLabel;
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
    const closeHeader = iconButton("pi-times", text.close);
    closeHeader.onclick = () => dialog.close();
    header.append(closeHeader);
    panel.append(header);

    const message = element("div", "autocomplete-plus-online-message");
    message.setAttribute("role", "status");
    message.setAttribute("aria-live", "polite");
    panel.append(message);
    const content = element("main", "autocomplete-plus-online-content");
    panel.append(content);

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

    const featureSection = element("section", "autocomplete-plus-online-section");
    featureSection.append(sectionHeading(text.features));
    const featureGrid = element("div", "autocomplete-plus-online-toggle-grid");
    const danbooruEnabled = toggleField(
        featureGrid,
        text.enableDanbooru,
        text.danbooruHelp,
        config.features?.danbooru_completion !== false,
    );
    const translationEnabled = toggleField(
        featureGrid,
        text.enableTranslation,
        text.translationHelp,
        config.features?.translation !== false,
    );
    featureSection.append(featureGrid);
    content.append(featureSection);

    const statusSection = element("section", "autocomplete-plus-online-section");
    const checkSources = button(text.checkSources);
    statusSection.append(sectionHeading(text.sources, text.sourcesHint, checkSources));
    const statusGrid = element("div", "autocomplete-plus-online-status-grid");
    const statusCards = {};
    for (const [key, label] of [
        ["huggingface", text.huggingface],
        ["loraManager", text.loraManager],
        ["danbooru", text.danbooru],
        ["deepseek", text.deepseek],
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
    content.append(statusSection);

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
    const testModel = button(text.testModel, "is-emphasized");
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
    content.append(translationSection);

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
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    dialog.tabIndex = -1;
    dialog.showModal();
    dialog.focus({ preventScroll: true });
}
