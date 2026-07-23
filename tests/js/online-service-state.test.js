import { jest } from '@jest/globals';
import {
    getOnlineServiceFeatures,
    loadOnlineServiceFeatures,
    updateOnlineServiceFeatures,
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

    test('keeps safe enabled defaults when configuration cannot be loaded', async () => {
        const fetchImpl = jest.fn().mockRejectedValue(new Error('offline'));

        await loadOnlineServiceFeatures(fetchImpl);

        expect(getOnlineServiceFeatures()).toEqual({
            danbooru_completion: true,
            translation: true,
        });
    });
});
