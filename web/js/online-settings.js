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
        open: "Configure online completion and translation",
        sources: "Data source status",
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
        enableTranslation: "Enable automatic translation",
        completionCache: "Persistent Danbooru result cache",
        cachePages: "pages",
        clearCache: "Clear Danbooru result cache",
        cacheCleared: "Danbooru result cache cleared",
        translation: "Translation",
        locale: "Interface language",
        apiKey: "DeepSeek API key",
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
        save: "Save",
        close: "Close",
        saved: "Settings saved",
    },
    zh: {
        title: "在线补全与翻译",
        open: "配置在线补全与翻译",
        sources: "数据源状态",
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
        features: "在线功能开关",
        enableDanbooru: "启用 Danbooru API 补充",
        enableTranslation: "启用自动翻译",
        completionCache: "Danbooru 结果持久缓存",
        cachePages: "页",
        clearCache: "清空 Danbooru 结果缓存",
        cacheCleared: "Danbooru 结果缓存已清空",
        translation: "翻译设置",
        locale: "界面语言",
        apiKey: "DeepSeek API Key",
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
        save: "保存",
        close: "关闭",
        saved: "设置已保存",
    },
    "zh-TW": {
        title: "線上補全與翻譯",
        open: "設定線上補全與翻譯",
        sources: "資料來源狀態",
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
        features: "線上功能開關",
        enableDanbooru: "啟用 Danbooru API 補充",
        enableTranslation: "啟用自動翻譯",
        completionCache: "Danbooru 結果持久快取",
        cachePages: "頁",
        clearCache: "清除 Danbooru 結果快取",
        cacheCleared: "Danbooru 結果快取已清除",
        translation: "翻譯設定",
        locale: "介面語言",
        apiKey: "DeepSeek API Key",
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
        save: "儲存",
        close: "關閉",
        saved: "設定已儲存",
    },
    ja: {
        title: "オンライン補完と翻訳",
        open: "オンライン補完と翻訳を設定",
        sources: "データソースの状態",
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
        features: "オンライン機能スイッチ",
        enableDanbooru: "Danbooru API 補足を有効化",
        enableTranslation: "自動翻訳を有効化",
        completionCache: "Danbooru 結果の永続キャッシュ",
        cachePages: "ページ",
        clearCache: "Danbooru 結果キャッシュを消去",
        cacheCleared: "Danbooru 結果キャッシュを消去しました",
        translation: "翻訳設定",
        locale: "表示言語",
        apiKey: "DeepSeek API Key",
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
        save: "保存",
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

function toggleField(parent, label, checked) {
    const wrapper = element("label", "autocomplete-plus-online-toggle");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    wrapper.append(input, element("span", "", label));
    parent.append(wrapper);
    return input;
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

export function createOnlineServicesSetting(app, extensionName, extensionId) {
    return {
        id: `${extensionId}.OnlineServices.Manager`,
        name: "Configure online completion and translation",
        category: [extensionName, "Online Services", "Online completion and translation"],
        defaultValue: null,
        type: () => {
            const text = TEXT[getCurrentInterfaceLocale()] || TEXT.en;
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
    header.append(element("h2", "", text.title));
    const closeHeader = element("button", "autocomplete-plus-online-icon-button", "×");
    closeHeader.type = "button";
    closeHeader.ariaLabel = text.close;
    closeHeader.onclick = () => dialog.close();
    header.append(closeHeader);
    panel.append(header);

    const message = element("div", "autocomplete-plus-online-message");
    panel.append(message);

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
    featureSection.append(element("h3", "", text.features));
    const featureGrid = element("div", "autocomplete-plus-online-toggle-grid");
    const danbooruEnabled = toggleField(
        featureGrid,
        text.enableDanbooru,
        config.features?.danbooru_completion !== false,
    );
    const translationEnabled = toggleField(
        featureGrid,
        text.enableTranslation,
        config.features?.translation !== false,
    );
    featureSection.append(featureGrid);
    panel.append(featureSection);

    const statusSection = element("section", "autocomplete-plus-online-section");
    statusSection.append(element("h3", "", text.sources));
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
        }
    };
    updateStatusCards(status);
    danbooruEnabled.onchange = () => updateStatusCards(status);
    translationEnabled.onchange = () => updateStatusCards(status);
    const statusActions = element("div", "autocomplete-plus-online-status-actions");
    const checkSources = element("button", "p-button p-component", text.checkSources);
    checkSources.type = "button";
    const clearCache = element("button", "p-button p-component", text.clearCache);
    clearCache.type = "button";
    const cacheSummary = element("span", "autocomplete-plus-online-cache-summary");
    const updateCacheSummary = () => {
        const cacheStatus = status.danbooru?.cache || {};
        cacheSummary.textContent = `${text.completionCache}: ${cacheStatus.entries || 0} ${text.cachePages}`
            + ` · ${formatBytes(cacheStatus.size_bytes)}`;
    };
    updateCacheSummary();
    statusActions.append(cacheSummary, checkSources, clearCache);
    statusSection.append(statusActions);
    panel.append(statusSection);

    const translationSection = element("section", "autocomplete-plus-online-section");
    translationSection.append(element("h3", "", text.translation));
    const localeRow = element("div", "autocomplete-plus-online-summary");
    localeRow.append(
        element("span", "", `${text.locale}: ${locale}`),
        element("span", "", `${text.cache}: ${status.cache_count || 0}`),
    );
    translationSection.append(localeRow);
    const form = element("div", "autocomplete-plus-online-grid");
    const apiKey = field(form, text.apiKey, "password", config.deepseek.api_key);
    if (config.deepseek.api_key_configured) apiKey.placeholder = text.configured;
    const model = field(form, text.model, "text", config.deepseek.model);
    const modelList = document.createElement("datalist");
    modelList.id = `autocomplete-plus-models-${Date.now()}`;
    model.setAttribute("list", modelList.id);
    form.append(modelList);
    const reasoningEffort = selectField(form, text.thinking, config.deepseek.reasoning_effort || "disabled", [
        ["disabled", text.disabled],
        ["high", text.high],
        ["max", text.max],
    ]);
    const modelActions = element("div", "autocomplete-plus-online-model-actions autocomplete-plus-online-wide");
    const refreshModels = element("button", "p-button p-component", text.refreshModels);
    refreshModels.type = "button";
    const testModel = element("button", "p-button p-component", text.testModel);
    testModel.type = "button";
    modelActions.append(refreshModels, testModel);
    form.append(modelActions);
    translationSection.append(form);

    const advanced = element("details", "autocomplete-plus-online-advanced");
    advanced.append(element("summary", "", text.advanced));
    const advancedGrid = element("div", "autocomplete-plus-online-grid");
    const concurrency = field(advancedGrid, text.concurrency, "number", config.deepseek.concurrency, 1, 300);
    const batchSize = field(advancedGrid, text.batchSize, "number", config.deepseek.batch_size, 1, 200);
    const retries = field(advancedGrid, text.retries, "number", config.deepseek.max_retries, 0, 10);
    const timeout = field(advancedGrid, text.timeout, "number", config.deepseek.timeout_seconds, 10, 600);
    const promptLabel = element("label", "autocomplete-plus-online-field autocomplete-plus-online-wide");
    promptLabel.append(element("span", "", text.prompt));
    const prompt = document.createElement("textarea");
    prompt.rows = 5;
    prompt.value = config.deepseek.system_prompt;
    promptLabel.append(prompt);
    advancedGrid.append(promptLabel);
    advanced.append(advancedGrid);
    translationSection.append(advanced);
    panel.append(translationSection);

    const actions = element("footer", "autocomplete-plus-online-actions");
    const close = element("button", "p-button p-component", text.close);
    close.type = "button";
    close.onclick = () => dialog.close();
    const save = element("button", "p-button p-component p-button-primary", text.save);
    save.type = "button";
    const refreshStatus = async () => {
        updateStatusCards(await requestJson(`${API_ROOT}/status`));
        updateCacheSummary();
    };
    const runModelAction = async (path, successText) => {
        message.textContent = "";
        delete message.dataset.tone;
        const payload = await requestJson(`${API_ROOT}/${path}`, {
            method: "POST",
            body: JSON.stringify({
                api_key: apiKey.value,
                model: model.value,
                reasoning_effort: reasoningEffort.value,
            }),
        });
        if (Array.isArray(payload.models)) {
            modelList.replaceChildren(...payload.models.map(modelId => {
                const option = document.createElement("option");
                option.value = modelId;
                return option;
            }));
            if (!payload.models.includes(model.value) && payload.models.length) model.value = payload.models[0];
        }
        await refreshStatus();
        message.textContent = successText;
        message.dataset.tone = "success";
    };
    const showActionError = async error => {
        await refreshStatus().catch(() => {});
        message.textContent = error.message;
        message.dataset.tone = "error";
    };
    refreshModels.onclick = () => runModelAction("models", text.modelsLoaded).catch(showActionError);
    testModel.onclick = () => runModelAction("test", text.modelAlive).catch(showActionError);
    checkSources.onclick = async () => {
        message.textContent = text.checkingSources;
        delete message.dataset.tone;
        checkSources.disabled = true;
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
            checkSources.disabled = false;
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
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    dialog.showModal();
}
