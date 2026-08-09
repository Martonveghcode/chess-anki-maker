import json
import tempfile
import threading
import urllib.request
import zipfile
from io import BytesIO
from pathlib import Path
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

line_data_folder = tempfile.TemporaryDirectory()
server_module.LINES_PATH = Path(line_data_folder.name) / "lines.json"
server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
base = f"http://127.0.0.1:{server.server_port}"
try:
    with urllib.request.urlopen(base + "/api/health", timeout=3) as response:
        assert json.load(response) == {"ok": True}
    with urllib.request.urlopen(base + "/api/lines", timeout=3) as response:
        assert json.load(response)["library"] == {"version": 1, "folders": [], "lines": []}
    line_library = {
        "version": 1,
        "folders": [{"id": "openings", "name": "Openings", "collapsed": False, "createdAt": "2026-08-08T10:00:00Z"}],
        "lines": [{
            "id": "italian",
            "name": "Italian Game",
            "explanation": "Develop quickly.",
            "folderId": "openings",
            "orientation": "white",
            "boardTheme": "walnut",
            "pieceStyle": "classic",
            "createdAt": "2026-08-08T10:00:00Z",
            "updatedAt": "2026-08-08T10:00:00Z",
            "frames": [
                {"id": "start", "label": "Start", "position": {"e2": "wP", "e7": "bP"}, "arrows": []},
                {"id": "e4", "label": "1. e4", "position": {"e4": "wP", "e7": "bP"}, "arrows": [], "move": {"from": "e2", "to": "e4", "color": "w", "piece": "wP"}},
            ],
        }],
    }
    save_lines_request = urllib.request.Request(
        base + "/api/lines",
        data=json.dumps({"library": line_library}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(save_lines_request, timeout=3) as response:
        saved_library = json.load(response)["library"]
        assert saved_library["folders"][0]["name"] == "Openings"
        assert saved_library["lines"][0]["folderId"] == "openings"
    assert json.loads(server_module.LINES_PATH.read_text(encoding="utf-8"))["lines"][0]["name"] == "Italian Game"
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
    line_data_folder.cleanup()

print("http export test passed")
