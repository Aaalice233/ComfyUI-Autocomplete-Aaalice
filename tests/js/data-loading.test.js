import { jest } from '@jest/globals';
import {
    __test__,
    autoCompleteData,
    DATA_READY_EVENT,
    DATA_STATUS_CHANGED_EVENT,
    DATA_TAGS_COMPLETE_EVENT,
    DATA_TAGS_READY_EVENT,
    getDataLoadStatus,
    getDataSourceStatus,
    loadDataAsync,
    ModelTagSource,
    TagSource,
} from '../../web/js/data.js';

function createResponse(payload, { ok = true, status = 200, statusText = 'OK' } = {}) {
    return {
        ok,
        status,
        statusText,
        json: async () => payload,
        text: async () => payload,
    };
}

function mockDataEndpoints({ cooccurrence = 'tag_a,tag_b,count\n1girl,blue_hair,5\n' } = {}) {
    global.fetch = jest.fn(url => {
        if (url === '/autocomplete-plus/csv') {
            return Promise.resolve(createResponse({
                [TagSource.Danbooru]: {
                    base_tags: true,
                    extra_tags: [],
                    base_cooccurrence: true,
                    extra_cooccurrence: [],
                },
                [TagSource.E621]: {
                    base_tags: false,
                    extra_tags: [],
                    base_cooccurrence: false,
                    extra_cooccurrence: [],
                },
            }));
        }
        if (url === '/autocomplete-plus/csv/danbooru/tags/base') {
            return Promise.resolve(createResponse(
                'tag,category,count,alias\n1girl,0,100,one girl\nblue_hair,0,50,\n',
            ));
        }
        if (url === '/autocomplete-plus/csv/danbooru/tags_cooccurrence/base') {
            return Promise.resolve(createResponse(cooccurrence));
        }
        if (url === '/autocomplete-plus/embeddings' || url === '/autocomplete-plus/loras') {
            return Promise.resolve(createResponse([]));
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
    });
}

describe('background data loading', () => {
    beforeEach(() => {
        __test__.resetDataLoadingState();
        jest.restoreAllMocks();
        global.window = new EventTarget();
    });

    test('creates safe empty sources before the CSV index is ready', () => {
        expect(autoCompleteData[TagSource.Danbooru].tagMap).toBeInstanceOf(Map);
        expect(autoCompleteData[TagSource.Danbooru].initialized).toBe(false);
        expect(autoCompleteData[ModelTagSource.Wildcard].initialized).toBe(true);
    });

    test('shares one promise and publishes readiness after background loading', async () => {
        mockDataEndpoints();
        const events = [];
        const record = event => events.push(event.type);
        window.addEventListener(DATA_STATUS_CHANGED_EVENT, record);
        window.addEventListener(DATA_TAGS_READY_EVENT, record);
        window.addEventListener(DATA_TAGS_COMPLETE_EVENT, record);
        window.addEventListener(DATA_READY_EVENT, record);

        const first = loadDataAsync();
        const second = loadDataAsync();
        expect(second).toBe(first);
        expect(getDataLoadStatus().state).toBe('loading');

        await first;

        expect(getDataLoadStatus().state).toBe('ready');
        expect(getDataSourceStatus(TagSource.Danbooru).state).toBe('ready');
        expect(autoCompleteData[TagSource.Danbooru].tagMap.has('1girl')).toBe(true);
        expect(events).toContain(DATA_TAGS_READY_EVENT);
        expect(events).toContain(DATA_TAGS_COMPLETE_EVENT);
        expect(events).toContain(DATA_READY_EVENT);

        window.removeEventListener(DATA_STATUS_CHANGED_EVENT, record);
        window.removeEventListener(DATA_TAGS_READY_EVENT, record);
        window.removeEventListener(DATA_TAGS_COMPLETE_EVENT, record);
        window.removeEventListener(DATA_READY_EVENT, record);
    });

    test('publishes tag readiness before co-occurrence processing completes', async () => {
        let releaseCooccurrence;
        const cooccurrenceResponse = new Promise(resolve => {
            releaseCooccurrence = () => resolve(createResponse('tag_a,tag_b,count\\n1girl,blue_hair,5\\n'));
        });
        global.fetch = jest.fn(url => {
            if (url === '/autocomplete-plus/csv') {
                return Promise.resolve(createResponse({
                    [TagSource.Danbooru]: {
                        base_tags: true,
                        extra_tags: [],
                        base_cooccurrence: true,
                        extra_cooccurrence: [],
                    },
                    [TagSource.E621]: {
                        base_tags: false,
                        extra_tags: [],
                        base_cooccurrence: false,
                        extra_cooccurrence: [],
                    },
                }));
            }
            if (url === '/autocomplete-plus/csv/danbooru/tags/base') {
                return Promise.resolve(createResponse(
                    'tag,category,count,alias\\n1girl,0,100,one girl\\n',
                ));
            }
            if (url === '/autocomplete-plus/csv/danbooru/tags_cooccurrence/base') {
                return cooccurrenceResponse;
            }
            if (url === '/autocomplete-plus/embeddings' || url === '/autocomplete-plus/loras') {
                return Promise.resolve(createResponse([]));
            }
            throw new Error(`Unexpected fetch URL: ${url}`);
        });

        const danbooruTagsReady = new Promise(resolve => {
            const check = () => {
                if (autoCompleteData[TagSource.Danbooru].tagsInitialized) {
                    window.removeEventListener(DATA_TAGS_READY_EVENT, check);
                    resolve();
                }
            };
            window.addEventListener(DATA_TAGS_READY_EVENT, check);
        });
        const allTagsReady = new Promise(resolve => {
            window.addEventListener(DATA_TAGS_COMPLETE_EVENT, resolve, { once: true });
        });
        const loading = loadDataAsync();

        await danbooruTagsReady;
        await allTagsReady;
        expect(autoCompleteData[TagSource.Danbooru].tagsInitialized).toBe(true);
        expect(autoCompleteData[TagSource.Danbooru].cooccurrenceInitialized).toBe(false);
        expect(autoCompleteData[TagSource.Danbooru].initialized).toBe(false);
        expect(getDataSourceStatus(TagSource.Danbooru).state).toBe('loading');

        releaseCooccurrence();
        await loading;
        expect(getDataSourceStatus(TagSource.Danbooru).state).toBe('ready');
    });

    test('marks a failed CSV request and permits an explicit retry', async () => {
        let shouldFail = true;
        global.fetch = jest.fn(url => {
            if (url === '/autocomplete-plus/csv' && shouldFail) {
                shouldFail = false;
                return Promise.resolve(createResponse({}, { ok: false, status: 503, statusText: 'Unavailable' }));
            }
            if (url === '/autocomplete-plus/csv') {
                shouldFail = false;
                return Promise.resolve(createResponse({
                    [TagSource.Danbooru]: {
                        base_tags: false,
                        extra_tags: [],
                        base_cooccurrence: false,
                        extra_cooccurrence: [],
                    },
                    [TagSource.E621]: {
                        base_tags: false,
                        extra_tags: [],
                        base_cooccurrence: false,
                        extra_cooccurrence: [],
                    },
                }));
            }
            if (url === '/autocomplete-plus/embeddings' || url === '/autocomplete-plus/loras') {
                return Promise.resolve(createResponse([]));
            }
            throw new Error(`Unexpected fetch URL: ${url}`);
        });

        await expect(loadDataAsync()).rejects.toThrow('503');
        expect(getDataLoadStatus().state).toBe('error');
        expect(getDataSourceStatus(TagSource.Danbooru).state).toBe('error');

        await loadDataAsync({ retry: true });
        expect(getDataLoadStatus().state).toBe('ready');
        expect(getDataSourceStatus(TagSource.Danbooru).state).toBe('ready');
    });
});
