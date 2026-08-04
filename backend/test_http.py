import json
import threading
import urllib.request
import zipfile
from io import BytesIO
from unittest.mock import patch

import server as server_module
from server import Handler, ThreadingHTTPServer


payload = {
    "noteId": "http-test",
    "term": "fork",
    "explanation": "One piece attacks two targets.",
    "deckName": "chess-test",
    "normal": True,
    "reversed": True,
    "diagramMode": "still",
    "orientation": "white",
    "boardTheme": "graphite",
    "pieceStyle": "clean",
    "frames": [{"id": "one", "label": "Fork", "position": {"e5": "wN", "c6": "bK", "f7": "bQ"}, "arrows": []}],
    "stillDataUrl": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLZAAAAAElFTkSuQmCC",
}


class FakeServer:
    pass


fake_server = FakeServer()
with patch.object(server_module, "PAGE_CLOSE_GRACE_SECONDS", 0), patch.object(server_module, "stop_server") as stop_server:
    server_module.stop_server_if_page_stays_closed(fake_server, 1.0)
    stop_server.assert_called_once_with(fake_server)

server_module.mark_page_active(fake_server)
with patch.object(server_module, "PAGE_CLOSE_GRACE_SECONDS", 0), patch.object(server_module, "stop_server") as stop_server:
    server_module.stop_server_if_page_stays_closed(fake_server, 0.0)
    stop_server.assert_not_called()

server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
base = f"http://127.0.0.1:{server.server_port}"
try:
    with urllib.request.urlopen(base + "/api/health", timeout=3) as response:
        assert json.load(response) == {"ok": True}
    request = urllib.request.Request(
        base + "/api/export",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        content = response.read()
        assert response.headers["Content-Disposition"] == 'attachment; filename="Chess_fork.apkg"'
    with zipfile.ZipFile(BytesIO(content)) as package:
        assert "collection.anki2" in package.namelist()
        assert "media" in package.namelist()
finally:
    server.shutdown()
    server.server_close()
    thread.join(timeout=3)

print("http export test passed")
