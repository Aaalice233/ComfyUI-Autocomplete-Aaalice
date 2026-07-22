function normalizeComparableText(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/^<lora:/, '')
        .replace(/^emb(?:edding)?:/, '')
        .replace(/>$/, '');
}

function compactComparableText(value) {
    return normalizeComparableText(value).replace(/[-_\s']/g, '');
}

function getTextMatchType(value, queryVariations) {
    const target = normalizeComparableText(value);
    const compactTarget = compactComparableText(target);
    let contains = false;
    let prefix = false;

    for (const queryValue of queryVariations) {
        const query = normalizeComparableText(queryValue);
        if (!query) continue;
        if (target === query) return 'exact';

        const compactQuery = compactComparableText(query);
        if (target.startsWith(query) || (compactQuery && compactTarget.startsWith(compactQuery))) {
            prefix = true;
        } else if (target.includes(query) || (compactQuery && compactTarget.includes(compactQuery))) {
            contains = true;
        }
    }

    if (prefix) return 'prefix';
    if (contains) return 'contains';
    return 'none';
}

export function getCandidateMatchTier(candidate, queryVariations) {
    const tagMatch = getTextMatchType(candidate?.tag, queryVariations);
    if (tagMatch === 'exact') return 5;
    if (tagMatch === 'prefix') return 4;

    const aliases = Array.isArray(candidate?.alias) ? candidate.alias : [];
    if (aliases.some(alias => getTextMatchType(alias, queryVariations) === 'exact')) return 3;
    if (tagMatch === 'contains') return 2;
    if (aliases.some(alias => ['prefix', 'contains'].includes(getTextMatchType(alias, queryVariations)))) return 1;
    return 0;
}

export function getNormalizedPopularity(candidate, sourceMaxCounts = {}) {
    const count = Math.max(0, Number(candidate?.count) || 0);
    const sourceMaximum = Math.max(count, Number(sourceMaxCounts[candidate?.source]) || 0);
    if (count <= 0 || sourceMaximum <= 0) return 0;
    return Math.log1p(count) / Math.log1p(sourceMaximum);
}

function mergeDuplicateCandidate(primary, duplicate) {
    const primaryAliases = Array.isArray(primary.alias) ? primary.alias : [];
    const duplicateAliases = Array.isArray(duplicate.alias) ? duplicate.alias : [];
    const aliases = [...new Set([...primaryAliases, ...duplicateAliases].filter(Boolean))];
    const sameSource = primary.source === duplicate.source;
    const count = sameSource ? Math.max(Number(primary.count) || 0, Number(duplicate.count) || 0) : primary.count;
    if (aliases.length === primaryAliases.length && count === primary.count) return primary;

    return Object.assign(Object.create(Object.getPrototypeOf(primary)), primary, {
        alias: aliases,
        count,
    });
}

export function mergeDuplicateCandidates(candidates) {
    const merged = [];
    const indexByTag = new Map();
    for (const candidate of candidates) {
        const key = normalizeComparableText(candidate?.tag);
        if (!key) continue;
        const existingIndex = indexByTag.get(key);
        if (existingIndex === undefined) {
            indexByTag.set(key, merged.length);
            merged.push(candidate);
        } else {
            merged[existingIndex] = mergeDuplicateCandidate(merged[existingIndex], candidate);
        }
    }
    return merged;
}

export function rankCompletionCandidates(candidates, queryVariations, options = {}) {
    const {
        limit = 10,
        sourcePriority = [],
        sourceMaxCounts = {},
    } = options;
    const sourceRanks = new Map(sourcePriority.map((source, index) => [source, index]));

    return mergeDuplicateCandidates(candidates)
        .map((candidate, originalIndex) => ({
            candidate,
            originalIndex,
            matchTier: getCandidateMatchTier(candidate, queryVariations),
            popularity: getNormalizedPopularity(candidate, sourceMaxCounts),
            sourceRank: sourceRanks.get(candidate.source) ?? sourcePriority.length,
        }))
        .sort((a, b) =>
            b.matchTier - a.matchTier
            || b.popularity - a.popularity
            || a.sourceRank - b.sourceRank
            || String(a.candidate.tag).localeCompare(String(b.candidate.tag))
            || a.originalIndex - b.originalIndex)
        .slice(0, limit)
        .map(item => item.candidate);
}
