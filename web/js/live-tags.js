import { getTagCategoryLabel } from './tag-presentation.js';

const API_ROOT = "/autocomplete-plus/live-tags";
const CATEGORY_NAMES = ["general", "artist", "unused", "copyright", "character", "meta"];

const TEXT = {
    en: {
        title: "Danbooru Live Tags",
        open: "Open manager",
        description: "Scan new Danbooru tags and complete missing base CSV translations with DeepSeek.",
        overview: "Sync overview",
        categories: "Category filters",
        categoriesDescription: "Choose which tag groups to include and control their size.",
        credentials: "Credentials",
        credentialsDescription: "Keys are stored only in the local ComfyUI user directory.",
        openDanbooru: "Open Danbooru",
        translation: "DeepSeek translation",
        translationDescription: "Translate new tags and base tags missing the current interface language.",
        advanced: "Advanced prompt",
        policy: "Fetch policy",
        thresholdValue: "Minimum post count",
        allHint: "All tags",
        disabledHint: "Skipped",
        disabled: "Do not fetch",
        all: "Fetch all",
        threshold: "Minimum post count",
        danbooruLogin: "Danbooru login (optional)",
        danbooruKey: "Danbooru API key (optional)",
        scanConcurrency: "Scan concurrency",
        deepseekKey: "DeepSeek API key",
        configured: "Configured; leave unchanged to keep it",
        model: "Model",
        prompt: "System prompt",
        concurrency: "Max concurrency",
        batchSize: "Tags per request",
        retries: "Retries",
        timeout: "Timeout (seconds)",
        locale: "Translation language",
        save: "Save settings",
        scan: "Scan tags",
        translate: "Translate missing",
        retryFailed: "Retry failed",
        retranslate: "Retranslate all",
        cancel: "Cancel task",
        refresh: "Refresh page",
        close: "Close",
        baseTags: "Base tags",
        baseMissing: "Base translations missing",
        candidates: "New candidates",
        translated: "Cached translations",
        pending: "Pending translations",
        requests: "Estimated requests",
        completed: "Processed",
        scanned: "Scanned",
        cached: "Cache hits",
        retrying: "Retries",
        failed: "Failed",
        idle: "Idle",
        saved: "Settings saved",
        refreshHint: "The generated CSV changed. Refresh the page to rebuild the search index.",
        manager: "LIVE DATA WORKSPACE",
        invalidMode: "Invalid mode for {category}",
        invalidThreshold: "Invalid threshold for {category}",
        rangeError: "{field} must be between {minimum} and {maximum}",
        modelRequired: "Model cannot be empty",
        promptRequired: "System prompt cannot be empty",
        errorMessages: {
            danbooruCloudflareBlocked: "Danbooru access was blocked by Cloudflare. Configure a Danbooru login and API key, or try another network.",
            danbooruAuthFailed: "Danbooru authentication failed. Check the configured login and API key.",
            danbooruRequestFailed: "The Danbooru request failed. Check the network, authentication, and service status.",
            danbooruInvalidResponse: "Danbooru returned invalid data. Please try again later.",
            danbooruPaginationFailed: "Danbooru pagination stopped unexpectedly. Please retry the scan.",
            deepseekAuthFailed: "DeepSeek rejected the API key. Check the configured key.",
            deepseekRequestFailed: "The DeepSeek request failed. Check the network, account balance, and service status.",
            deepseekInvalidResponse: "DeepSeek returned an invalid response. Please retry the failed items.",
            deepseekKeyMissing: "Configure a DeepSeek API key before starting translation.",
            baseCsvReadFailed: "The base Danbooru CSV could not be read.",
            baseCsvInvalid: "The base Danbooru CSV contains invalid data.",
            jobConflict: "Another scan or translation task is already running.",
            englishTranslationNotRequired: "English does not require translation.",
            translationModeInvalid: "The selected translation mode is invalid.",
        },
        jobStates: {
            queued: "Queued", running: "Running", cancelling: "Cancelling", loading_base: "Loading base CSV",
            scanning: "Scanning tags", committing: "Saving scan results", translating: "Translating tags",
            completed: "Completed", cancelled: "Cancelled", interrupted: "Interrupted", failed: "Failed",
        },
    },
    zh: {
        title: "Danbooru 实时标签",
        open: "打开管理面板",
        description: "扫描 Danbooru 新标签，并使用 DeepSeek 补全基础表缺失的翻译。",
        overview: "同步概览",
        categories: "类别筛选",
        categoriesDescription: "决定需要补充的标签类别，并控制候选数据规模。",
        credentials: "凭据",
        credentialsDescription: "密钥仅保存在本机 ComfyUI 用户目录。",
        openDanbooru: "打开 Danbooru",
        translation: "DeepSeek 翻译",
        translationDescription: "翻译新增标签，并补全基础表中缺少当前界面语言的条目。",
        advanced: "高级提示词",
        policy: "拉取策略",
        thresholdValue: "最低热度",
        allHint: "包含全部标签",
        disabledHint: "已跳过",
        disabled: "不拉取",
        all: "全部拉取",
        threshold: "最低热度",
        danbooruLogin: "Danbooru 用户名（可选）",
        danbooruKey: "Danbooru API Key（可选）",
        scanConcurrency: "扫描并发数",
        deepseekKey: "DeepSeek API Key",
        configured: "已配置；保持不变即可继续使用",
        model: "模型",
        prompt: "System Prompt",
        concurrency: "最大并发数",
        batchSize: "每次标签数",
        retries: "重试次数",
        timeout: "超时（秒）",
        locale: "翻译语言",
        save: "保存设置",
        scan: "扫描标签",
        translate: "翻译未完成项",
        retryFailed: "重试失败项",
        retranslate: "重新翻译全部",
        cancel: "取消任务",
        refresh: "刷新页面",
        close: "关闭",
        baseTags: "基础标签数",
        baseMissing: "基础表缺失翻译",
        candidates: "新增候选数",
        translated: "已缓存翻译",
        pending: "待翻译数",
        requests: "预计请求数",
        completed: "已处理",
        scanned: "已扫描",
        cached: "缓存命中",
        retrying: "重试次数",
        failed: "失败",
        idle: "空闲",
        saved: "设置已保存",
        refreshHint: "额外 CSV 已更新，请刷新页面以重建搜索索引。",
        manager: "实时数据工作台",
        invalidMode: "{category} 的拉取策略无效",
        invalidThreshold: "{category} 的最低热度无效",
        rangeError: "{field} 必须在 {minimum} 到 {maximum} 之间",
        modelRequired: "模型不能为空",
        promptRequired: "System Prompt 不能为空",
        errorMessages: {
            danbooruCloudflareBlocked: "Danbooru 访问被 Cloudflare 拦截。请配置 Danbooru 用户名和 API Key，或更换网络后重试。",
            danbooruAuthFailed: "Danbooru 认证失败，请检查用户名和 API Key。",
            danbooruRequestFailed: "Danbooru 请求失败，请检查网络、认证配置和服务状态。",
            danbooruInvalidResponse: "Danbooru 返回了无效数据，请稍后重试。",
            danbooruPaginationFailed: "Danbooru 分页异常中断，请重新扫描。",
            deepseekAuthFailed: "DeepSeek 拒绝了 API Key，请检查密钥配置。",
            deepseekRequestFailed: "DeepSeek 请求失败，请检查网络、账户余额和服务状态。",
            deepseekInvalidResponse: "DeepSeek 返回了无效响应，请重试失败项。",
            deepseekKeyMissing: "请先配置 DeepSeek API Key，再开始翻译。",
            baseCsvReadFailed: "无法读取 Danbooru 基础 CSV。",
            baseCsvInvalid: "Danbooru 基础 CSV 中存在无效数据。",
            jobConflict: "已有扫描或翻译任务正在运行。",
            englishTranslationNotRequired: "英文标签不需要翻译。",
            translationModeInvalid: "所选翻译模式无效。",
        },
        jobStates: {
            queued: "等待开始", running: "正在运行", cancelling: "正在取消", loading_base: "正在读取基础 CSV",
            scanning: "正在扫描标签", committing: "正在保存扫描结果", translating: "正在翻译标签",
            completed: "已完成", cancelled: "已取消", interrupted: "已中断", failed: "失败",
        },
    },
    "zh-TW": {
        title: "Danbooru 即時標籤",
        open: "開啟管理面板",
        description: "掃描 Danbooru 新標籤，並使用 DeepSeek 補全基礎表缺少的翻譯。",
        overview: "同步概覽",
        categories: "類別篩選",
        categoriesDescription: "決定需要補充的標籤類別，並控制候選資料規模。",
        credentials: "憑證",
        credentialsDescription: "金鑰僅儲存在本機 ComfyUI 使用者目錄。",
        openDanbooru: "開啟 Danbooru",
        translation: "DeepSeek 翻譯",
        translationDescription: "翻譯新增標籤，並補全基礎表中缺少目前介面語言的項目。",
        advanced: "進階提示詞",
        policy: "擷取策略",
        thresholdValue: "最低熱度",
        allHint: "包含全部標籤",
        disabledHint: "已略過",
        disabled: "不擷取",
        all: "全部擷取",
        threshold: "最低熱度",
        danbooruLogin: "Danbooru 使用者名稱（可選）",
        danbooruKey: "Danbooru API Key（可選）",
        scanConcurrency: "掃描並行數",
        deepseekKey: "DeepSeek API Key",
        configured: "已設定；保持不變即可繼續使用",
        model: "模型",
        prompt: "System Prompt",
        concurrency: "最大並行數",
        batchSize: "每次標籤數",
        retries: "重試次數",
        timeout: "逾時（秒）",
        locale: "翻譯語言",
        save: "儲存設定",
        scan: "掃描標籤",
        translate: "翻譯未完成項",
        retryFailed: "重試失敗項",
        retranslate: "重新翻譯全部",
        cancel: "取消工作",
        refresh: "重新整理頁面",
        close: "關閉",
        baseTags: "基礎標籤數",
        baseMissing: "基礎表缺少翻譯",
        candidates: "新增候選數",
        translated: "已快取翻譯",
        pending: "待翻譯數",
        requests: "預估請求數",
        completed: "已處理",
        scanned: "已掃描",
        cached: "快取命中",
        retrying: "重試次數",
        failed: "失敗",
        idle: "閒置",
        saved: "設定已儲存",
        refreshHint: "額外 CSV 已更新，請重新整理頁面以重建搜尋索引。",
        manager: "即時資料工作台",
        invalidMode: "{category} 的擷取策略無效",
        invalidThreshold: "{category} 的最低熱度無效",
        rangeError: "{field} 必須介於 {minimum} 與 {maximum} 之間",
        modelRequired: "模型不能為空",
        promptRequired: "System Prompt 不能為空",
        errorMessages: {
            danbooruCloudflareBlocked: "Danbooru 存取被 Cloudflare 阻擋。請設定 Danbooru 使用者名稱和 API Key，或更換網路後再試。",
            danbooruAuthFailed: "Danbooru 驗證失敗，請檢查使用者名稱和 API Key。",
            danbooruRequestFailed: "Danbooru 請求失敗，請檢查網路、驗證設定和服務狀態。",
            danbooruInvalidResponse: "Danbooru 傳回了無效資料，請稍後再試。",
            danbooruPaginationFailed: "Danbooru 分頁異常中斷，請重新掃描。",
            deepseekAuthFailed: "DeepSeek 拒絕了 API Key，請檢查金鑰設定。",
            deepseekRequestFailed: "DeepSeek 請求失敗，請檢查網路、帳戶餘額和服務狀態。",
            deepseekInvalidResponse: "DeepSeek 傳回了無效回應，請重試失敗項目。",
            deepseekKeyMissing: "請先設定 DeepSeek API Key，再開始翻譯。",
            baseCsvReadFailed: "無法讀取 Danbooru 基礎 CSV。",
            baseCsvInvalid: "Danbooru 基礎 CSV 中包含無效資料。",
            jobConflict: "已有掃描或翻譯工作正在執行。",
            englishTranslationNotRequired: "英文標籤不需要翻譯。",
            translationModeInvalid: "所選翻譯模式無效。",
        },
        jobStates: {
            queued: "等待開始", running: "執行中", cancelling: "正在取消", loading_base: "正在讀取基礎 CSV",
            scanning: "正在掃描標籤", committing: "正在儲存掃描結果", translating: "正在翻譯標籤",
            completed: "已完成", cancelled: "已取消", interrupted: "已中斷", failed: "失敗",
        },
    },
    ja: {
        title: "Danbooru ライブタグ",
        open: "管理画面を開く",
        description: "Danbooru の新規タグを取得し、基本 CSV の不足翻訳を DeepSeek で補完します。",
        overview: "同期サマリー",
        categories: "カテゴリフィルター",
        categoriesDescription: "取得するタグカテゴリを選び、候補データの規模を調整します。",
        credentials: "認証情報",
        credentialsDescription: "キーはローカルの ComfyUI ユーザーディレクトリにのみ保存されます。",
        openDanbooru: "Danbooru を開く",
        translation: "DeepSeek 翻訳",
        translationDescription: "新規タグと、現在の表示言語がない基本タグを翻訳します。",
        advanced: "詳細プロンプト",
        policy: "取得方法",
        thresholdValue: "最低投稿数",
        allHint: "すべてのタグ",
        disabledHint: "スキップ",
        disabled: "取得しない",
        all: "すべて取得",
        threshold: "最低投稿数",
        danbooruLogin: "Danbooru ログイン名（任意）",
        danbooruKey: "Danbooru API Key（任意）",
        scanConcurrency: "スキャン同時実行数",
        deepseekKey: "DeepSeek API Key",
        configured: "設定済み。変更しない場合はそのままにしてください",
        model: "モデル",
        prompt: "System Prompt",
        concurrency: "最大同時実行数",
        batchSize: "1リクエストのタグ数",
        retries: "再試行回数",
        timeout: "タイムアウト（秒）",
        locale: "翻訳言語",
        save: "設定を保存",
        scan: "タグをスキャン",
        translate: "未翻訳を翻訳",
        retryFailed: "失敗分を再試行",
        retranslate: "すべて再翻訳",
        cancel: "タスクをキャンセル",
        refresh: "ページを更新",
        close: "閉じる",
        baseTags: "基本タグ数",
        baseMissing: "基本タグの翻訳不足",
        candidates: "新規候補数",
        translated: "キャッシュ済み翻訳",
        pending: "未翻訳数",
        requests: "推定リクエスト数",
        completed: "処理済み",
        scanned: "スキャン済み",
        cached: "キャッシュヒット",
        retrying: "再試行",
        failed: "失敗",
        idle: "待機中",
        saved: "設定を保存しました",
        refreshHint: "追加 CSV が更新されました。ページを更新して検索インデックスを再構築してください。",
        manager: "ライブデータワークスペース",
        invalidMode: "{category} の取得方法が無効です",
        invalidThreshold: "{category} の最低投稿数が無効です",
        rangeError: "{field} は {minimum} から {maximum} の範囲で指定してください",
        modelRequired: "モデルを入力してください",
        promptRequired: "System Prompt を入力してください",
        errorMessages: {
            danbooruCloudflareBlocked: "Danbooru へのアクセスが Cloudflare にブロックされました。Danbooru のログイン名と API Key を設定するか、別のネットワークで再試行してください。",
            danbooruAuthFailed: "Danbooru の認証に失敗しました。ログイン名と API Key を確認してください。",
            danbooruRequestFailed: "Danbooru へのリクエストに失敗しました。ネットワーク、認証設定、サービス状態を確認してください。",
            danbooruInvalidResponse: "Danbooru から無効なデータが返されました。しばらくしてから再試行してください。",
            danbooruPaginationFailed: "Danbooru のページ取得が異常終了しました。もう一度スキャンしてください。",
            deepseekAuthFailed: "DeepSeek が API Key を拒否しました。キーの設定を確認してください。",
            deepseekRequestFailed: "DeepSeek へのリクエストに失敗しました。ネットワーク、残高、サービス状態を確認してください。",
            deepseekInvalidResponse: "DeepSeek から無効な応答が返されました。失敗項目を再試行してください。",
            deepseekKeyMissing: "翻訳を開始する前に DeepSeek API Key を設定してください。",
            baseCsvReadFailed: "Danbooru の基本 CSV を読み込めませんでした。",
            baseCsvInvalid: "Danbooru の基本 CSV に無効なデータがあります。",
            jobConflict: "別のスキャンまたは翻訳タスクが実行中です。",
            englishTranslationNotRequired: "英語タグは翻訳不要です。",
            translationModeInvalid: "選択した翻訳モードは無効です。",
        },
        jobStates: {
            queued: "開始待ち", running: "実行中", cancelling: "キャンセル中", loading_base: "基本 CSV を読み込み中",
            scanning: "タグをスキャン中", committing: "スキャン結果を保存中", translating: "タグを翻訳中",
            completed: "完了", cancelled: "キャンセル済み", interrupted: "中断", failed: "失敗",
        },
    },
};

export function normalizeLiveTagsLocale(locale) {
    const normalized = String(locale || "en").replaceAll("_", "-").toLowerCase();
    if (["zh-tw", "zh-hant", "zh-hk"].includes(normalized)) return "zh-TW";
    if (normalized.startsWith("zh")) return "zh";
    if (normalized.startsWith("ja")) return "ja";
    return "en";
}

function formatText(template, parameters = {}) {
    return String(template).replace(/\{(\w+)\}/g, (match, name) =>
        Object.hasOwn(parameters, name) ? String(parameters[name]) : match);
}

const ERROR_MESSAGE_KEYS = {
    danbooru_cloudflare_blocked: "danbooruCloudflareBlocked",
    danbooru_auth_failed: "danbooruAuthFailed",
    danbooru_request_failed: "danbooruRequestFailed",
    danbooru_invalid_response: "danbooruInvalidResponse",
    danbooru_pagination_failed: "danbooruPaginationFailed",
    deepseek_auth_failed: "deepseekAuthFailed",
    deepseek_request_failed: "deepseekRequestFailed",
    deepseek_invalid_response: "deepseekInvalidResponse",
    deepseek_key_missing: "deepseekKeyMissing",
    base_csv_read_failed: "baseCsvReadFailed",
    base_csv_invalid: "baseCsvInvalid",
    job_conflict: "jobConflict",
    english_translation_not_required: "englishTranslationNotRequired",
    translation_mode_invalid: "translationModeInvalid",
};

const LEGACY_ERROR_CODES = [
    [/^Danbooru access was blocked by Cloudflare\b/u, "danbooru_cloudflare_blocked"],
    [/^Danbooru returned HTTP 403\b/u, "danbooru_auth_failed"],
    [/^Danbooru (?:request failed|returned HTTP)\b/u, "danbooru_request_failed"],
    [/^Danbooru returned (?:invalid JSON|an unexpected response|a page without valid tag records)\b/u, "danbooru_invalid_response"],
    [/^Danbooru pagination cursor did not advance\b/u, "danbooru_pagination_failed"],
    [/^DeepSeek rejected the API key\b/u, "deepseek_auth_failed"],
    [/^DeepSeek returned HTTP\b/u, "deepseek_request_failed"],
    [/^DeepSeek returned an invalid response envelope\b/u, "deepseek_invalid_response"],
    [/^Unable to read the base Danbooru CSV\b/u, "base_csv_read_failed"],
    [/^Invalid base Danbooru CSV row\b/u, "base_csv_invalid"],
];

export function localizeLiveTagsError(errorCode, fallback, locale = "en") {
    const text = TEXT[normalizeLiveTagsLocale(locale)];
    const legacyCode = LEGACY_ERROR_CODES.find(([pattern]) => pattern.test(String(fallback || "")))?.[1];
    const messageKey = ERROR_MESSAGE_KEYS[errorCode] || ERROR_MESSAGE_KEYS[legacyCode];
    return text.errorMessages?.[messageKey] || fallback || text.jobStates.failed;
}

function getLocalizedJobState(job, text) {
    const state = job?.phase || job?.status;
    return text.jobStates?.[state] || job?.message || state || text.completed;
}

export function validateLiveTagsConfig(config, locale = "en") {
    const text = TEXT[normalizeLiveTagsLocale(locale)];
    const errors = [];
    for (const category of CATEGORY_NAMES) {
        const policy = config.categories?.[category];
        if (!policy || !["disabled", "all", "threshold"].includes(policy.mode)) {
            errors.push(formatText(text.invalidMode, { category: getTagCategoryLabel(category, locale) }));
        } else if (policy.mode === "threshold" && (!Number.isInteger(policy.threshold) || policy.threshold < 0)) {
            errors.push(formatText(text.invalidThreshold, { category: getTagCategoryLabel(category, locale) }));
        }
    }
    const scanConcurrency = config.danbooru?.scan_concurrency;
    if (!Number.isInteger(scanConcurrency) || scanConcurrency < 1 || scanConcurrency > 16) {
        errors.push(formatText(text.rangeError, { field: "scan_concurrency", minimum: 1, maximum: 16 }));
    }
    const ranges = {
        concurrency: [1, 300],
        batch_size: [1, 200],
        max_retries: [0, 10],
        timeout_seconds: [10, 600],
    };
    for (const [key, [minimum, maximum]] of Object.entries(ranges)) {
        const value = config.deepseek?.[key];
        if (!Number.isInteger(value) || value < minimum || value > maximum) {
            errors.push(formatText(text.rangeError, { field: key, minimum, maximum }));
        }
    }
    if (!config.deepseek?.model?.trim()) errors.push(text.modelRequired);
    if (!config.deepseek?.system_prompt?.trim()) errors.push(text.promptRequired);
    return errors;
}

export function createLiveTagsSetting(app, extensionName, extensionId) {
    return {
        id: `${extensionId}.LiveTags.Manager`,
        name: "Manage Danbooru Live Tags",
        category: [extensionName, "Live Tags", "Manage Danbooru Live Tags"],
        defaultValue: null,
        type: () => {
            const text = TEXT[getCurrentLocale(app)];
            const button = createElement("button", "p-button p-component p-button-primary", text.open);
            button.type = "button";
            button.onclick = () => openLiveTagsManager(app);
            return button;
        },
    };
}

export async function openLiveTagsManager(app) {
    const locale = getCurrentLocale(app);
    const text = TEXT[locale];
    const dialog = createElement("dialog", "autocomplete-plus-live-tags-dialog");
    dialog.ariaLabel = text.title;
    dialog.tabIndex = -1;
    const form = createElement("div", "autocomplete-plus-live-tags-panel");
    dialog.append(form);
    document.body.append(dialog);

    const header = createElement("div", "autocomplete-plus-live-tags-header");
    const identity = createElement("div", "autocomplete-plus-live-tags-identity");
    identity.append(createIcon("pi-tags", "autocomplete-plus-live-tags-brand-icon"));
    const heading = createElement("div", "autocomplete-plus-live-tags-heading");
    heading.append(createElement("span", "autocomplete-plus-live-tags-eyebrow", text.manager));
    heading.append(createElement("h2", "", text.title), createElement("p", "", text.description));
    identity.append(heading);

    const headerActions = createElement("div", "autocomplete-plus-live-tags-header-actions");
    const stateBadge = createElement("span", "autocomplete-plus-live-tags-state is-idle");
    stateBadge.append(createElement("span", "autocomplete-plus-live-tags-state-dot"));
    const stateLabel = createElement("span", "", text.idle);
    stateBadge.append(stateLabel);
    const closeButton = actionButton(text.close, "pi-times", "autocomplete-plus-live-tags-icon-button");
    closeButton.ariaLabel = text.close;
    closeButton.title = text.close;
    closeButton.type = "button";
    closeButton.onclick = () => dialog.close();
    headerActions.append(stateBadge, closeButton);
    header.append(identity, headerActions);
    form.append(header);

    const taskStatus = createElement("div", "autocomplete-plus-live-tags-task-status");
    const taskCopy = createElement("div", "autocomplete-plus-live-tags-task-copy");
    taskCopy.append(createIcon("pi-info-circle"));
    const message = createElement("div", "autocomplete-plus-live-tags-message", text.idle);
    taskCopy.append(message);
    const jobCounters = createElement("div", "autocomplete-plus-live-tags-job-counters");
    const progress = createElement("progress", "autocomplete-plus-live-tags-progress");
    progress.max = 100;
    progress.value = 0;
    taskStatus.append(taskCopy, jobCounters, progress);
    form.append(taskStatus);

    let config;
    try {
        config = await requestJson(`${API_ROOT}/config`);
    } catch (error) {
        message.textContent = localizeLiveTagsError(error.errorCode, error.message, locale);
        dialog.showModal();
        dialog.focus();
        return;
    }

    const statisticsSection = createElement("section", "autocomplete-plus-live-tags-overview");
    const statisticsHeading = createElement("div", "autocomplete-plus-live-tags-overview-heading");
    statisticsHeading.append(createIcon("pi-chart-bar"), createElement("span", "", text.overview));
    const statistics = createElement("div", "autocomplete-plus-live-tags-statistics");
    const statisticValues = {};
    for (const [key, label, icon] of [
        ["base_tags", text.baseTags, "pi-database"],
        ["base_missing", text.baseMissing, "pi-file-edit"],
        ["candidates", text.candidates, "pi-plus-circle"],
        ["translated", text.translated, "pi-language"],
        ["untranslated", text.pending, "pi-clock"],
        ["estimated_requests", text.requests, "pi-send"],
    ]) {
        const item = createElement("div", "autocomplete-plus-live-tags-statistic");
        item.append(createIcon(icon));
        const value = createElement("div", "autocomplete-plus-live-tags-statistic-value");
        statisticValues[key] = createElement("strong", "", "0");
        value.append(statisticValues[key], createElement("span", "", label));
        item.append(value);
        statistics.append(item);
    }
    statisticsSection.append(statisticsHeading, statistics);
    form.append(statisticsSection);

    const workspace = createElement("div", "autocomplete-plus-live-tags-workspace");
    const leftColumn = createElement("div", "autocomplete-plus-live-tags-column");
    const rightColumn = createElement("div", "autocomplete-plus-live-tags-column");

    const categorySection = createSection(
        text.categories,
        "autocomplete-plus-live-tags-categories",
        text.categoriesDescription,
        "pi-filter",
    );
    const categoryInputs = {};
    for (const category of CATEGORY_NAMES) {
        const row = createElement("div", "autocomplete-plus-live-tags-category-row");
        const categoryLabel = getTagCategoryLabel(category, locale);
        const categoryName = createElement("strong", "autocomplete-plus-live-tags-category-name", categoryLabel);
        row.append(categoryName);
        const mode = document.createElement("select");
        mode.ariaLabel = `${categoryLabel} ${text.policy}`;
        for (const [value, label] of [["disabled", text.disabled], ["all", text.all], ["threshold", text.threshold]]) {
            const option = new Option(label, value, false, config.categories[category].mode === value);
            mode.add(option);
        }
        const thresholdSlot = createElement("div", "autocomplete-plus-live-tags-threshold-slot");
        const threshold = createNumberInput(config.categories[category].threshold, 0, Number.MAX_SAFE_INTEGER);
        threshold.ariaLabel = `${categoryLabel} ${text.thresholdValue}`;
        const policyHint = createElement("span", "autocomplete-plus-live-tags-policy-hint");
        const updateThresholdState = () => {
            const usesThreshold = mode.value === "threshold";
            row.dataset.mode = mode.value;
            threshold.hidden = !usesThreshold;
            policyHint.hidden = usesThreshold;
            policyHint.textContent = mode.value === "all" ? text.allHint : text.disabledHint;
        };
        mode.onchange = updateThresholdState;
        updateThresholdState();
        thresholdSlot.append(threshold, policyHint);
        row.append(mode, thresholdSlot);
        categorySection.append(row);
        categoryInputs[category] = { mode, threshold };
    }
    leftColumn.append(categorySection);

    const credentialsSection = createDisclosureSection(
        text.credentials,
        "autocomplete-plus-live-tags-grid autocomplete-plus-live-tags-credentials",
        text.credentialsDescription,
        "pi-key",
    );
    const danbooruLink = createElement("a", "autocomplete-plus-live-tags-external-link");
    danbooruLink.href = "https://danbooru.donmai.us/";
    danbooruLink.target = "_blank";
    danbooruLink.rel = "noopener noreferrer";
    danbooruLink.title = text.openDanbooru;
    danbooruLink.ariaLabel = text.openDanbooru;
    danbooruLink.append(createIcon("pi-external-link"), createElement("span", "", text.openDanbooru));
    danbooruLink.onclick = event => event.stopPropagation();
    credentialsSection.querySelector("summary").append(danbooruLink);
    const danbooruLogin = createField(credentialsSection, text.danbooruLogin, "text", config.danbooru.login);
    const danbooruKey = createField(credentialsSection, text.danbooruKey, "password", config.danbooru.api_key);
    const scanConcurrency = createField(
        credentialsSection,
        text.scanConcurrency,
        "number",
        config.danbooru.scan_concurrency,
        1,
        16,
    );
    const deepseekKey = createField(credentialsSection, text.deepseekKey, "password", config.deepseek.api_key);
    deepseekKey.parentElement.classList.add("autocomplete-plus-live-tags-wide");
    if (config.danbooru.api_key_configured) danbooruKey.placeholder = text.configured;
    if (config.deepseek.api_key_configured) deepseekKey.placeholder = text.configured;

    const translationSection = createSection(
        text.translation,
        "autocomplete-plus-live-tags-grid autocomplete-plus-live-tags-translation",
        text.translationDescription,
        "pi-language",
    );
    const model = createField(translationSection, text.model, "text", config.deepseek.model);
    model.parentElement.classList.add("autocomplete-plus-live-tags-model");
    const concurrency = createField(translationSection, text.concurrency, "number", config.deepseek.concurrency, 1, 300);
    const batchSize = createField(translationSection, text.batchSize, "number", config.deepseek.batch_size, 1, 200);
    const retries = createField(translationSection, text.retries, "number", config.deepseek.max_retries, 0, 10);
    const timeout = createField(translationSection, text.timeout, "number", config.deepseek.timeout_seconds, 10, 600);
    const localeValue = createElement("div", "autocomplete-plus-live-tags-locale");
    localeValue.append(createIcon("pi-globe"), createElement("span", "", `${text.locale}: ${locale}`));
    translationSection.append(localeValue);
    const promptDetails = createElement("details", "autocomplete-plus-live-tags-prompt autocomplete-plus-live-tags-wide");
    const promptSummary = document.createElement("summary");
    promptSummary.append(createIcon("pi-sliders-h"), createElement("span", "", text.advanced));
    const promptLabel = createElement("label");
    promptLabel.append(createElement("span", "", text.prompt));
    const prompt = document.createElement("textarea");
    prompt.rows = 5;
    prompt.value = config.deepseek.system_prompt;
    promptLabel.append(prompt);
    promptDetails.append(promptSummary, promptLabel);
    translationSection.append(promptDetails);
    rightColumn.append(translationSection, credentialsSection);
    workspace.append(leftColumn, rightColumn);
    form.append(workspace);

    const actions = createElement("div", "autocomplete-plus-live-tags-actions");
    const secondaryActions = createElement("div", "autocomplete-plus-live-tags-action-group");
    const primaryActions = createElement("div", "autocomplete-plus-live-tags-action-group autocomplete-plus-live-tags-action-group-primary");
    const saveButton = actionButton(text.save, "pi-save", "is-quiet");
    const failedButton = actionButton(text.retryFailed, "pi-replay", "is-quiet");
    const allButton = actionButton(text.retranslate, "pi-refresh", "is-quiet");
    const cancelButton = actionButton(text.cancel, "pi-stop-circle", "is-danger");
    const refreshButton = actionButton(text.refresh, "pi-refresh", "is-accent");
    const scanButton = actionButton(text.scan, "pi-search", "is-primary");
    const translateButton = actionButton(text.translate, "pi-language", "is-primary");
    refreshButton.hidden = true;
    secondaryActions.append(saveButton, failedButton, allButton);
    primaryActions.append(cancelButton, refreshButton, scanButton, translateButton);
    actions.append(secondaryActions, primaryActions);
    form.append(actions);

    const collectConfig = () => ({
        categories: Object.fromEntries(CATEGORY_NAMES.map(category => [category, {
            mode: categoryInputs[category].mode.value,
            threshold: Number(categoryInputs[category].threshold.value),
        }])),
        danbooru: {
            login: danbooruLogin.value,
            api_key: danbooruKey.value,
            scan_concurrency: Number(scanConcurrency.value),
        },
        deepseek: {
            api_key: deepseekKey.value,
            model: model.value,
            system_prompt: prompt.value,
            concurrency: Number(concurrency.value),
            batch_size: Number(batchSize.value),
            max_retries: Number(retries.value),
            timeout_seconds: Number(timeout.value),
        },
    });

    const save = async () => {
        const updated = collectConfig();
        const errors = validateLiveTagsConfig(updated, locale);
        if (errors.length) throw new Error(errors.join("; "));
        config = await requestJson(`${API_ROOT}/config`, { method: "PUT", body: JSON.stringify(updated) });
        danbooruKey.value = config.danbooru.api_key;
        deepseekKey.value = config.deepseek.api_key;
        message.textContent = text.saved;
        taskStatus.dataset.tone = "success";
    };

    const start = async (path, body) => {
        await save();
        const options = { method: "POST" };
        if (body) options.body = JSON.stringify(body);
        await requestJson(`${API_ROOT}/${path}`, options);
        await updateStatus();
        startPolling();
    };

    saveButton.onclick = () => runAction(save, message, locale);
    scanButton.onclick = () => runAction(() => start("scan"), message, locale);
    translateButton.onclick = () => runAction(() => start("translate", { locale, mode: "missing" }), message, locale);
    failedButton.onclick = () => runAction(() => start("translate", { locale, mode: "failed" }), message, locale);
    allButton.onclick = () => runAction(() => start("translate", { locale, mode: "all" }), message, locale);
    cancelButton.onclick = () => runAction(
        () => requestJson(`${API_ROOT}/cancel`, { method: "POST" }).then(updateStatus),
        message,
        locale,
    );
    refreshButton.onclick = () => window.location.reload();

    let pollTimer = null;
    const updateStatus = async () => {
        const status = await requestJson(`${API_ROOT}/status?locale=${encodeURIComponent(locale)}`);
        for (const [key, value] of Object.entries(status.statistics || {})) {
            if (statisticValues[key]) statisticValues[key].textContent = String(value);
        }
        const job = status.job;
        const active = Boolean(status.active);
        const isScanJob = job?.kind === "scan";
        stateBadge.classList.toggle("is-active", active);
        stateBadge.classList.toggle("is-idle", !active);
        stateLabel.textContent = active ? getLocalizedJobState(job, text) : text.idle;
        taskStatus.dataset.active = String(active);
        taskStatus.dataset.hasJob = String(Boolean(job));
        scanButton.disabled = active;
        for (const button of [translateButton, failedButton, allButton]) button.disabled = active || locale === "en";
        cancelButton.disabled = !active;
        if (job) {
            message.textContent = job.error
                ? localizeLiveTagsError(job.error_code, job.error, locale)
                : getLocalizedJobState(job, text);
            jobCounters.textContent = isScanJob
                ? `${text.scanned}: ${job.completed || 0}`
                : [
                    `${text.completed}: ${job.completed || 0}/${job.total || "?"}`,
                    `${text.cached}: ${job.cached || 0}`,
                    `${text.retrying}: ${job.retrying || 0}`,
                    `${text.failed}: ${job.failed || 0}`,
                ].join(" · ");
            progress.hidden = isScanJob;
            if (!isScanJob && job.total > 0) {
                progress.removeAttribute("data-indeterminate");
                progress.value = Math.min((job.completed / job.total) * 100, 100);
            } else if (!isScanJob && active) {
                progress.removeAttribute("value");
                progress.dataset.indeterminate = "true";
            } else if (!isScanJob) {
                progress.value = job.status === "completed" ? 100 : 0;
            }
            if (!active && ["completed", "cancelled"].includes(job.status)) {
                refreshButton.hidden = false;
                message.textContent = `${message.textContent} ${text.refreshHint}`;
                taskStatus.dataset.tone = job.status === "completed" ? "success" : "neutral";
            }
        } else {
            jobCounters.textContent = "";
            progress.hidden = false;
            progress.value = 0;
        }
        if (!active && pollTimer !== null) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
        return status;
    };
    const startPolling = () => {
        if (pollTimer === null) pollTimer = setInterval(() => runAction(updateStatus, message, locale), 500);
    };

    dialog.addEventListener("close", () => {
        if (pollTimer !== null) clearInterval(pollTimer);
        dialog.remove();
    });
    await updateStatus();
    dialog.showModal();
    dialog.focus();
}

function getCurrentLocale(app) {
    const setting = app.extensionManager?.setting?.get?.("Comfy.Locale")
        ?? app.ui?.settings?.getSettingValue?.("Comfy.Locale")
        ?? "en";
    return normalizeLiveTagsLocale(setting);
}

async function requestJson(url, options = {}) {
    const response = await fetch(url, {
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
        ...options,
    });
    let payload;
    try {
        payload = await response.json();
    } catch {
        throw new Error(`HTTP ${response.status}`);
    }
    if (!response.ok) {
        const error = new Error(payload.error || `HTTP ${response.status}`);
        error.errorCode = payload.error_code;
        throw error;
    }
    return payload;
}

async function runAction(action, message, locale) {
    try {
        await action();
    } catch (error) {
        message.textContent = localizeLiveTagsError(error.errorCode, error.message, locale);
    }
}

function createSection(title, extraClass = "", description = "", icon = "") {
    const section = createElement("section", `autocomplete-plus-live-tags-section ${extraClass}`.trim());
    const header = createElement("div", "autocomplete-plus-live-tags-section-header");
    if (icon) header.append(createIcon(icon));
    const copy = createElement("div");
    copy.append(createElement("h3", "", title));
    if (description) copy.append(createElement("p", "", description));
    header.append(copy);
    section.append(header);
    return section;
}

function createDisclosureSection(title, extraClass = "", description = "", icon = "") {
    const section = createElement("details", `autocomplete-plus-live-tags-section autocomplete-plus-live-tags-disclosure ${extraClass}`.trim());
    const header = createElement(
        "summary",
        "autocomplete-plus-live-tags-section-header autocomplete-plus-live-tags-disclosure-summary",
    );
    if (icon) header.append(createIcon(icon));
    const copy = createElement("div");
    copy.append(createElement("h3", "", title));
    if (description) copy.append(createElement("p", "", description));
    header.append(copy);
    section.append(header);
    return section;
}

function createField(parent, labelText, type, value, minimum, maximum) {
    const label = createElement("label");
    label.append(createElement("span", "", labelText));
    const input = document.createElement("input");
    input.type = type;
    input.value = value ?? "";
    if (minimum !== undefined) input.min = String(minimum);
    if (maximum !== undefined) input.max = String(maximum);
    label.append(input);
    parent.append(label);
    return input;
}

function createNumberInput(value, minimum, maximum) {
    const input = document.createElement("input");
    input.type = "number";
    input.value = String(value);
    input.min = String(minimum);
    input.max = String(maximum);
    return input;
}

function actionButton(text, icon = "", className = "") {
    const button = createElement("button", `p-button p-component ${className}`.trim());
    button.type = "button";
    if (icon) button.append(createIcon(icon));
    button.append(createElement("span", "", text));
    return button;
}

function createIcon(name, className = "") {
    const icon = createElement("i", `pi ${name} ${className}`.trim());
    icon.ariaHidden = "true";
    return icon;
}

function createElement(tagName, className = "", textContent = "") {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (textContent) element.textContent = textContent;
    return element;
}
