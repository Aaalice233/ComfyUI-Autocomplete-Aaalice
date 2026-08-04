import { jest } from '@jest/globals';
import {
    getOnlineServiceFeatures,
    loadOnlineServiceFeatures,
    updateOnlineServiceFeatures,
    waitForOnlineServiceFeatures,
} from '../../web/js/online-service-state.js';

describe('online service runtime state', () => {
    beforeEach(() => updateOnlineServiceFeatures({
        danbooru_completion: true,
        translation: true,
    }));

    test('loads independently persisted feature switches', async () => {
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                features: { danbooru_completion: false, translation: true },
            }),
        });

        await loadOnlineServiceFeatures(fetchImpl);

        expect(getOnlineServiceFeatures()).toEqual({
            danbooru_completion: false,
            translation: true,
        });
    });

    test('shares the in-flight configuration load with the first online query', async () => {
        let resolveConfig;
        const fetchImpl = jest.fn(() => new Promise(resolve => {
            resolveConfig = resolve;
        }));

        const loading = loadOnlineServiceFeatures(fetchImpl);
        const waiting = waitForOnlineServiceFeatures();
        expect(fetchImpl).toHaveBeenCalledTimes(1);

        resolveConfig({
            ok: true,
            json: async () => ({ features: { danbooru_completion: false, translation: true } }),
        });
        await Promise.all([loading, waiting]);

        expect(getOnlineServiceFeatures().danbooru_completion).toBe(false);
    });

    test('retries a temporary configuration failure before applying the response', async () => {
        const fetchImpl = jest.fn()
            .mockRejectedValueOnce(new Error('temporary offline'))
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    features: { danbooru_completion: false, translation: true },
                }),
            });

        await loadOnlineServiceFeatures(fetchImpl);

        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(getOnlineServiceFeatures()).toEqual({
            danbooru_completion: false,
            translation: true,
        });
    });

    test('keeps safe enabled defaults when configuration cannot be loaded', async () => {
        const fetchImpl = jest.fn().mockRejectedValue(new Error('offline'));

        await loadOnlineServiceFeatures(fetchImpl);

        expect(getOnlineServiceFeatures()).toEqual({
            danbooru_completion: true,
            translation: true,
        });
    });
});
