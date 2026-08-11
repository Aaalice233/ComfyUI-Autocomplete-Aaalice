import time
import unittest

try:
    from modules.danbooru_service import DanbooruHttpProvider
except ModuleNotFoundError as error:
    DanbooruHttpProvider = None
    DANBOORU_IMPORT_ERROR = error
else:
    DANBOORU_IMPORT_ERROR = None


class ImmediateRateLimiter:
    async def acquire(self):
        return None


class FakeResponse:
    def __init__(self, status, payload=None, headers=None):
        self.status = status
        self.payload = payload
        self.headers = headers or {}

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return None

    async def json(self):
        return self.payload


class FakeSession:
    def __init__(self, response):
        self.response = response
        self.params = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return None

    def get(self, _url, params, headers):
        self.params = params
        return self.response


@unittest.skipIf(DanbooruHttpProvider is None, f"Danbooru dependencies unavailable: {DANBOORU_IMPORT_ERROR}")
class DanbooruHttpProviderTests(unittest.IsolatedAsyncioTestCase):
    def provider(self, responses, **options):
        sessions = []

        def session_factory(**kwargs):
            session = FakeSession(responses.pop(0))
            session.options = kwargs
            sessions.append(session)
            return session

        provider = DanbooruHttpProvider(
            session_factory=session_factory,
            rate_limiter=ImmediateRateLimiter(),
            retry_delay_seconds=0,
            **options,
        )
        return provider, sessions

    async def test_retries_transient_upstream_failure_before_succeeding(self):
        provider, sessions = self.provider([
            FakeResponse(503),
            FakeResponse(200, {"results": []}),
        ])

        result = await provider.request_json("https://example.test/tags", {})

        self.assertEqual(result, {"results": []})
        self.assertEqual(len(sessions), 2)

    async def test_uses_environment_proxy_settings(self):
        provider, sessions = self.provider([FakeResponse(200, {"results": []})])

        await provider.request_json("https://example.test/tags", {})

        self.assertIs(sessions[0].options["trust_env"], True)

    async def test_stops_after_eight_total_attempts_by_default(self):
        provider, sessions = self.provider([FakeResponse(503) for _ in range(8)])

        with self.assertRaisesRegex(RuntimeError, "HTTP 503"):
            await provider.request_json("https://example.test/tags", {})

        self.assertEqual(len(sessions), 8)

    async def test_does_not_retry_permanent_upstream_failure(self):
        provider, sessions = self.provider([FakeResponse(404)], max_attempts=3)

        with self.assertRaisesRegex(RuntimeError, "HTTP 404"):
            await provider.request_json("https://example.test/tags", {})

        self.assertEqual(len(sessions), 1)

    async def test_manual_refresh_bypasses_failure_cooldown(self):
        provider, sessions = self.provider([FakeResponse(200, {"results": []})])
        provider._unavailable_until = time.monotonic() + 60

        with self.assertRaisesRegex(RuntimeError, "cooling down"):
            await provider.request_json("https://example.test/tags", {})

        result = await provider.request_json(
            "https://example.test/tags",
            {},
            bypass_cooldown=True,
        )

        self.assertEqual(result, {"results": []})
        self.assertEqual(len(sessions), 1)


if __name__ == "__main__":
    unittest.main()
