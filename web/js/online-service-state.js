const DEFAULT_FEATURES = Object.freeze({
    danbooru_completion: true,
    translation: true,
});

let featureFlags = { ...DEFAULT_FEATURES };
let featureLoadPromise = null;

const FEATURE_LOAD_RETRY_DELAYS_MS = [250, 500];

function waitForRetry(delay) {
    return new Promise(resolve => setTimeout(resolve, delay));
}

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

export function loadOnlineServiceFeatures(fetchImpl = fetch) {
    if (featureLoadPromise) return featureLoadPromise;

    featureLoadPromise = (async () => {
        for (let attempt = 0; attempt <= FEATURE_LOAD_RETRY_DELAYS_MS.length; attempt++) {
            try {
                const response = await fetchImpl("/autocomplete-plus/translation/config", { cache: "no-store" });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const config = await response.json();
                return updateOnlineServiceFeatures(config.features);
            } catch {
                if (attempt < FEATURE_LOAD_RETRY_DELAYS_MS.length) {
                    await waitForRetry(FEATURE_LOAD_RETRY_DELAYS_MS[attempt]);
                }
            }
        }
        return getOnlineServiceFeatures();
    })().finally(() => {
        featureLoadPromise = null;
    });

    return featureLoadPromise;
}

export function waitForOnlineServiceFeatures() {
    return featureLoadPromise || Promise.resolve(getOnlineServiceFeatures());
}

export const __test__ = { DEFAULT_FEATURES };
