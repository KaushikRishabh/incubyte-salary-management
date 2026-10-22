"""Bound actual upload bytes, independently of a missing/dishonest length header.

The API parses JSON/CSV as a whole, so buffering one bounded body is intentional.
This protects application memory from large request bodies, not slow clients or
unlimited simultaneous connections; those require a production reverse proxy.
"""

from fastapi.responses import JSONResponse

# Slightly above the CSV text limit to allow the surrounding JSON envelope.
MAX_BODY_BYTES = 5_100_000


class BodySizeLimitMiddleware:
    """ASGI wrapper that never forwards an incomplete or over-budget write body."""

    def __init__(self, app, max_bytes=MAX_BODY_BYTES):
        """Capture the downstream ASGI app and an injectable budget for tests."""
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        """Consume upload chunks first, then replay their bytes exactly once."""
        if scope["type"] != "http" or scope["method"] not in {"POST", "PUT", "PATCH"}:
            await self.app(scope, receive, send)
            return
        # One byte buffer prevents millions of tiny ASGI chunks from creating
        # millions of retained message dictionaries within an otherwise small body.
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            if len(body) + len(chunk) > self.max_bytes:
                response = JSONResponse({"detail": "Request exceeds 5 MB limit"}, status_code=413)
                await response(scope, receive, send)
                return
            body.extend(chunk)
            if not message.get("more_body", False):
                break
        # ASGI consumers care about the concatenated body, not original chunk
        # boundaries. Subsequent disconnect observations still use real receive.
        replayed = False

        async def bounded_receive():
            """Deliver the validated body once, then preserve disconnect behavior."""
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        await self.app(scope, bounded_receive, send)
