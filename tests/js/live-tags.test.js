/** @jest-environment jsdom */

import { jest } from "@jest/globals";
import {
    localizeLiveTagsError,
    normalizeLiveTagsLocale,
    openLiveTagsManager,
    validateLiveTagsConfig,
} from "../../web/js/live-tags.js";

function validConfig() {
    return {
        categories: {
            general: { mode: "threshold", threshold: 1000 },
            artist: { mode: "threshold", threshold: 100 },
            unused: { mode: "disabled", threshold: 0 },
            copyright: { mode: "threshold", threshold: 20 },
            character: { mode: "all", threshold: 0 },
            meta: { mode: "threshold", threshold: 100 },
        },
        danbooru: { login: "", api_key: "", scan_concurrency: 8 },
        deepseek: {
            model: "deepseek-v4-flash",
            system_prompt: "Translate tags as JSON",
            concurrency: 300,
            batch_size: 100,
            max_retries: 3,
            timeout_seconds: 180,
        },
    };
}

describe("live tags locale mapping", () => {
    test.each([
        ["zh_CN", "zh"],
        ["zh-Hant", "zh-TW"],
        ["zh-TW", "zh-TW"],
        ["ja-JP", "ja"],
        ["fr-FR", "en"],
    ])("maps %s to %s", (input, expected) => {
        expect(normalizeLiveTagsLocale(input)).toBe(expected);
    });
});

describe("live tags error localization", () => {
    test.each([
        ["en", "Danbooru access was blocked by Cloudflare."],
        ["zh-CN", "Danbooru 访问被 Cloudflare 拦截。"],
        ["zh-TW", "Danbooru 存取被 Cloudflare 阻擋。"],
        ["ja-JP", "Danbooru へのアクセスが Cloudflare にブロックされました。"],
    ])("localizes backend error codes for %s", (locale, expectedStart) => {
        expect(localizeLiveTagsError("danbooru_cloudflare_blocked", "raw error", locale)
            .startsWith(expectedStart)).toBe(true);
    });

    test("preserves unknown backend details", () => {
        expect(localizeLiveTagsError("unknown_error", "SocketError", "zh-CN")).toBe("SocketError");
    });

    test("explains why an old scan cannot resume after category settings change", () => {
        expect(localizeLiveTagsError("scan_config_changed", "raw error", "zh-CN"))
            .toBe("类别筛选设置已变更，请点击“扫描标签”按新设置重新扫描。");
    });

    test("localizes failed jobs created before error codes were added", () => {
        const legacyError = "Danbooru access was blocked by Cloudflare. Configure a Danbooru login and API key.";
        expect(localizeLiveTagsError(null, legacyError, "zh-CN"))
            .toBe("Danbooru 访问被 Cloudflare 拦截。请配置 Danbooru 用户名和 API Key，或更换网络后重试。");
    });
});

describe("live tags configuration validation", () => {
    test("accepts the default configuration", () => {
        expect(validateLiveTagsConfig(validConfig())).toEqual([]);
    });

    test("rejects invalid thresholds and concurrency", () => {
        const config = validConfig();
        config.categories.general.threshold = -1;
        config.deepseek.concurrency = 301;
        config.danbooru.scan_concurrency = 17;
        expect(validateLiveTagsConfig(config)).toEqual(expect.arrayContaining([
            "Invalid threshold for general",
            "concurrency must be between 1 and 300",
            "scan_concurrency must be between 1 and 16",
        ]));
    });

    test("requires model and system prompt", () => {
        const config = validConfig();
        config.deepseek.model = "";
        config.deepseek.system_prompt = "";
        expect(validateLiveTagsConfig(config)).toEqual(expect.arrayContaining([
            "Model cannot be empty",
            "System prompt cannot be empty",
        ]));
    });

    test("localizes validation errors for the current interface language", () => {
        const config = validConfig();
        config.categories.general.threshold = -1;
        config.deepseek.model = "";

        expect(validateLiveTagsConfig(config, "zh-CN")).toEqual(expect.arrayContaining([
            "general（通用） 的最低热度无效",
            "模型不能为空",
        ]));
    });
});

describe("live tags manager UI", () => {
    afterEach(() => {
        document.body.innerHTML = "";
        jest.restoreAllMocks();
    });

    test("shows status and disables translation for an English interface", async () => {
        const config = validConfig();
        config.danbooru = { login: "", api_key: "", scan_concurrency: 8, api_key_configured: false };
        config.deepseek.api_key = "";
        config.deepseek.api_key_configured = false;
        const status = {
            active: false,
            job: null,
            statistics: {
                base_tags: 123,
                candidates: 12,
                translated: 0,
                untranslated: 12,
                estimated_requests: 1,
            },
        };
        global.fetch = jest.fn(async url => ({
            ok: true,
            status: 200,
            json: async () => url.endsWith("/config") ? config : status,
        }));
        if (!HTMLDialogElement.prototype.showModal) {
            HTMLDialogElement.prototype.showModal = jest.fn();
        } else {
            jest.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(() => {});
        }
        const app = { extensionManager: { setting: { get: () => "en" } } };

        await openLiveTagsManager(app);

        const dialog = document.querySelector(".autocomplete-plus-live-tags-dialog");
        expect(dialog).not.toBeNull();
        expect(dialog.textContent).toContain("123");
        const header = dialog.querySelector(".autocomplete-plus-live-tags-header");
        expect(header.querySelector(".autocomplete-plus-live-tags-task-status")).not.toBeNull();
        expect(header.querySelector(".autocomplete-plus-live-tags-overview")).not.toBeNull();
        expect(header.querySelector(".autocomplete-plus-live-tags-identity")).toBeNull();
        expect([...dialog.querySelectorAll(".autocomplete-plus-live-tags-nav-item")]
            .some(button => button.textContent.includes("Overview"))).toBe(false);
        expect([...dialog.querySelectorAll(".autocomplete-plus-live-tags-nav-item")]
            .some(button => button.textContent.includes("Tag browser"))).toBe(true);
        expect([...dialog.querySelectorAll(".autocomplete-plus-live-tags-nav-item")]
            .some(button => button.textContent.includes("Local dictionary"))).toBe(false);
        expect(dialog.querySelector(".autocomplete-plus-live-tags-page.is-active").textContent)
            .toContain("Category filters");
        const translateButton = [...dialog.querySelectorAll("button")]
            .find(button => button.textContent === "Translate missing");
        expect(translateButton.disabled).toBe(true);
    });

    test("adds localized category notes and hides irrelevant thresholds", async () => {
        const config = validConfig();
        config.danbooru = { login: "", api_key: "", scan_concurrency: 8, api_key_configured: false };
        config.deepseek.api_key = "";
        config.deepseek.api_key_configured = false;
        global.fetch = jest.fn(async url => ({
            ok: true,
            status: 200,
            json: async () => url.endsWith("/config") ? config : {
                active: false,
                job: null,
                statistics: {},
            },
        }));
        if (!HTMLDialogElement.prototype.showModal) {
            HTMLDialogElement.prototype.showModal = jest.fn();
        } else {
            jest.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(() => {});
        }
        const app = { extensionManager: { setting: { get: () => "zh-CN" } } };

        await openLiveTagsManager(app);

        const rows = [...document.querySelectorAll(".autocomplete-plus-live-tags-category-row")];
        expect(rows.map(row => row.querySelector("strong").textContent)).toEqual([
            "general（通用）",
            "artist（艺术家）",
            "unused（未使用）",
            "copyright（版权作品）",
            "character（角色）",
            "meta（元标签）",
        ]);
        expect(rows.find(row => row.dataset.mode === "threshold").querySelector("input").hidden).toBe(false);
        expect(rows.find(row => row.dataset.mode === "all").querySelector("input").hidden).toBe(true);
        expect(rows.find(row => row.dataset.mode === "disabled").querySelector("input").hidden).toBe(true);
    });

    test("provides a localized shortcut to Danbooru in credentials", async () => {
        const config = validConfig();
        config.danbooru = { login: "", api_key: "", scan_concurrency: 8, api_key_configured: false };
        config.deepseek.api_key = "";
        config.deepseek.api_key_configured = false;
        global.fetch = jest.fn(async url => ({
            ok: true,
            status: 200,
            json: async () => url.endsWith("/config") ? config : { active: false, job: null, statistics: {} },
        }));
        HTMLDialogElement.prototype.showModal = jest.fn();

        await openLiveTagsManager({ extensionManager: { setting: { get: () => "zh-CN" } } });

        const link = document.querySelector(".autocomplete-plus-live-tags-external-link");
        expect(link.textContent).toContain("打开 Danbooru");
        expect(link.href).toBe("https://danbooru.donmai.us/");
        expect(link.target).toBe("_blank");
        expect(link.rel).toBe("noopener noreferrer");

        const credentialsNavigation = [...document.querySelectorAll(".autocomplete-plus-live-tags-nav-item")]
            .find(button => button.textContent.includes("凭据设置"));
        credentialsNavigation.click();
        const activePage = document.querySelector(".autocomplete-plus-live-tags-page.is-active");
        expect(activePage.textContent).toContain("Danbooru 用户名（可选）");
        expect(activePage.textContent).toContain("DeepSeek API Key");
        const footerButtons = [...document.querySelectorAll(".autocomplete-plus-live-tags-actions button")]
            .filter(button => !button.hidden);
        expect(footerButtons.map(button => button.textContent)).toEqual(["保存设置"]);
    });

    test("shows a scan counter without an unknowable progress maximum", async () => {
        const config = validConfig();
        config.danbooru = { login: "", api_key: "", scan_concurrency: 8, api_key_configured: false };
        config.deepseek.api_key = "";
        config.deepseek.api_key_configured = false;
        global.fetch = jest.fn(async url => ({
            ok: true,
            status: 200,
            json: async () => url.endsWith("/config") ? config : {
                active: true,
                job: { kind: "scan", status: "running", phase: "scanning", completed: 3800, total: 0 },
                statistics: {},
            },
        }));
        HTMLDialogElement.prototype.showModal = jest.fn();

        await openLiveTagsManager({ extensionManager: { setting: { get: () => "zh-CN" } } });

        expect(document.querySelector(".autocomplete-plus-live-tags-job-counters").textContent).toBe("已扫描: 3800");
        expect(document.querySelector(".autocomplete-plus-live-tags-progress").hidden).toBe(true);
    });

    test("does not request another refresh for a job completed before this page loaded", async () => {
        const config = validConfig();
        config.danbooru = { login: "", api_key: "", scan_concurrency: 8, api_key_configured: false };
        config.deepseek.api_key = "";
        config.deepseek.api_key_configured = false;
        global.fetch = jest.fn(async url => ({
            ok: true,
            status: 200,
            json: async () => url.endsWith("/config") ? config : {
                active: false,
                job: { id: 91001, kind: "scan", status: "completed", phase: "completed", completed: 200 },
                statistics: {},
            },
        }));
        HTMLDialogElement.prototype.showModal = jest.fn();

        await openLiveTagsManager({ extensionManager: { setting: { get: () => "zh-CN" } } });

        const dialog = document.querySelector(".autocomplete-plus-live-tags-dialog");
        expect(dialog.querySelector(".autocomplete-plus-live-tags-message").textContent).toBe("已完成");
        expect([...dialog.querySelectorAll("button")]
            .find(button => button.textContent === "刷新页面").hidden).toBe(true);
    });

    test("hides resume and directs the user to rescan when category settings changed", async () => {
        const config = validConfig();
        config.danbooru = { login: "", api_key: "", scan_concurrency: 8, api_key_configured: false };
        config.deepseek.api_key = "";
        config.deepseek.api_key_configured = false;
        global.fetch = jest.fn(async url => ({
            ok: true,
            status: 200,
            json: async () => url.endsWith("/config") ? config : {
                active: false,
                job: { kind: "scan", status: "cancelled", phase: "cancelled", completed: 100 },
                statistics: {},
                resumable: { id: 1, kind: "scan" },
                resumable_config_changed: true,
            },
        }));
        HTMLDialogElement.prototype.showModal = jest.fn();

        await openLiveTagsManager({ extensionManager: { setting: { get: () => "zh-CN" } } });

        const buttons = [...document.querySelectorAll("button")];
        expect(buttons.find(button => button.textContent === "继续任务").hidden).toBe(true);
        expect(buttons.find(button => button.textContent === "扫描标签").hidden).toBe(false);
        expect(document.querySelector(".autocomplete-plus-live-tags-message").textContent)
            .toBe("类别筛选设置已变更，请点击“扫描标签”按新设置重新扫描。");
    });
});
