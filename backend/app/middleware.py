"""Bound actual request bytes, including requests without Content-Length."""

from fastapi.responses import JSONResponse


class BodySizeLimitMiddleware:
    def __init__(self, app, max_bytes=5_100_000):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] not in {"POST", "PUT", "PATCH"}:
            await self.app(scope, receive, send)
            return
        messages = []
        size = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            size += len(message.get("body", b""))
            if size > self.max_bytes:
                response = JSONResponse({"detail": "Request exceeds 5 MB limit"}, status_code=413)
                await response(scope, receive, send)
                return
            messages.append(message)
            if not message.get("more_body", False):
                break
        # Replay only the bounded body. Subsequent disconnect observations still
        # reach the original ASGI receive channel.
        iterator = iter(messages)

        async def bounded_receive():
            try:
                return next(iterator)
            except StopIteration:
                return await receive()

        await self.app(scope, bounded_receive, send)
