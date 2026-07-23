const DEFAULT_FEATURES = Object.freeze({
    danbooru_completion: true,
    translation: true,
});

let featureFlags = { ...DEFAULT_FEATURES };

export function updateOnlineServiceFeatures(features = {}) {
    featureFlags = {
        danbooru_completion: features.danbooru_completion !== false,
        translation: features.translation !== false,
    };
    return getOnlineServiceFeatures();
}

export function getOnlineServiceFeatures() {
    return { ...featureFlags };
}

export function isDanbooruCompletionEnabled() {
    return featureFlags.danbooru_completion;
}

export function isTranslationEnabled() {
    return featureFlags.translation;
}

export async function loadOnlineServiceFeatures(fetchImpl = fetch) {
    try {
        const response = await fetchImpl("/autocomplete-plus/translation/config", { cache: "no-store" });
        if (!response.ok) return getOnlineServiceFeatures();
        const config = await response.json();
        return updateOnlineServiceFeatures(config.features);
    } catch {
        return getOnlineServiceFeatures();
    }
}

export const __test__ = { DEFAULT_FEATURES };
