import { ModelTagSource, TagData, TagSource } from "../data.js";

const CACHE_TTL_MS = 5_000;
const RETRY_DELAY_MS = 30_000;
const cache = new Map();
let unavailableUntil = 0;
let hasLoggedUnavailable = false;

function resetState() {
    cache.clear();
    unavailableUntil = 0;
    hasLoggedUnavailable = false;
}

const CATEGORY_MAP = {
    0: [TagSource.Danbooru, 0],
    1: [TagSource.Danbooru, 1],
    3: [TagSource.Danbooru, 3],
    4: [TagSource.Danbooru, 4],
    5: [TagSource.Danbooru, 5],
    7: [TagSource.E621, 0],
    8: [TagSource.E621, 1],
    9: [TagSource.E621, 2],
    10: [TagSource.E621, 3],
    11: [TagSource.E621, 4],
    12: [TagSource.E621, 5],
    14: [TagSource.E621, 7],
    15: [TagSource.E621, 8],
};

function stripModelExtension(path) {
    return String(path || "").replace(/\.(safetensors|ckpt|pt|bin)$/i, "");
}

function describeRequest(partialTag, tagSource) {
    const trimmed = String(partialTag || "").trim();
    const loraMatch = trimmed.match(/^<lora:(.*)$/i);
    if (loraMatch) return { kind: "loras", search: loraMatch[1] };

    const embeddingMatch = trimmed.match(/^(?:embedding|emb):(.*)$/i);
    if (embeddingMatch) return { kind: "embeddings", search: embeddingMatch[1] };

    if (trimmed.startsWith("__")) {
        return { kind: "wildcards", search: trimmed.replace(/^__/, "").replace(/__$/, "") };
    }

    const category = tagSource === TagSource.Danbooru
        ? "0,1,3,4,5"
        : tagSource === TagSource.E621 ? "7,8,9,10,11,12,14,15" : "";
    return { kind: "tags", search: trimmed, category };
}

function createUrl(descriptor, limit) {
    const params = new URLSearchParams({ search: descriptor.search, limit: String(limit) });
    if (descriptor.kind === "tags") {
        params.set("enriched", "true");
        if (descriptor.category) params.set("category", descriptor.category);
        return `/api/lm/custom-words/search?${params}`;
    }
    if (descriptor.kind === "wildcards") return `/api/lm/wildcards/search?${params}`;
    return `/api/lm/${descriptor.kind}/relative-paths?${params}`;
}

function mapResults(descriptor, payload) {
    if (descriptor.kind === "tags") {
        return (Array.isArray(payload.words) ? payload.words : []).flatMap(item => {
            const mappedCategory = CATEGORY_MAP[item.category];
            if (!mappedCategory || !item.tag_name) return [];
            const aliases = item.matched_alias ? [item.matched_alias] : [];
            return [new TagData(item.tag_name, mappedCategory[1], Number(item.post_count) || 0, aliases, mappedCategory[0])];
        });
    }

    if (descriptor.kind === "wildcards") {
        return (Array.isArray(payload.words) ? payload.words : [])
            .filter(Boolean)
            .map(item => new TagData(`__${String(item).trim()}__`, 0, 0, [], ModelTagSource.Wildcard));
    }

    const paths = Array.isArray(payload.relative_paths) ? payload.relative_paths : [];
    return paths.filter(Boolean).map(path => {
        const normalized = stripModelExtension(path);
        if (descriptor.kind === "loras") {
            return new TagData(`<lora:${normalized}>`, 0, 0, [], ModelTagSource.Lora);
        }
        return new TagData(`embedding:${normalized}`, 0, 0, [], ModelTagSource.Embeddings);
    });
}

export function mergeSupplementalCandidates(primary, supplemental, limit) {
    const merged = [];
    const seen = new Set();
    for (const candidate of [...primary, ...supplemental]) {
        const key = String(candidate?.tag || "").toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        merged.push(candidate);
        if (merged.length >= limit) break;
    }
    return merged;
}

export async function searchLoraManagerCandidates(partialTag, options = {}) {
    const {
        limit = 20,
        mode = "auto",
        tagSource = "all",
        includeModels = true,
        fetchImpl = fetch,
        signal,
    } = options;
    if (mode === "disabled" || !partialTag || Date.now() < unavailableUntil) return [];

    const descriptor = describeRequest(partialTag, tagSource);
    if (!descriptor.search) return [];
    if (!includeModels && ["loras", "embeddings"].includes(descriptor.kind)) return [];
    const url = createUrl(descriptor, Math.min(Math.max(limit, 1), 100));
    const cached = cache.get(url);
    if (cached && cached.expiresAt > Date.now()) return cached.results;

    try {
        const response = await fetchImpl(url, { cache: "no-store", signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        if (payload.success !== true) throw new Error(payload.error || "Invalid LoRA Manager response");
        const results = mapResults(descriptor, payload);
        cache.set(url, { expiresAt: Date.now() + CACHE_TTL_MS, results });
        unavailableUntil = 0;
        hasLoggedUnavailable = false;
        return results;
    } catch (error) {
        if (error?.name === "AbortError") return [];
        unavailableUntil = Date.now() + RETRY_DELAY_MS;
        if (!hasLoggedUnavailable) {
            const log = mode === "enabled" ? console.warn : console.debug;
            log("[Autocomplete-Plus] LoRA Manager integration is temporarily unavailable:", error.message);
            hasLoggedUnavailable = true;
        }
        return [];
    }
}

export function isExplicitLoraManagerQuery(partialTag) {
    return describeRequest(partialTag, "all").kind !== "tags";
}

export const __test__ = {
    createUrl,
    describeRequest,
    mapResults,
    resetState,
    stripModelExtension,
};
