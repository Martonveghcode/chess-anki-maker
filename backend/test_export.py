import json
import sqlite3
import tempfile
import zipfile
from pathlib import Path

from server import genanki, make_package


position = {"e5": "wP", "d5": "bP", "e1": "wK", "e8": "bK"}
payload = {
    "noteId": "test-note",
    "term": "en passant",
    "explanation": "A special pawn capture.",
    "deckName": "chess-test",
    "normal": True,
    "reversed": True,
    "diagramMode": "interactive",
    "orientation": "white",
    "boardTheme": "walnut",
    "pieceStyle": "classic",
    "frames": [
        {"id": "one", "label": "Before", "position": position, "arrows": []},
        {
            "id": "two",
            "label": "e5 × d6 e.p.",
            "position": {"d6": "wP", "e1": "wK", "e8": "bK"},
            "arrows": [{"id": "a", "from": "e5", "to": "d6", "color": "#e7b64a", "width": 8}],
        },
    ],
    "stillDataUrl": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLZAAAAAElFTkSuQmCC",
}

content, filename = make_package(payload)
assert filename == "Chess_en_passant.apkg"
with tempfile.TemporaryDirectory() as folder:
    package = Path(folder) / filename
    package.write_bytes(content)
    with zipfile.ZipFile(package) as archive:
        media = json.loads(archive.read("media"))
        media_names = sorted(media.values())
        assert len(media_names) == 1
        assert media_names[0].startswith("cam_") and media_names[0].endswith("_preview.png")
        database = Path(folder) / "collection.anki2"
        database.write_bytes(archive.read("collection.anki2"))
    connection = sqlite3.connect(database)
    try:
        assert connection.execute("select count(*) from notes").fetchone()[0] == 1
        assert connection.execute("select count(*) from cards").fetchone()[0] == 2
        fields = connection.execute("select flds from notes").fetchone()[0].split("\x1f")
        assert fields[0] == "en passant"
        assert fields[2]
    finally:
        connection.close()

print("export test passed")


start = {
    "a1": "wR", "b1": "wN", "c1": "wB", "d1": "wQ", "e1": "wK", "f1": "wB", "g1": "wN", "h1": "wR",
    "a2": "wP", "b2": "wP", "c2": "wP", "d2": "wP", "e2": "wP", "f2": "wP", "g2": "wP", "h2": "wP",
    "a7": "bP", "b7": "bP", "c7": "bP", "d7": "bP", "e7": "bP", "f7": "bP", "g7": "bP", "h7": "bP",
    "a8": "bR", "b8": "bN", "c8": "bB", "d8": "bQ", "e8": "bK", "f8": "bB", "g8": "bN", "h8": "bR",
}
after_e4 = {**start, "e4": "wP"}
del after_e4["e2"]
after_e5 = {**after_e4, "e5": "bP"}
del after_e5["e7"]
after_nf3 = {**after_e5, "f3": "wN"}
del after_nf3["g1"]
trainer_payload = {
    "noteId": "trainer-test-note",
    "term": "Ruy Lopez",
    "explanation": "Control the centre, develop, then pressure the e5 pawn.",
    "deckName": "chess-test",
    "cardMode": "trainer",
    "orientation": "white",
    "boardTheme": "ice",
    "pieceStyle": "staunton",
    "frames": [
        {"id": "start", "label": "Start", "position": start, "arrows": []},
        {"id": "e4", "label": "1. e2 → e4", "position": after_e4, "arrows": [], "move": {"from": "e2", "to": "e4", "color": "w", "piece": "wP"}},
        {"id": "e5", "label": "1... e7 → e5", "position": after_e5, "arrows": [], "move": {"from": "e7", "to": "e5", "color": "b", "piece": "bP"}},
        {"id": "nf3", "label": "2. g1 → f3", "position": after_nf3, "arrows": [], "move": {"from": "g1", "to": "f3", "color": "w", "piece": "wN"}},
    ],
}

content, filename = make_package(trainer_payload)
assert filename == "Chess_Ruy_Lopez.apkg"
with tempfile.TemporaryDirectory() as folder:
    package = Path(folder) / filename
    package.write_bytes(content)
    with zipfile.ZipFile(package) as archive:
        assert json.loads(archive.read("media")) == {}
        database = Path(folder) / "collection.anki2"
        database.write_bytes(archive.read("collection.anki2"))
    connection = sqlite3.connect(database)
    try:
        assert connection.execute("select count(*) from cards").fetchone()[0] == 1
        assert connection.execute("select guid from notes").fetchone()[0] == genanki.guid_for("chess-anki-trainer-v2", "trainer-test-note")
        fields = connection.execute("select flds from notes").fetchone()[0].split("\x1f")
        assert fields[0] == "Ruy Lopez"
        decoded = json.loads(__import__("base64").b64decode(fields[2]).decode("utf-8"))
        assert decoded["frames"][1]["move"] == {"from": "e2", "to": "e4", "color": "w", "piece": "wP"}
        models = json.loads(connection.execute("select models from col").fetchone()[0])
        model = next(iter(models.values()))
        assert str(model["id"]) == "1907302401"
        assert model["name"] == "Chess Anki Maker - Interactive Trainer v2"
        assert "Interactive chess training board" in model["tmpls"][0]["qfmt"]
        assert "Wrong — try again" in model["tmpls"][0]["qfmt"]
        assert "state.auto.dragProgress" in model["tmpls"][0]["qfmt"]
        assert "commitPlayerMove" in model["tmpls"][0]["qfmt"]
        assert "{{Explanation}}" in model["tmpls"][0]["afmt"]
    finally:
        connection.close()

print("trainer export test passed")
