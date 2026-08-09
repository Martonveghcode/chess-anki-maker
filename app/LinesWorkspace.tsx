"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, FormEvent, MouseEvent } from "react";
import {
  emptyLineLibrary,
  loadLineLibrary,
  persistLineLibrary,
  type LineFolder,
  type LineLibrary,
  type SavedLine,
} from "./line-library";
import { PracticeBoard, type PracticePhase, type PracticeSnapshot } from "./PracticeBoard";

type Language = "en" | "es" | "fr";
type PracticeMode = "normal" | "random";
type LibraryContext = { kind: "root" } | { kind: "folder"; id: string };
type MenuTarget = { kind: "root" } | { kind: "folder" | "line"; id: string };
type EditorDialog = {
  kind: "create-folder" | "rename-folder" | "rename-line" | "delete-folder" | "delete-line";
  id?: string;
  value: string;
};

type PracticeSettings = {
  autoRepeat: boolean;
  autoNext: boolean;
  loop: boolean;
};

type Props = {
  active: boolean;
  language: Language;
  settingsOpen: boolean;
  onCloseSettings: () => void;
};

const TEXT = {
  en: {
    lines: "Lines", lineCount: "{count} lines", newFolder: "New folder", emptyLibrary: "No saved lines", emptyLibraryHelp: "Record a line in Anki, then choose Save line.",
    rename: "Rename", delete: "Delete", moveToRoot: "Move to library", createFolder: "Create folder", folderName: "Folder name", lineName: "Line name", cancel: "Cancel", save: "Save",
    deleteFolder: "Delete folder", deleteFolderHelp: "Its lines will move back to the main library.", deleteLine: "Delete line", deleteLineHelp: "This removes the saved practice line.",
    normal: "Normal", random: "Random", chooseLines: "Choose lines", practiceSelection: "Practice selection", name: "Name", included: "Included", selectAll: "Select all", clear: "Clear", useSelection: "Use selection", noSelection: "Choose at least one line.",
    settings: "Settings", autoRepeat: "Auto repeat", autoRepeatHelp: "Restart the same line after completion.", autoNext: "Auto next", autoNextHelp: "Continue to the next line in the current folder.", loop: "Loop", loopHelp: "After the last line, continue from the first.", done: "Done",
    practice: "Practice", playWhite: "Play as White", playBlack: "Play as Black", moves: "{count} moves", getReady: "Get ready", yourMove: "Your move", opponentMove: "Opponent is moving…", opponentMoved: "Opponent moved {move}", wrongMove: "Wrong — try again", correctMove: "Correct", complete: "Line complete", invalidMove: "This line contains an invalid move", chooseSavedLine: "Choose a saved line", chooseSavedLineHelp: "Select a line or folder in the library.",
    backMove: "Back", restart: "Restart", hint: "Hint", showMove: "Show move", previousLine: "Previous line", nextLine: "Next line", lineProgress: "Move {current} of {total}", folder: "Folder", library: "Library", selectedCount: "{count} selected", randomSelection: "Random selection", folderEmpty: "This folder is empty.",
  },
  es: {
    lines: "Líneas", lineCount: "{count} líneas", newFolder: "Nueva carpeta", emptyLibrary: "No hay líneas guardadas", emptyLibraryHelp: "Graba una línea en Anki y elige Guardar línea.",
    rename: "Renombrar", delete: "Eliminar", moveToRoot: "Mover a la biblioteca", createFolder: "Crear carpeta", folderName: "Nombre de la carpeta", lineName: "Nombre de la línea", cancel: "Cancelar", save: "Guardar",
    deleteFolder: "Eliminar carpeta", deleteFolderHelp: "Sus líneas volverán a la biblioteca principal.", deleteLine: "Eliminar línea", deleteLineHelp: "Esto elimina la línea de práctica guardada.",
    normal: "Normal", random: "Aleatorio", chooseLines: "Elegir líneas", practiceSelection: "Selección de práctica", name: "Nombre", included: "Incluida", selectAll: "Seleccionar todo", clear: "Limpiar", useSelection: "Usar selección", noSelection: "Elige al menos una línea.",
    settings: "Ajustes", autoRepeat: "Repetición automática", autoRepeatHelp: "Reinicia la misma línea al terminar.", autoNext: "Siguiente automática", autoNextHelp: "Continúa con la línea siguiente de la carpeta actual.", loop: "Bucle", loopHelp: "Después de la última línea, vuelve a la primera.", done: "Listo",
    practice: "Práctica", playWhite: "Jugar con blancas", playBlack: "Jugar con negras", moves: "{count} movimientos", getReady: "Prepárate", yourMove: "Tu turno", opponentMove: "El rival está moviendo…", opponentMoved: "El rival movió {move}", wrongMove: "Incorrecto — inténtalo de nuevo", correctMove: "Correcto", complete: "Línea completada", invalidMove: "Esta línea contiene un movimiento inválido", chooseSavedLine: "Elige una línea guardada", chooseSavedLineHelp: "Selecciona una línea o carpeta de la biblioteca.",
    backMove: "Atrás", restart: "Reiniciar", hint: "Pista", showMove: "Mostrar", previousLine: "Línea anterior", nextLine: "Línea siguiente", lineProgress: "Movimiento {current} de {total}", folder: "Carpeta", library: "Biblioteca", selectedCount: "{count} seleccionadas", randomSelection: "Selección aleatoria", folderEmpty: "Esta carpeta está vacía.",
  },
  fr: {
    lines: "Lignes", lineCount: "{count} lignes", newFolder: "Nouveau dossier", emptyLibrary: "Aucune ligne enregistrée", emptyLibraryHelp: "Enregistrez une ligne dans Anki, puis choisissez Enregistrer la ligne.",
    rename: "Renommer", delete: "Supprimer", moveToRoot: "Déplacer vers la bibliothèque", createFolder: "Créer un dossier", folderName: "Nom du dossier", lineName: "Nom de la ligne", cancel: "Annuler", save: "Enregistrer",
    deleteFolder: "Supprimer le dossier", deleteFolderHelp: "Ses lignes retourneront dans la bibliothèque principale.", deleteLine: "Supprimer la ligne", deleteLineHelp: "Cette action supprime la ligne d’entraînement enregistrée.",
    normal: "Normal", random: "Aléatoire", chooseLines: "Choisir les lignes", practiceSelection: "Sélection d’entraînement", name: "Nom", included: "Incluse", selectAll: "Tout sélectionner", clear: "Effacer", useSelection: "Utiliser la sélection", noSelection: "Choisissez au moins une ligne.",
    settings: "Réglages", autoRepeat: "Répétition automatique", autoRepeatHelp: "Recommence la même ligne à la fin.", autoNext: "Suivante automatique", autoNextHelp: "Continue avec la ligne suivante du dossier actuel.", loop: "Boucle", loopHelp: "Après la dernière ligne, reprend à la première.", done: "Terminé",
    practice: "Entraînement", playWhite: "Jouer les Blancs", playBlack: "Jouer les Noirs", moves: "{count} coups", getReady: "Préparez-vous", yourMove: "À vous de jouer", opponentMove: "L’adversaire joue…", opponentMoved: "L’adversaire a joué {move}", wrongMove: "Incorrect — réessayez", correctMove: "Correct", complete: "Ligne terminée", invalidMove: "Cette ligne contient un coup invalide", chooseSavedLine: "Choisissez une ligne enregistrée", chooseSavedLineHelp: "Sélectionnez une ligne ou un dossier dans la bibliothèque.",
    backMove: "Retour", restart: "Recommencer", hint: "Indice", showMove: "Montrer", previousLine: "Ligne précédente", nextLine: "Ligne suivante", lineProgress: "Coup {current} sur {total}", folder: "Dossier", library: "Bibliothèque", selectedCount: "{count} sélectionnées", randomSelection: "Sélection aléatoire", folderEmpty: "Ce dossier est vide.",
  },
} as const;

function uid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function replaceCount(value: string, count: number) {
  return value.replace("{count}", String(count));
}

function randomItem<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function readSettings(): PracticeSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem("chess-anki-maker:practice-settings") || "{}");
    return { autoRepeat: Boolean(parsed.autoRepeat), autoNext: Boolean(parsed.autoNext), loop: parsed.loop !== false };
  } catch {
    return { autoRepeat: false, autoNext: false, loop: true };
  }
}

export function LinesWorkspace({ active, language, settingsOpen, onCloseSettings }: Props) {
  const t = TEXT[language];
  const [library, setLibrary] = useState<LineLibrary>(() => emptyLineLibrary());
  const [loaded, setLoaded] = useState(false);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [libraryContext, setLibraryContext] = useState<LibraryContext>({ kind: "root" });
  const [practiceMode, setPracticeMode] = useState<PracticeMode>("normal");
  const [practiceSettings, setPracticeSettings] = useState<PracticeSettings>(() => ({ autoRepeat: false, autoNext: false, loop: true }));
  const [customScope, setCustomScope] = useState<string[]>([]);
  const [useCustomScope, setUseCustomScope] = useState(false);
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [selectionDraft, setSelectionDraft] = useState<string[]>([]);
  const [selectionError, setSelectionError] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number; target: MenuTarget } | null>(null);
  const [editor, setEditor] = useState<EditorDialog | null>(null);
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const [practiceSession, setPracticeSession] = useState(0);
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [practicePhase, setPracticePhase] = useState<PracticePhase>("ready");
  const [practiceMessage, setPracticeMessage] = useState<string>(t.getReady);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadLineLibrary().then((next) => {
      if (cancelled) return;
      setLibrary(next);
      setSelectedLineId((current) => current && next.lines.some((line) => line.id === current) ? current : next.lines[0]?.id ?? null);
      setLoaded(true);
    });
    const onUpdated = (event: Event) => {
      const next = (event as CustomEvent<LineLibrary>).detail;
      if (!next) return;
      setLibrary(next);
      setSelectedLineId((current) => current && next.lines.some((line) => line.id === current) ? current : next.lines[0]?.id ?? null);
    };
    window.addEventListener("chess-lines-updated", onUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("chess-lines-updated", onUpdated);
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setPracticeSettings(readSettings()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem("chess-anki-maker:practice-settings", JSON.stringify(practiceSettings));
  }, [practiceSettings, loaded]);

  useEffect(() => {
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("resize", close);
    };
  }, []);

  const selectedLine = useMemo(
    () => library.lines.find((line) => line.id === selectedLineId) ?? null,
    [library.lines, selectedLineId],
  );

  const contextLines = useMemo(() => {
    if (libraryContext.kind === "folder") return library.lines.filter((line) => line.folderId === libraryContext.id);
    return library.lines.filter((line) => !line.folderId);
  }, [library.lines, libraryContext]);

  const practicePool = useMemo(() => {
    if (!useCustomScope) return contextLines;
    const selected = new Set(customScope);
    return library.lines.filter((line) => selected.has(line.id));
  }, [contextLines, customScope, library.lines, useCustomScope]);

  async function updateLibrary(next: LineLibrary) {
    setLibrary(next);
    const saved = await persistLineLibrary(next);
    setLibrary(saved);
  }

  function beginLine(lineId: string, context?: LibraryContext) {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (context) setLibraryContext(context);
    setSelectedLineId(lineId);
    setPracticeSession((current) => current + 1);
    setPracticeIndex(0);
    setPracticePhase("ready");
    setPracticeMessage(t.getReady);
  }

  function restartPractice() {
    if (!selectedLine) return;
    setPracticeSession((current) => current + 1);
    setPracticeIndex(0);
    setPracticePhase("ready");
    setPracticeMessage(t.getReady);
  }

  function moveToAdjacentLine(direction: -1 | 1, wrap = practiceSettings.loop) {
    if (!practicePool.length) return;
    const current = Math.max(0, practicePool.findIndex((line) => line.id === selectedLineId));
    let target = current + direction;
    if (target < 0 || target >= practicePool.length) {
      if (!wrap) return;
      target = (target + practicePool.length) % practicePool.length;
    }
    beginLine(practicePool[target].id);
  }

  function chooseRandomLine() {
    if (!practicePool.length) return;
    const candidates = practicePool.length > 1 ? practicePool.filter((line) => line.id !== selectedLineId) : practicePool;
    beginLine(randomItem(candidates).id);
  }

  useEffect(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (!active || !selectedLine || practicePhase !== "complete") return;
    if (practiceSettings.autoRepeat) timerRef.current = window.setTimeout(() => restartPractice(), 760);
    else if (practiceMode === "random") timerRef.current = window.setTimeout(() => chooseRandomLine(), 760);
    else if (practiceSettings.autoNext) timerRef.current = window.setTimeout(() => moveToAdjacentLine(1, practiceSettings.loop), 760);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
    // Completion is the only trigger; the helpers intentionally use this render's practice pool.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, practiceMode, practicePhase, practiceSettings.autoNext, practiceSettings.autoRepeat, practiceSettings.loop, selectedLine?.id]);

  function openMenu(event: MouseEvent, target: MenuTarget) {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ x: Math.min(event.clientX, window.innerWidth - 190), y: Math.min(event.clientY, window.innerHeight - 180), target });
  }

  function openCreateFolder() {
    setMenu(null);
    setEditor({ kind: "create-folder", value: "" });
  }

  function openRename(target: Extract<MenuTarget, { kind: "folder" | "line" }>) {
    const value = target.kind === "folder"
      ? library.folders.find((folder) => folder.id === target.id)?.name ?? ""
      : library.lines.find((line) => line.id === target.id)?.name ?? "";
    setMenu(null);
    setEditor({ kind: target.kind === "folder" ? "rename-folder" : "rename-line", id: target.id, value });
  }

  function openDelete(target: Extract<MenuTarget, { kind: "folder" | "line" }>) {
    setMenu(null);
    setEditor({ kind: target.kind === "folder" ? "delete-folder" : "delete-line", id: target.id, value: "" });
  }

  async function submitEditor(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    const name = editor.value.trim();
    if (editor.kind === "create-folder" && name) {
      const folder: LineFolder = { id: uid(), name, collapsed: false, createdAt: new Date().toISOString() };
      await updateLibrary({ ...library, folders: [...library.folders, folder] });
    } else if (editor.kind === "rename-folder" && name) {
      await updateLibrary({ ...library, folders: library.folders.map((folder) => folder.id === editor.id ? { ...folder, name } : folder) });
    } else if (editor.kind === "rename-line" && name) {
      await updateLibrary({ ...library, lines: library.lines.map((line) => line.id === editor.id ? { ...line, name, updatedAt: new Date().toISOString() } : line) });
    } else if (editor.kind === "delete-folder") {
      await updateLibrary({
        ...library,
        folders: library.folders.filter((folder) => folder.id !== editor.id),
        lines: library.lines.map((line) => line.folderId === editor.id ? { ...line, folderId: null } : line),
      });
      if (libraryContext.kind === "folder" && libraryContext.id === editor.id) setLibraryContext({ kind: "root" });
    } else if (editor.kind === "delete-line") {
      const lines = library.lines.filter((line) => line.id !== editor.id);
      await updateLibrary({ ...library, lines });
      if (selectedLineId === editor.id) setSelectedLineId(lines[0]?.id ?? null);
    }
    setEditor(null);
  }

  async function toggleFolder(folder: LineFolder) {
    await updateLibrary({ ...library, folders: library.folders.map((item) => item.id === folder.id ? { ...item, collapsed: !item.collapsed } : item) });
  }

  async function moveLine(lineId: string, folderId: string | null) {
    setDragTarget(null);
    await updateLibrary({
      ...library,
      lines: library.lines.map((line) => line.id === lineId ? { ...line, folderId, updatedAt: new Date().toISOString() } : line),
    });
    if (selectedLineId === lineId) setLibraryContext(folderId ? { kind: "folder", id: folderId } : { kind: "root" });
  }

  function onLineDragStart(event: DragEvent, lineId: string) {
    event.dataTransfer.setData("text/chess-line-id", lineId);
    event.dataTransfer.effectAllowed = "move";
  }

  function onLineDrop(event: DragEvent, folderId: string | null) {
    event.preventDefault();
    event.stopPropagation();
    const lineId = event.dataTransfer.getData("text/chess-line-id");
    if (lineId) void moveLine(lineId, folderId);
  }

  function selectFolder(folder: LineFolder) {
    const lines = library.lines.filter((line) => line.folderId === folder.id);
    setUseCustomScope(false);
    setLibraryContext({ kind: "folder", id: folder.id });
    if (lines[0]) beginLine(lines[0].id, { kind: "folder", id: folder.id });
    else setSelectedLineId(null);
  }

  function selectLine(line: SavedLine) {
    setUseCustomScope(false);
    beginLine(line.id, line.folderId ? { kind: "folder", id: line.folderId } : { kind: "root" });
  }

  function openSelection() {
    setSelectionDraft(practicePool.map((line) => line.id));
    setSelectionError("");
    setSelectionOpen(true);
  }

  function toggleSelectionLine(lineId: string) {
    setSelectionDraft((current) => current.includes(lineId) ? current.filter((id) => id !== lineId) : [...current, lineId]);
  }

  function toggleSelectionFolder(folderId: string | null) {
    const ids = library.lines.filter((line) => line.folderId === folderId).map((line) => line.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectionDraft.includes(id));
    setSelectionDraft((current) => allSelected
      ? current.filter((id) => !ids.includes(id))
      : [...new Set([...current, ...ids])]);
  }

  function applySelection() {
    if (!selectionDraft.length) {
      setSelectionError(t.noSelection);
      return;
    }
    setCustomScope(selectionDraft);
    setUseCustomScope(true);
    setSelectionOpen(false);
    if (!selectionDraft.includes(selectedLineId ?? "")) beginLine(selectionDraft[0]);
  }

  const orientation = selectedLine?.orientation ?? "white";
  const totalMoves = selectedLine ? selectedLine.frames.length - 1 : 0;
  const scopeLabel = useCustomScope
    ? replaceCount(t.selectedCount, practicePool.length)
    : libraryContext.kind === "folder"
      ? library.folders.find((folder) => folder.id === libraryContext.id)?.name ?? t.folder
      : t.library;

  const renderLineRow = (line: SavedLine, nested = false) => (
    <button
      key={line.id}
      type="button"
      className={`tree-row line-row ${nested ? "nested" : ""} ${line.id === selectedLineId ? "active" : ""}`}
      draggable
      onDragStart={(event) => onLineDragStart(event, line.id)}
      onClick={() => selectLine(line)}
      onContextMenu={(event) => openMenu(event, { kind: "line", id: line.id })}
    >
      <span className="line-file-icon" aria-hidden="true" />
      <span className="tree-label">{line.name}</span>
      <span className="tree-meta">{line.frames.length - 1}</span>
    </button>
  );

  return (
    <>
      {active && (
        <section className="workspace lines-workspace">
          <aside
            className={`panel details-panel line-library-panel ${dragTarget === "root" ? "drop-active" : ""}`}
            onContextMenu={(event) => {
              if (event.target === event.currentTarget) openMenu(event, { kind: "root" });
            }}
            onDragOver={(event) => { event.preventDefault(); setDragTarget("root"); }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragTarget(null); }}
            onDrop={(event) => onLineDrop(event, null)}
          >
            <div className="library-header">
              <div>
                <h1>{t.lines}</h1>
                <span>{replaceCount(t.lineCount, library.lines.length)}</span>
              </div>
              <button className="icon-button" type="button" onClick={openCreateFolder} aria-label={t.newFolder} title={t.newFolder}>+</button>
            </div>

            <div className="line-tree" onContextMenu={(event) => { if (event.target === event.currentTarget) openMenu(event, { kind: "root" }); }}>
              {library.folders.map((folder) => {
                const folderLines = library.lines.filter((line) => line.folderId === folder.id);
                return (
                  <div className="folder-block" key={folder.id}>
                    <div
                      className={`tree-row folder-row ${libraryContext.kind === "folder" && libraryContext.id === folder.id ? "context-active" : ""} ${dragTarget === folder.id ? "drop-active" : ""}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => selectFolder(folder)}
                      onKeyDown={(event) => { if (event.key === "Enter") selectFolder(folder); }}
                      onContextMenu={(event) => openMenu(event, { kind: "folder", id: folder.id })}
                      onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); setDragTarget(folder.id); }}
                      onDragLeave={() => setDragTarget(null)}
                      onDrop={(event) => onLineDrop(event, folder.id)}
                    >
                      <button className="folder-toggle" type="button" onClick={(event) => { event.stopPropagation(); void toggleFolder(folder); }} aria-label={folder.collapsed ? "+" : "−"}>
                        <span className={folder.collapsed ? "chevron" : "chevron open"}>›</span>
                      </button>
                      <span className="folder-icon" aria-hidden="true" />
                      <span className="tree-label">{folder.name}</span>
                      <span className="tree-meta">{folderLines.length}</span>
                    </div>
                    {!folder.collapsed && (
                      <div
                        className="folder-children"
                        onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); setDragTarget(folder.id); }}
                        onDrop={(event) => onLineDrop(event, folder.id)}
                      >
                        {folderLines.map((line) => renderLineRow(line, true))}
                      </div>
                    )}
                  </div>
                );
              })}
              {library.lines.filter((line) => !line.folderId).map((line) => renderLineRow(line))}
              {!library.lines.length && !library.folders.length && (
                <div className="library-empty"><strong>{t.emptyLibrary}</strong><span>{t.emptyLibraryHelp}</span></div>
              )}
            </div>
          </aside>

          <section className="board-column practice-board-column">
            {selectedLine ? (
              <>
                <div className="board-toolbar practice-toolbar">
                  <span className={`side-badge ${orientation}`}>{orientation === "white" ? t.playWhite : t.playBlack}</span>
                  <span className="practice-location">{scopeLabel}</span>
                </div>
                <PracticeBoard
                  key={`${selectedLine.id}:${practiceSession}`}
                  line={selectedLine}
                  text={t}
                  onUpdate={(snapshot: PracticeSnapshot) => {
                    setPracticeIndex(snapshot.index);
                    setPracticePhase(snapshot.phase);
                    setPracticeMessage(snapshot.message);
                  }}
                />
              </>
            ) : (
              <div className="practice-empty"><div className="brand-mark large" aria-hidden="true"><span /><span /><span /><span /></div><h2>{t.chooseSavedLine}</h2><p>{t.chooseSavedLineHelp}</p></div>
            )}
          </section>

          <aside className="panel sequence-panel practice-panel">
            <div className="sequence-heading"><h2>{t.practice}</h2>{selectedLine && <span>{replaceCount(t.moves, totalMoves)}</span>}</div>
            <div className="field-group">
              <div className="segmented two wide" role="group" data-active-index={practiceMode === "normal" ? 0 : 1}>
                <span className="segmented-indicator" aria-hidden="true" />
                <button type="button" className={practiceMode === "normal" ? "active" : ""} aria-pressed={practiceMode === "normal"} onClick={() => setPracticeMode("normal")}>{t.normal}</button>
                <button type="button" className={practiceMode === "random" ? "active" : ""} aria-pressed={practiceMode === "random"} onClick={() => setPracticeMode("random")}>{t.random}</button>
              </div>
              <button className="button selection-button" type="button" onClick={openSelection} disabled={!library.lines.length}>
                <span>{t.chooseLines}</span><small>{scopeLabel}</small>
              </button>
            </div>

            {selectedLine ? (
              <>
                <div className="practice-line-card">
                  <h3>{selectedLine.name}</h3>
                  {selectedLine.explanation && <p>{selectedLine.explanation}</p>}
                  <div className="practice-facts"><span>{orientation === "white" ? t.playWhite : t.playBlack}</span><span>{replaceCount(t.moves, totalMoves)}</span></div>
                </div>
                <div className={`practice-status ${practicePhase}`} role="status" aria-live="polite">
                  <strong>{practiceMessage}</strong>
                  <span>{t.lineProgress.replace("{current}", String(Math.min(practiceIndex, totalMoves))).replace("{total}", String(totalMoves))}</span>
                  <div className="progress-track"><span style={{ width: `${totalMoves ? Math.min(100, practiceIndex / totalMoves * 100) : 0}%` }} /></div>
                </div>
                <div className="practice-actions">
                  <button className="button" type="button" onClick={() => practiceMode === "random" ? chooseRandomLine() : moveToAdjacentLine(-1)} disabled={practicePool.length < 2}>{t.previousLine}</button>
                  <button className="button" type="button" onClick={() => practiceMode === "random" ? chooseRandomLine() : moveToAdjacentLine(1)} disabled={practicePool.length < 2}>{t.nextLine}</button>
                </div>
              </>
            ) : (
              <div className="panel-empty"><strong>{t.chooseSavedLine}</strong><span>{t.chooseSavedLineHelp}</span></div>
            )}
          </aside>
        </section>
      )}

      {menu && active && (
        <div className="context-menu" style={{ left: menu.x, top: menu.y }} role="menu" onClick={(event) => event.stopPropagation()}>
          {menu.target.kind === "root" ? (
            <button type="button" onClick={openCreateFolder}>{t.createFolder}</button>
          ) : (
            <>
              <button type="button" onClick={() => openRename(menu.target as Extract<MenuTarget, { kind: "folder" | "line" }>)}>{t.rename}</button>
              {menu.target.kind === "line" && library.lines.find((line) => line.id === (menu.target as { kind: "line"; id: string }).id)?.folderId && <button type="button" onClick={() => { void moveLine((menu.target as { kind: "line"; id: string }).id, null); setMenu(null); }}>{t.moveToRoot}</button>}
              <button className="danger" type="button" onClick={() => openDelete(menu.target as Extract<MenuTarget, { kind: "folder" | "line" }>)}>{t.delete}</button>
            </>
          )}
        </div>
      )}

      {editor && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditor(null); }}>
          <form className="modal-card small-modal" onSubmit={submitEditor}>
            <div className="modal-header">
              <h2>{editor.kind === "create-folder" ? t.createFolder : editor.kind === "rename-folder" || editor.kind === "rename-line" ? t.rename : editor.kind === "delete-folder" ? t.deleteFolder : t.deleteLine}</h2>
              <button className="modal-close" type="button" onClick={() => setEditor(null)} aria-label={t.cancel}>×</button>
            </div>
            {editor.kind.startsWith("delete") ? (
              <p className="modal-copy">{editor.kind === "delete-folder" ? t.deleteFolderHelp : t.deleteLineHelp}</p>
            ) : (
              <label className="field modal-field"><span>{editor.kind.includes("folder") ? t.folderName : t.lineName}</span><input autoFocus value={editor.value} onChange={(event) => setEditor({ ...editor, value: event.target.value })} /></label>
            )}
            <div className="modal-actions"><button className="button" type="button" onClick={() => setEditor(null)}>{t.cancel}</button><button className={`button ${editor.kind.startsWith("delete") ? "danger-button" : "primary"}`} type="submit" disabled={!editor.kind.startsWith("delete") && !editor.value.trim()}>{editor.kind.startsWith("delete") ? t.delete : t.save}</button></div>
          </form>
        </div>
      )}

      {selectionOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectionOpen(false); }}>
          <section className="modal-card selection-modal" role="dialog" aria-modal="true" aria-labelledby="selection-title">
            <div className="modal-header"><h2 id="selection-title">{t.practiceSelection}</h2><button className="modal-close" type="button" onClick={() => setSelectionOpen(false)} aria-label={t.cancel}>×</button></div>
            <div className="selection-toolbar"><button className="button compact" type="button" onClick={() => setSelectionDraft(library.lines.map((line) => line.id))}>{t.selectAll}</button><button className="button compact" type="button" onClick={() => setSelectionDraft([])}>{t.clear}</button><span>{replaceCount(t.selectedCount, selectionDraft.length)}</span></div>
            <div className="selection-table" role="table">
              <div className="selection-table-head" role="row"><span role="columnheader">{t.name}</span><span role="columnheader">{t.included}</span></div>
              {[{ id: null, name: t.library }, ...library.folders.map((folder) => ({ id: folder.id, name: folder.name }))].map((group) => {
                const lines = library.lines.filter((line) => line.folderId === group.id);
                if (!lines.length) return null;
                const selected = lines.filter((line) => selectionDraft.includes(line.id)).length;
                const state = selected === lines.length ? "checked" : selected > 0 ? "partial" : "unchecked";
                return (
                  <div className="selection-group" key={group.id ?? "root"}>
                    <div className="selection-row group-row" role="row"><span role="cell"><span className="folder-icon" />{group.name}</span><button className="selection-check" data-state={state} type="button" onClick={() => toggleSelectionFolder(group.id)} aria-pressed={state === "checked"}><span /></button></div>
                    {lines.map((line) => (
                      <div className="selection-row child-row" role="row" key={line.id}><span role="cell"><span className="line-file-icon" />{line.name}</span><button className="selection-check" data-state={selectionDraft.includes(line.id) ? "checked" : "unchecked"} type="button" onClick={() => toggleSelectionLine(line.id)} aria-pressed={selectionDraft.includes(line.id)}><span /></button></div>
                    ))}
                  </div>
                );
              })}
            </div>
            {selectionError && <p className="modal-error">{selectionError}</p>}
            <div className="modal-actions"><button className="button" type="button" onClick={() => setSelectionOpen(false)}>{t.cancel}</button><button className="button primary" type="button" onClick={applySelection}>{t.useSelection}</button></div>
          </section>
        </div>
      )}

      {settingsOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCloseSettings(); }}>
          <section className="modal-card settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="modal-header"><h2 id="settings-title">{t.settings}</h2><button className="modal-close" type="button" onClick={onCloseSettings} aria-label={t.done}>×</button></div>
            <div className="settings-list">
              <button className="setting-row" type="button" aria-pressed={practiceSettings.autoRepeat} onClick={() => setPracticeSettings((current) => ({ ...current, autoRepeat: !current.autoRepeat, autoNext: current.autoRepeat ? current.autoNext : false }))}><span><strong>{t.autoRepeat}</strong><small>{t.autoRepeatHelp}</small></span><span className="toggle-control" aria-hidden="true"><i /></span></button>
              <button className="setting-row" type="button" aria-pressed={practiceSettings.autoNext} onClick={() => setPracticeSettings((current) => ({ ...current, autoNext: !current.autoNext, autoRepeat: current.autoNext ? current.autoRepeat : false }))}><span><strong>{t.autoNext}</strong><small>{t.autoNextHelp}</small></span><span className="toggle-control" aria-hidden="true"><i /></span></button>
              <button className="setting-row" type="button" aria-pressed={practiceSettings.loop} onClick={() => setPracticeSettings((current) => ({ ...current, loop: !current.loop }))}><span><strong>{t.loop}</strong><small>{t.loopHelp}</small></span><span className="toggle-control" aria-hidden="true"><i /></span></button>
            </div>
            <div className="modal-actions"><button className="button primary" type="button" onClick={onCloseSettings}>{t.done}</button></div>
          </section>
        </div>
      )}
    </>
  );
}
