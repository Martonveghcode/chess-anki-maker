# Chess Anki Maker

[![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Anki](https://img.shields.io/badge/Anki-00A1E4?logo=anki&logoColor=white)](https://apps.ankiweb.net/)

Chess Anki Maker is a local editor for creating standard and interactive chess cards for Anki. Arrange a position, record a move sequence, choose a click-through diagram, still image, or GIF, then export an `.apkg` file.

<p align="center">
  <img src="assets/chess-anki-maker.png" alt="Chess Anki Maker board editor" width="680">
</p>

- **Board editor:** Drag pieces to build a position, move them between squares, flip the board, or switch to Arrow mode to mark ideas and plans.
- **Move sequence:** Save positions in order for a click-through card or GIF. In trainer mode, each move is recorded as part of the line instead.

<p align="center">
  <img src="assets/sidebar-overview.png" alt="Card editor and interactive training panels" width="680">
</p>

- **Card setup:** Add the term, explanation, and deck; choose a normal study card or an interactive trainer; and select normal, reversed, or both card directions.
- **Diagram output:** Use Click-through to step through saved positions, GIF for an automatic animation with adjustable frame speed, or Still for a single board image.
- **Appearance:** Board and Pieces change the board palette and chess-piece style used on the exported card.
- **Training line:** Choose the side you want to practise. Your moves are checked during review, while the opposing moves play automatically. Undo last removes the newest move, and Start over clears the recorded line.
- **Export:** Export Anki package builds an `.apkg` ready to import. Importing it creates the required note type automatically, so no manual card-template setup is needed. Re-exporting unchanged content keeps the same Anki note identity; changing the term, explanation, settings, or recorded positions automatically creates a new identity, without requiring **New card**.
