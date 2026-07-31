"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent, MouseEvent, PointerEvent } from "react";
import { GIFEncoder, applyPalette, quantize } from "gifenc";

type Color = "w" | "b";
type Kind = "K" | "Q" | "R" | "B" | "N" | "P";
type Piece = `${Color}${Kind}`;
type Square = `${string}${number}`;
type Tool = "move" | "arrow";
type DiagramMode = "interactive" | "gif" | "still";
type CardMode = "study" | "trainer";
type Orientation = "white" | "black";
type Language = "en" | "es" | "fr";
type BoardTheme = "walnut" | "graphite" | "blue" | "green" | "sand" | "burgundy" | "purple" | "ice";
type PieceStyle = "classic" | "clean" | "glass" | "staunton" | "merida" | "tournament" | "minimal" | "outline";

type BoardArrow = {
  id: string;
  from: Square;
  to: Square;
  color: string;
  width: number;
};

type Position = Record<string, Piece>;

type TrainingMove = {
  from: Square;
  to: Square;
  color: Color;
  piece: Piece;
};

type SequenceFrame = {
  id: string;
  label: string;
  position: Position;
  arrows: BoardArrow[];
  move?: TrainingMove;
};

type SavedDraft = {
  noteId: string;
  term: string;
  explanation: string;
  deckName: string;
  normal: boolean;
  reversed: boolean;
  cardMode: CardMode;
  diagramMode: DiagramMode;
  gifSpeed: number;
  orientation: Orientation;
  boardTheme: BoardTheme;
  pieceStyle: PieceStyle;
  frames: SequenceFrame[];
  activeFrameId: string;
  position: Position;
  arrows: BoardArrow[];
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1];
const PIECES: Piece[] = ["wK", "wQ", "wR", "wB", "wN", "wP", "bK", "bQ", "bR", "bB", "bN", "bP"];
const GLYPHS: Record<Piece, string> = {
  wK: "♚", wQ: "♛", wR: "♜", wB: "♝", wN: "♞", wP: "♟",
  bK: "♚", bQ: "♛", bR: "♜", bB: "♝", bN: "♞", bP: "♟",
};
const THEMES: Record<BoardTheme, { light: string; dark: string; border: string }> = {
  walnut: { light: "#d8c2a4", dark: "#8a6747", border: "#56402f" },
  graphite: { light: "#aeb2b8", dark: "#5b6068", border: "#3f434a" },
  blue: { light: "#c2ced8", dark: "#5f7d96", border: "#42586b" },
  green: { light: "#d3d8bf", dark: "#71845a", border: "#4d5b3e" },
  sand: { light: "#ead9b5", dark: "#b88b59", border: "#765639" },
  burgundy: { light: "#e0c7bf", dark: "#8e4f55", border: "#60363b" },
  purple: { light: "#d9d0df", dark: "#786789", border: "#50445d" },
  ice: { light: "#dce8e8", dark: "#79a3aa", border: "#4f7379" },
};
const PIECE_RENDERING: Record<PieceStyle, { font: string; size: number; lineWidth: number; shadowBlur: number; shadowY: number }> = {
  classic: { font: '"Segoe UI Symbol", "DejaVu Sans"', size: 62, lineWidth: 2.2, shadowBlur: 1, shadowY: 2 },
  clean: { font: '"Segoe UI Symbol", "DejaVu Sans"', size: 56, lineWidth: 1.4, shadowBlur: 0, shadowY: 0 },
  glass: { font: '"Segoe UI Symbol", "DejaVu Sans"', size: 62, lineWidth: 2.4, shadowBlur: 9, shadowY: 4 },
  staunton: { font: 'Georgia, "Segoe UI Symbol", serif', size: 61, lineWidth: 2.5, shadowBlur: 2, shadowY: 2 },
  merida: { font: '"Cambria Math", "Segoe UI Symbol"', size: 60, lineWidth: 2, shadowBlur: 3, shadowY: 2 },
  tournament: { font: '"Arial Unicode MS", "Segoe UI Symbol"', size: 64, lineWidth: 2.7, shadowBlur: 2, shadowY: 3 },
  minimal: { font: '"Segoe UI Symbol", sans-serif', size: 54, lineWidth: 1, shadowBlur: 0, shadowY: 0 },
  outline: { font: '"Segoe UI Symbol", "DejaVu Sans"', size: 60, lineWidth: 4.2, shadowBlur: 0, shadowY: 0 },
};
const ARROW_COLORS = ["#e7b64a", "#4aa67f", "#d75d5d", "#5f8fd8"];
const LANGUAGE_OPTIONS: { code: Language; label: string; name: string }[] = [
  { code: "en", label: "EN", name: "English" },
  { code: "es", label: "ES", name: "Español" },
  { code: "fr", label: "FR", name: "Français" },
];

const UI_TEXT = {
  en: {
    language: "Language", newCard: "New card", close: "Close", term: "Term", explanation: "Explanation", shortExplanation: "Short explanation", deck: "Deck",
    cardType: "Card type", studyCard: "Study card", interactiveTrainer: "Interactive trainer", cardDirections: "Card directions", normal: "Normal", reversed: "Reversed",
    diagram: "Diagram", clickThrough: "Click-through", still: "Still", youPlay: "You play", white: "White", black: "Black",
    trainerInstructions: "Record both sides on the board. Your moves become prompts; the other side plays automatically.", frameSpeed: "Frame speed", board: "Board", pieces: "Pieces",
    exportAnki: "Export Anki package", downloadGif: "Download GIF", move: "Move", arrow: "Arrow", recording: "Recording", flip: "Flip", reset: "Reset", back: "Back", undoArrow: "Undo arrow",
    chessEditor: "Chess diagram editor", pieceTray: "Piece tray", placePiece: "Place", arrowColor: "Arrow color", width: "Width",
    trainingLine: "Training line", moveSingular: "move", moves: "moves", undoLast: "Undo last", startOver: "Start over", recordedMoves: "Recorded white and black moves",
    you: "YOU", automatic: "AUTO", noMovesYet: "No moves yet", sequence: "Sequence", state: "state", states: "states", addState: "Add state", update: "Update",
    frameLabel: "label", moveStateUp: "Move state up", moveStateDown: "Move state down", deleteState: "Delete state", cardControls: "Card controls", previousFrame: "Previous state", nextFrame: "Next state",
    ready: "Ready", moveRecorded: "{color} move recorded", previousState: "Previous state", startingPosition: "Starting position", boardSequenceReset: "Board and sequence reset",
    stateAdded: "State added", stateUpdated: "State updated", lastMoveRemoved: "Last move removed", buildingGif: "Building GIF…", gifDownloaded: "GIF downloaded", gifExportFailed: "GIF export failed",
    addTerm: "Add a term first", addExplanation: "Add an explanation first", selectDirection: "Select at least one card direction", recordLine: "Record at least one move for the training line",
    invalidTraining: "Every training state must contain one recorded move", recordPlayerMove: "Record at least one {color} move for you to play", buildingPackage: "Building Anki package…",
    exportFailed: "Anki export failed", packageDownloaded: "Anki package downloaded", newCardStatus: "New card", closed: "Closed — you can close this tab",
    boardThemes: { walnut: "Walnut", graphite: "Graphite", blue: "Blue", green: "Green", sand: "Sand", burgundy: "Burgundy", purple: "Purple", ice: "Ice" },
    pieceStyles: { classic: "Classic", clean: "Clean", glass: "Glass", staunton: "Staunton", merida: "Merida", tournament: "Tournament", minimal: "Minimal", outline: "Outline" },
  },
  es: {
    language: "Idioma", newCard: "Nueva tarjeta", close: "Cerrar", term: "Término", explanation: "Explicación", shortExplanation: "Explicación breve", deck: "Mazo",
    cardType: "Tipo de tarjeta", studyCard: "Tarjeta de estudio", interactiveTrainer: "Entrenador interactivo", cardDirections: "Direcciones de tarjeta", normal: "Normal", reversed: "Invertida",
    diagram: "Diagrama", clickThrough: "Paso a paso", still: "Imagen fija", youPlay: "Juegas con", white: "Blancas", black: "Negras",
    trainerInstructions: "Registra ambos bandos en el tablero. Tus movimientos se convierten en indicaciones; el otro bando juega automáticamente.", frameSpeed: "Velocidad de fotograma", board: "Tablero", pieces: "Piezas",
    exportAnki: "Exportar paquete de Anki", downloadGif: "Descargar GIF", move: "Mover", arrow: "Flecha", recording: "Grabando", flip: "Voltear", reset: "Restablecer", back: "Atrás", undoArrow: "Deshacer flecha",
    chessEditor: "Editor de diagramas de ajedrez", pieceTray: "Bandeja de piezas", placePiece: "Colocar", arrowColor: "Color de flecha", width: "Grosor",
    trainingLine: "Línea de entrenamiento", moveSingular: "movimiento", moves: "movimientos", undoLast: "Deshacer último", startOver: "Empezar de nuevo", recordedMoves: "Movimientos registrados de blancas y negras",
    you: "TÚ", automatic: "AUTO", noMovesYet: "Aún no hay movimientos", sequence: "Secuencia", state: "estado", states: "estados", addState: "Añadir estado", update: "Actualizar",
    frameLabel: "etiqueta", moveStateUp: "Subir estado", moveStateDown: "Bajar estado", deleteState: "Eliminar estado", cardControls: "Controles de tarjeta", previousFrame: "Estado anterior", nextFrame: "Estado siguiente",
    ready: "Listo", moveRecorded: "Movimiento de {color} registrado", previousState: "Estado anterior", startingPosition: "Posición inicial", boardSequenceReset: "Tablero y secuencia restablecidos",
    stateAdded: "Estado añadido", stateUpdated: "Estado actualizado", lastMoveRemoved: "Último movimiento eliminado", buildingGif: "Creando GIF…", gifDownloaded: "GIF descargado", gifExportFailed: "Error al exportar el GIF",
    addTerm: "Añade primero un término", addExplanation: "Añade primero una explicación", selectDirection: "Selecciona al menos una dirección de tarjeta", recordLine: "Registra al menos un movimiento para la línea de entrenamiento",
    invalidTraining: "Cada estado de entrenamiento debe contener un movimiento registrado", recordPlayerMove: "Registra al menos un movimiento de {color} para practicar", buildingPackage: "Creando paquete de Anki…",
    exportFailed: "Error al exportar a Anki", packageDownloaded: "Paquete de Anki descargado", newCardStatus: "Nueva tarjeta", closed: "Cerrado — ya puedes cerrar esta pestaña",
    boardThemes: { walnut: "Nogal", graphite: "Grafito", blue: "Azul", green: "Verde", sand: "Arena", burgundy: "Burdeos", purple: "Morado", ice: "Hielo" },
    pieceStyles: { classic: "Clásico", clean: "Limpio", glass: "Cristal", staunton: "Staunton", merida: "Mérida", tournament: "Torneo", minimal: "Minimal", outline: "Contorno" },
  },
  fr: {
    language: "Langue", newCard: "Nouvelle carte", close: "Fermer", term: "Terme", explanation: "Explication", shortExplanation: "Courte explication", deck: "Paquet",
    cardType: "Type de carte", studyCard: "Carte d’étude", interactiveTrainer: "Entraîneur interactif", cardDirections: "Sens des cartes", normal: "Normale", reversed: "Inversée",
    diagram: "Diagramme", clickThrough: "Pas à pas", still: "Image fixe", youPlay: "Vous jouez", white: "les Blancs", black: "les Noirs",
    trainerInstructions: "Enregistrez les deux camps sur l’échiquier. Vos coups deviennent des invites et l’autre camp joue automatiquement.", frameSpeed: "Vitesse des images", board: "Échiquier", pieces: "Pièces",
    exportAnki: "Exporter le paquet Anki", downloadGif: "Télécharger le GIF", move: "Déplacer", arrow: "Flèche", recording: "Enregistrement", flip: "Retourner", reset: "Réinitialiser", back: "Retour", undoArrow: "Annuler la flèche",
    chessEditor: "Éditeur de diagrammes d’échecs", pieceTray: "Réserve de pièces", placePiece: "Placer", arrowColor: "Couleur de flèche", width: "Épaisseur",
    trainingLine: "Ligne d’entraînement", moveSingular: "coup", moves: "coups", undoLast: "Annuler le dernier", startOver: "Recommencer", recordedMoves: "Coups blancs et noirs enregistrés",
    you: "VOUS", automatic: "AUTO", noMovesYet: "Aucun coup pour le moment", sequence: "Séquence", state: "état", states: "états", addState: "Ajouter un état", update: "Mettre à jour",
    frameLabel: "libellé", moveStateUp: "Monter l’état", moveStateDown: "Descendre l’état", deleteState: "Supprimer l’état", cardControls: "Commandes de la carte", previousFrame: "État précédent", nextFrame: "État suivant",
    ready: "Prêt", moveRecorded: "Coup des {color} enregistré", previousState: "État précédent", startingPosition: "Position initiale", boardSequenceReset: "Échiquier et séquence réinitialisés",
    stateAdded: "État ajouté", stateUpdated: "État mis à jour", lastMoveRemoved: "Dernier coup supprimé", buildingGif: "Création du GIF…", gifDownloaded: "GIF téléchargé", gifExportFailed: "Échec de l’exportation du GIF",
    addTerm: "Ajoutez d’abord un terme", addExplanation: "Ajoutez d’abord une explication", selectDirection: "Sélectionnez au moins un sens de carte", recordLine: "Enregistrez au moins un coup pour la ligne d’entraînement",
    invalidTraining: "Chaque état d’entraînement doit contenir un coup enregistré", recordPlayerMove: "Enregistrez au moins un coup des {color} à jouer", buildingPackage: "Création du paquet Anki…",
    exportFailed: "Échec de l’exportation Anki", packageDownloaded: "Paquet Anki téléchargé", newCardStatus: "Nouvelle carte", closed: "Fermé — vous pouvez fermer cet onglet",
    boardThemes: { walnut: "Noyer", graphite: "Graphite", blue: "Bleu", green: "Vert", sand: "Sable", burgundy: "Bordeaux", purple: "Violet", ice: "Glace" },
    pieceStyles: { classic: "Classique", clean: "Épuré", glass: "Verre", staunton: "Staunton", merida: "Mérida", tournament: "Tournoi", minimal: "Minimaliste", outline: "Contour" },
  },
} as const;

function uid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function startingPosition(): Position {
  const position: Position = {};
  const back: Kind[] = ["R", "N", "B", "Q", "K", "B", "N", "R"];
  FILES.forEach((file, index) => {
    position[`${file}1`] = `w${back[index]}` as Piece;
    position[`${file}2`] = "wP";
    position[`${file}7`] = "bP";
    position[`${file}8`] = `b${back[index]}` as Piece;
  });
  return position;
}

function copyPosition(position: Position): Position {
  return { ...position };
}

function copyArrows(arrows: BoardArrow[]): BoardArrow[] {
  return arrows.map((arrow) => ({ ...arrow }));
}

function newDraft(): SavedDraft {
  const position = startingPosition();
  const frameId = uid();
  return {
    noteId: uid(),
    term: "",
    explanation: "",
    deckName: "chess",
    normal: true,
    reversed: true,
    cardMode: "study",
    diagramMode: "interactive",
    gifSpeed: 900,
    orientation: "white",
    boardTheme: "walnut",
    pieceStyle: "classic",
    frames: [{ id: frameId, label: "Start", position: copyPosition(position), arrows: [] }],
    activeFrameId: frameId,
    position,
    arrows: [],
  };
}

function inferMove(previous: Position, next: Position): TrainingMove | null {
  const changed = new Set([...Object.keys(previous), ...Object.keys(next)]);
  const destinations = [...changed].filter((square) => next[square] && next[square] !== previous[square]);
  for (const to of destinations) {
    const piece = next[to];
    const from = [...changed].find((square) => square !== to && previous[square] === piece && next[square] !== piece);
    if (from && piece) return { from: from as Square, to: to as Square, color: piece[0] as Color, piece };
  }
  return null;
}

function frameMove(frames: SequenceFrame[], index: number) {
  if (index <= 0) return null;
  return frames[index].move ?? inferMove(frames[index - 1].position, frames[index].position);
}

function trainingLabel(move: TrainingMove, ply: number) {
  const number = Math.ceil(ply / 2);
  const prefix = move.color === "w" ? `${number}.` : `${number}...`;
  return `${prefix} ${move.from} → ${move.to}`;
}

function squareOrder(orientation: Orientation) {
  const files = orientation === "white" ? FILES : [...FILES].reverse();
  const ranks = orientation === "white" ? RANKS : [...RANKS].reverse();
  return ranks.flatMap((rank) => files.map((file) => `${file}${rank}` as Square));
}

function squareCenter(square: Square, orientation: Orientation, size: number) {
  const files = orientation === "white" ? FILES : [...FILES].reverse();
  const ranks = orientation === "white" ? RANKS : [...RANKS].reverse();
  const cell = size / 8;
  return {
    x: (files.indexOf(square[0]) + 0.5) * cell,
    y: (ranks.indexOf(Number(square[1])) + 0.5) * cell,
  };
}

function frameLabel(lastMove: string, count: number) {
  return lastMove || `Position ${count}`;
}

function htmlDownload(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function dataUrlFromBlob(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function drawFrame(
  canvas: HTMLCanvasElement,
  frame: Pick<SequenceFrame, "position" | "arrows">,
  settings: Pick<SavedDraft, "orientation" | "boardTheme" | "pieceStyle">,
) {
  const size = 640;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");
  const theme = THEMES[settings.boardTheme];
  const pieceRendering = PIECE_RENDERING[settings.pieceStyle];
  const order = squareOrder(settings.orientation);
  const cell = size / 8;
  ctx.fillStyle = theme.border;
  ctx.fillRect(0, 0, size, size);
  order.forEach((square, index) => {
    const x = (index % 8) * cell;
    const y = Math.floor(index / 8) * cell;
    const file = FILES.indexOf(square[0]);
    const rank = Number(square[1]);
    ctx.fillStyle = (file + rank) % 2 === 1 ? theme.light : theme.dark;
    ctx.fillRect(x, y, cell, cell);
    const piece = frame.position[square];
    if (piece) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `${pieceRendering.size}px ${pieceRendering.font}`;
      ctx.lineWidth = pieceRendering.lineWidth;
      ctx.strokeStyle = piece[0] === "w" ? "#272a2f" : "#f0f1f2";
      ctx.fillStyle = piece[0] === "w" ? "#f6f4ee" : "#26292f";
      ctx.shadowColor = "rgba(0,0,0,.5)";
      ctx.shadowBlur = pieceRendering.shadowBlur;
      ctx.shadowOffsetY = pieceRendering.shadowY;
      ctx.strokeText(GLYPHS[piece], x + cell / 2, y + cell / 2 + 3);
      ctx.fillText(GLYPHS[piece], x + cell / 2, y + cell / 2 + 3);
      ctx.restore();
    }
  });
  frame.arrows.forEach((arrow) => {
    const from = squareCenter(arrow.from, settings.orientation, size);
    const to = squareCenter(arrow.to, settings.orientation, size);
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const head = 18 + arrow.width * 1.4;
    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.strokeStyle = arrow.color;
    ctx.fillStyle = arrow.color;
    ctx.lineWidth = arrow.width * 2.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x - Math.cos(angle) * head * 0.55, to.y - Math.sin(angle) * head * 0.55);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - Math.cos(angle - Math.PI / 6) * head, to.y - Math.sin(angle - Math.PI / 6) * head);
    ctx.lineTo(to.x - Math.cos(angle + Math.PI / 6) * head, to.y - Math.sin(angle + Math.PI / 6) * head);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });
  ctx.save();
  ctx.fillStyle = "rgba(12,14,17,.72)";
  order.forEach((square, index) => {
    const x = (index % 8) * cell;
    const y = Math.floor(index / 8) * cell;
    const isBottom = Math.floor(index / 8) === 7;
    const isLeft = index % 8 === 0;
    ctx.font = "bold 15px Arial";
    if (isBottom) ctx.fillText(square[0], x + 6, y + cell - 7);
    if (isLeft) ctx.fillText(square[1], x + 6, y + 17);
  });
  ctx.restore();
}

function ArrowCanvas({ arrows, orientation }: { arrows: BoardArrow[]; orientation: Orientation }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(bounds.width * ratio));
    canvas.height = Math.max(1, Math.round(bounds.height * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    arrows.forEach((arrow) => {
      const from = squareCenter(arrow.from, orientation, bounds.width);
      const to = squareCenter(arrow.to, orientation, bounds.width);
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const head = 11 + arrow.width;
      ctx.save();
      ctx.globalAlpha = 0.86;
      ctx.strokeStyle = arrow.color;
      ctx.fillStyle = arrow.color;
      ctx.lineWidth = arrow.width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x - Math.cos(angle) * head * 0.6, to.y - Math.sin(angle) * head * 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(to.x, to.y);
      ctx.lineTo(to.x - Math.cos(angle - Math.PI / 6) * head, to.y - Math.sin(angle - Math.PI / 6) * head);
      ctx.lineTo(to.x - Math.cos(angle + Math.PI / 6) * head, to.y - Math.sin(angle + Math.PI / 6) * head);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });
  }, [arrows, orientation]);
  return <canvas className="arrow-canvas" ref={ref} aria-hidden="true" />;
}

export function ChessMaker() {
  const [draft, setDraft] = useState<SavedDraft>(() => newDraft());
  const [language, setLanguage] = useState<Language>("en");
  const [tool, setTool] = useState<Tool>("move");
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [arrowStart, setArrowStart] = useState<Square | null>(null);
  const [arrowColor, setArrowColor] = useState(ARROW_COLORS[0]);
  const [arrowWidth, setArrowWidth] = useState(8);
  const [lastMove, setLastMove] = useState("");
  const [status, setStatus] = useState(UI_TEXT.en.ready);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const previewCanvas = useRef<HTMLCanvasElement>(null);
  const t = UI_TEXT[language];
  const languageIndex = Math.max(0, LANGUAGE_OPTIONS.findIndex((option) => option.code === language));

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem("chess-anki-maker:draft");
        const savedLanguage = localStorage.getItem("chess-anki-maker:language") as Language | null;
        if (savedLanguage && LANGUAGE_OPTIONS.some((option) => option.code === savedLanguage)) setLanguage(savedLanguage);
        if (saved) {
          const parsed = JSON.parse(saved) as Partial<SavedDraft>;
          setDraft({ ...newDraft(), ...parsed, cardMode: parsed.cardMode ?? "study" });
        }
      } catch {
        localStorage.removeItem("chess-anki-maker:draft");
      } finally {
        setLoaded(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem("chess-anki-maker:draft", JSON.stringify(draft));
  }, [draft, loaded]);

  useEffect(() => {
    document.documentElement.lang = language;
    if (loaded) localStorage.setItem("chess-anki-maker:language", language);
  }, [language, loaded]);

  const squares = useMemo(() => squareOrder(draft.orientation), [draft.orientation]);
  const theme = THEMES[draft.boardTheme];
  const activeFrameIndex = Math.max(0, draft.frames.findIndex((frame) => frame.id === draft.activeFrameId));

  function patchDraft(patch: Partial<SavedDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function changeLanguage(nextLanguage: Language) {
    setLanguage(nextLanguage);
    setStatus(UI_TEXT[nextLanguage].ready);
  }

  function movePiece(from: Square | null, to: Square, piece?: Piece) {
    setDraft((current) => {
      const next = copyPosition(current.position);
      const moving = piece ?? (from ? next[from] : undefined);
      if (!moving) return current;
      if (from) delete next[from];
      next[to] = moving;

      if (from && moving[1] === "K" && Math.abs(FILES.indexOf(from[0]) - FILES.indexOf(to[0])) === 2) {
        const rank = from[1];
        const kingSide = to[0] === "g";
        const rookFrom = `${kingSide ? "h" : "a"}${rank}`;
        const rookTo = `${kingSide ? "f" : "d"}${rank}`;
        const rook = next[rookFrom];
        if (rook === `${moving[0]}R`) {
          delete next[rookFrom];
          next[rookTo] = rook;
        }
      }

      if (current.cardMode === "trainer" && from) {
        const activeIndex = Math.max(0, current.frames.findIndex((frame) => frame.id === current.activeFrameId));
        const frames = current.frames.slice(0, activeIndex + 1);
        const trainingMove: TrainingMove = { from, to, color: moving[0] as Color, piece: moving };
        const frame: SequenceFrame = {
          id: uid(),
          label: trainingLabel(trainingMove, frames.length),
          position: next,
          arrows: [],
          move: trainingMove,
        };
        setLastMove(frame.label);
        setStatus(t.moveRecorded.replace("{color}", moving[0] === "w" ? t.white : t.black));
        return { ...current, position: next, arrows: [], frames: [...frames, frame], activeFrameId: frame.id };
      }

      setLastMove(from ? `${from} → ${to}` : `${GLYPHS[moving]} on ${to}`);
      if (current.cardMode === "trainer" && current.frames.length === 1) {
        const first = { ...current.frames[0], position: copyPosition(next) };
        return { ...current, position: next, frames: [first] };
      }
      return { ...current, position: next };
    });
    setSelectedSquare(null);
  }

  function onSquareClick(square: Square) {
    if (tool !== "move") return;
    if (selectedSquare) {
      if (selectedSquare === square) setSelectedSquare(null);
      else movePiece(selectedSquare, square);
      return;
    }
    if (draft.position[square]) setSelectedSquare(square);
  }

  function onDrop(event: DragEvent<HTMLDivElement>, square: Square) {
    event.preventDefault();
    if (tool !== "move") return;
    const raw = event.dataTransfer.getData("text/chess-piece");
    if (!raw) return;
    const payload = JSON.parse(raw) as { from?: Square; piece: Piece };
    movePiece(payload.from ?? null, square, payload.piece);
  }

  function onPieceDrag(event: DragEvent<HTMLElement>, piece: Piece, from?: Square) {
    event.dataTransfer.setData("text/chess-piece", JSON.stringify({ piece, from }));
    event.dataTransfer.effectAllowed = "move";
  }

  function onSquarePointerDown(event: PointerEvent<HTMLDivElement>, square: Square) {
    if (tool !== "arrow" || event.button !== 0) return;
    setArrowStart(square);
  }

  function onSquarePointerUp(square: Square) {
    if (tool !== "arrow" || !arrowStart) return;
    if (arrowStart !== square) {
      const nextArrow: BoardArrow = { id: uid(), from: arrowStart, to: square, color: arrowColor, width: arrowWidth };
      patchDraft({ arrows: [...draft.arrows, nextArrow] });
      setLastMove(`${arrowStart} → ${square}`);
    }
    setArrowStart(null);
  }

  function removePiece(event: MouseEvent, square: Square) {
    event.preventDefault();
    if (!draft.position[square]) return;
    setDraft((current) => {
      const next = copyPosition(current.position);
      delete next[square];
      if (current.cardMode === "trainer" && current.frames.length === 1) {
        return { ...current, position: next, frames: [{ ...current.frames[0], position: copyPosition(next) }] };
      }
      return { ...current, position: next };
    });
    setSelectedSquare(null);
  }

  function loadFrame(frame: SequenceFrame) {
    patchDraft({
      activeFrameId: frame.id,
      position: copyPosition(frame.position),
      arrows: copyArrows(frame.arrows),
    });
    setLastMove(frame.label);
  }

  function stepFrame(direction: -1 | 1) {
    const target = activeFrameIndex + direction;
    if (target < 0 || target >= draft.frames.length) return;
    loadFrame(draft.frames[target]);
    setStatus(direction < 0 ? t.previousFrame : t.nextFrame);
  }

  function resetBoardAndSequence() {
    const position = startingPosition();
    const frameId = uid();
    patchDraft({
      position,
      arrows: [],
      frames: [{ id: frameId, label: "Start", position: copyPosition(position), arrows: [] }],
      activeFrameId: frameId,
    });
    setArrowStart(null);
    setSelectedSquare(null);
    setLastMove(t.startingPosition);
    setStatus(t.boardSequenceReset);
  }

  function addFrame() {
    const frame: SequenceFrame = {
      id: uid(),
      label: frameLabel(lastMove, draft.frames.length + 1),
      position: copyPosition(draft.position),
      arrows: copyArrows(draft.arrows),
    };
    patchDraft({ frames: [...draft.frames, frame], activeFrameId: frame.id });
    setStatus(t.stateAdded);
  }

  function updateFrame() {
    const frames = draft.frames.map((frame) => frame.id === draft.activeFrameId
      ? { ...frame, label: frameLabel(lastMove, activeFrameIndex + 1), position: copyPosition(draft.position), arrows: copyArrows(draft.arrows) }
      : frame);
    patchDraft({ frames });
    setStatus(t.stateUpdated);
  }

  function deleteFrame(id: string) {
    if (draft.frames.length === 1) return;
    const frames = draft.frames.filter((frame) => frame.id !== id);
    const fallback = frames[Math.min(activeFrameIndex, frames.length - 1)];
    patchDraft({
      frames,
      activeFrameId: fallback.id,
      position: copyPosition(fallback.position),
      arrows: copyArrows(fallback.arrows),
    });
  }

  function moveFrame(id: string, direction: -1 | 1) {
    const index = draft.frames.findIndex((frame) => frame.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= draft.frames.length) return;
    const frames = [...draft.frames];
    [frames[index], frames[target]] = [frames[target], frames[index]];
    patchDraft({ frames });
  }

  function renameFrame(id: string, label: string) {
    patchDraft({ frames: draft.frames.map((frame) => frame.id === id ? { ...frame, label } : frame) });
  }

  function undoTrainingMove() {
    if (draft.frames.length <= 1) return;
    const frames = draft.frames.slice(0, -1);
    const previous = frames[frames.length - 1];
    patchDraft({
      frames,
      activeFrameId: previous.id,
      position: copyPosition(previous.position),
      arrows: [],
    });
    setSelectedSquare(null);
    setStatus(t.lastMoveRemoved);
  }

  function trainingFramesForExport() {
    return draft.frames.map((frame, index) => {
      if (index === 0) return { ...frame, move: undefined };
      const move = frameMove(draft.frames, index);
      return move ? { ...frame, move } : frame;
    });
  }

  function framesForExport() {
    return draft.frames.length ? draft.frames : [{ id: uid(), label: "Position", position: draft.position, arrows: draft.arrows }];
  }

  async function renderStillDataUrl() {
    const canvas = previewCanvas.current ?? document.createElement("canvas");
    drawFrame(canvas, framesForExport()[0], draft);
    return canvas.toDataURL("image/png");
  }

  async function makeGifBlob() {
    const frames = framesForExport();
    const canvas = previewCanvas.current ?? document.createElement("canvas");
    const encoder = GIFEncoder();
    frames.forEach((frame, index) => {
      drawFrame(canvas, frame, draft);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const palette = quantize(pixels, 128);
      const indexed = applyPalette(pixels, palette);
      encoder.writeFrame(indexed, canvas.width, canvas.height, {
        palette,
        delay: draft.gifSpeed,
        repeat: index === 0 ? 0 : undefined,
        dispose: 1,
      });
    });
    encoder.finish();
    const encoded = encoder.bytes();
    const copy = new ArrayBuffer(encoded.byteLength);
    new Uint8Array(copy).set(encoded);
    return new Blob([copy], { type: "image/gif" });
  }

  async function downloadGif() {
    setBusy(true);
    setStatus(t.buildingGif);
    try {
      const blob = await makeGifBlob();
      htmlDownload(blob, `${draft.term.trim() || "chess-sequence"}.gif`);
      setStatus(t.gifDownloaded);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t.gifExportFailed);
    } finally {
      setBusy(false);
    }
  }

  async function exportAnki() {
    if (!draft.term.trim()) return setStatus(t.addTerm);
    if (!draft.explanation.trim()) return setStatus(t.addExplanation);
    if (draft.cardMode === "study" && !draft.normal && !draft.reversed) return setStatus(t.selectDirection);
    const exportedFrames = draft.cardMode === "trainer" ? trainingFramesForExport() : framesForExport();
    if (draft.cardMode === "trainer") {
      if (exportedFrames.length < 2) return setStatus(t.recordLine);
      if (exportedFrames.slice(1).some((frame) => !frame.move)) return setStatus(t.invalidTraining);
      const player = draft.orientation === "white" ? "w" : "b";
      if (!exportedFrames.slice(1).some((frame) => frame.move?.color === player)) {
        return setStatus(t.recordPlayerMove.replace("{color}", draft.orientation === "white" ? t.white : t.black));
      }
    }
    setBusy(true);
    setStatus(t.buildingPackage);
    try {
      const stillDataUrl = draft.cardMode === "study" ? await renderStillDataUrl() : null;
      const gifDataUrl = draft.cardMode === "study" && draft.diagramMode === "gif" ? await dataUrlFromBlob(await makeGifBlob()) : null;
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, frames: exportedFrames, stillDataUrl, gifDataUrl }),
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || t.exportFailed);
      }
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? "Chess_Anki_Card.apkg";
      htmlDownload(await response.blob(), filename);
      setStatus(t.packageDownloaded);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t.exportFailed);
    } finally {
      setBusy(false);
    }
  }

  function resetDraft() {
    const next = newDraft();
    setDraft(next);
    setSelectedSquare(null);
    setLastMove("");
    setStatus(t.newCardStatus);
  }

  async function closeApp() {
    try {
      await fetch("/api/shutdown", { method: "POST" });
      setStatus(t.closed);
    } catch {
      window.close();
    }
  }

  const boardStyle = {
    "--light-square": theme.light,
    "--dark-square": theme.dark,
    "--board-border": theme.border,
  } as CSSProperties;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></div>
        <div className="top-actions">
          <div className="language-switch" role="group" aria-label={t.language} data-language-index={languageIndex}>
            <span className="language-switch__indicator" aria-hidden="true" />
            {LANGUAGE_OPTIONS.map((option) => (
              <button
                key={option.code}
                type="button"
                className={language === option.code ? "language-chip language-chip--active" : "language-chip"}
                aria-pressed={language === option.code}
                title={option.name}
                onClick={() => changeLanguage(option.code)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button className="button ghost" type="button" onClick={resetDraft}>{t.newCard}</button>
          <button className="button ghost desktop-only" type="button" onClick={closeApp}>{t.close}</button>
        </div>
      </header>

      <section className="workspace">
        <aside className="panel details-panel">
          <label className="field">
            <span>{t.term}</span>
            <input value={draft.term} onChange={(event) => patchDraft({ term: event.target.value })} placeholder="En passant" />
          </label>
          <label className="field">
            <span>{t.explanation}</span>
            <textarea value={draft.explanation} onChange={(event) => patchDraft({ explanation: event.target.value })} placeholder={t.shortExplanation} rows={6} />
          </label>
          <label className="field">
            <span>{t.deck}</span>
            <input value={draft.deckName} onChange={(event) => patchDraft({ deckName: event.target.value })} placeholder="chess" />
          </label>

          <div className="field-group">
            <span className="field-title">{t.cardType}</span>
            <div className="segmented two wide" role="group" aria-label={t.cardType} data-active-index={draft.cardMode === "study" ? 0 : 1}>
              <span className="segmented-indicator" aria-hidden="true" />
              <button type="button" aria-pressed={draft.cardMode === "study"} className={draft.cardMode === "study" ? "active" : ""} onClick={() => patchDraft({ cardMode: "study" })}>{t.studyCard}</button>
              <button type="button" aria-pressed={draft.cardMode === "trainer"} className={draft.cardMode === "trainer" ? "active" : ""} onClick={() => { patchDraft({ cardMode: "trainer", arrows: [] }); setTool("move"); }}>{t.interactiveTrainer}</button>
            </div>
          </div>

          {draft.cardMode === "study" ? (
            <>
              <div className="field-group compact-group">
                <span className="field-title">{t.cardDirections}</span>
                <label className="check-row"><input type="checkbox" checked={draft.normal} onChange={(event) => patchDraft({ normal: event.target.checked })} /> {t.normal}</label>
                <label className="check-row"><input type="checkbox" checked={draft.reversed} onChange={(event) => patchDraft({ reversed: event.target.checked })} /> {t.reversed}</label>
              </div>
              <div className="field-group">
                <span className="field-title">{t.diagram}</span>
                <div className="segmented three" role="group" aria-label={t.diagram} data-active-index={draft.diagramMode === "interactive" ? 0 : draft.diagramMode === "gif" ? 1 : 2}>
                  <span className="segmented-indicator" aria-hidden="true" />
                  {(["interactive", "gif", "still"] as DiagramMode[]).map((mode) => (
                    <button key={mode} type="button" aria-pressed={draft.diagramMode === mode} className={draft.diagramMode === mode ? "active" : ""} onClick={() => patchDraft({ diagramMode: mode })}>
                      {mode === "interactive" ? t.clickThrough : mode === "gif" ? "GIF" : t.still}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="trainer-callout">
              <strong>{t.youPlay} {draft.orientation === "white" ? t.white : t.black}</strong>
              <span>{t.trainerInstructions}</span>
            </div>
          )}

          {draft.cardMode === "study" && draft.diagramMode === "gif" && (
            <label className="field range-field">
              <span>{t.frameSpeed} <output>{(draft.gifSpeed / 1000).toFixed(1)}s</output></span>
              <input type="range" min="250" max="2500" step="50" value={draft.gifSpeed} onChange={(event) => patchDraft({ gifSpeed: Number(event.target.value) })} />
            </label>
          )}

          <div className="two-fields">
            <label className="field">
              <span>{t.board}</span>
              <select value={draft.boardTheme} onChange={(event) => patchDraft({ boardTheme: event.target.value as BoardTheme })}>
                <option value="walnut">{t.boardThemes.walnut}</option>
                <option value="graphite">{t.boardThemes.graphite}</option>
                <option value="blue">{t.boardThemes.blue}</option>
                <option value="green">{t.boardThemes.green}</option>
                <option value="sand">{t.boardThemes.sand}</option>
                <option value="burgundy">{t.boardThemes.burgundy}</option>
                <option value="purple">{t.boardThemes.purple}</option>
                <option value="ice">{t.boardThemes.ice}</option>
              </select>
            </label>
            <label className="field">
              <span>{t.pieces}</span>
              <select value={draft.pieceStyle} onChange={(event) => patchDraft({ pieceStyle: event.target.value as PieceStyle })}>
                <option value="classic">{t.pieceStyles.classic}</option>
                <option value="clean">{t.pieceStyles.clean}</option>
                <option value="glass">{t.pieceStyles.glass}</option>
                <option value="staunton">{t.pieceStyles.staunton}</option>
                <option value="merida">{t.pieceStyles.merida}</option>
                <option value="tournament">{t.pieceStyles.tournament}</option>
                <option value="minimal">{t.pieceStyles.minimal}</option>
                <option value="outline">{t.pieceStyles.outline}</option>
              </select>
            </label>
          </div>

          <div className="export-stack">
            <button className="button primary" type="button" onClick={exportAnki} disabled={busy}>{t.exportAnki}</button>
            {draft.cardMode === "study" && <button className="button" type="button" onClick={downloadGif} disabled={busy || draft.frames.length < 2}>{t.downloadGif}</button>}
            <div className="sr-only" role="status" aria-live="polite">{status}</div>
          </div>
        </aside>

        <section className="board-column">
          <div className="board-toolbar">
            {draft.cardMode === "study" ? (
              <div className="segmented" role="group" aria-label={`${t.move} / ${t.arrow}`} data-active-index={tool === "move" ? 0 : 1}>
                <span className="segmented-indicator" aria-hidden="true" />
                <button type="button" aria-pressed={tool === "move"} className={tool === "move" ? "active" : ""} onClick={() => setTool("move")}>{t.move}</button>
                <button type="button" aria-pressed={tool === "arrow"} className={tool === "arrow" ? "active" : ""} onClick={() => setTool("arrow")}>{t.arrow}</button>
              </div>
            ) : <span className={`side-badge ${draft.orientation}`}>{t.recording} · {t.youPlay} {draft.orientation === "white" ? t.white : t.black}</span>}
            <button className="button compact" type="button" onClick={() => patchDraft({ orientation: draft.orientation === "white" ? "black" : "white" })}>{t.flip}</button>
            <button className="button compact" type="button" onClick={resetBoardAndSequence}>{t.reset}</button>
            <button className="button compact" type="button" onClick={() => stepFrame(-1)} disabled={activeFrameIndex <= 0}>{t.back}</button>
            {draft.cardMode === "study" && <button className="button compact" type="button" onClick={() => patchDraft({ arrows: draft.arrows.slice(0, -1) })} disabled={!draft.arrows.length}>{t.undoArrow}</button>}
          </div>

          <div className={`board-wrap piece-${draft.pieceStyle} tool-${tool}`} style={boardStyle}>
            <div className="chessboard" role="grid" aria-label={t.chessEditor}>
              {squares.map((square, index) => {
                const piece = draft.position[square];
                const fileIndex = FILES.indexOf(square[0]);
                const rank = Number(square[1]);
                const light = (fileIndex + rank) % 2 === 1;
                const bottomRow = index >= 56;
                const leftColumn = index % 8 === 0;
                return (
                  <div
                    key={square}
                    className={`square ${light ? "light" : "dark"} ${selectedSquare === square ? "selected" : ""}`}
                    role="gridcell"
                    onClick={() => onSquareClick(square)}
                    onContextMenu={(event) => removePiece(event, square)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => onDrop(event, square)}
                    onPointerDown={(event) => onSquarePointerDown(event, square)}
                    onPointerUp={() => onSquarePointerUp(square)}
                    onPointerCancel={() => setArrowStart(null)}
                  >
                    {piece && <span className={`piece ${piece[0] === "w" ? "white-piece" : "black-piece"}`} draggable={tool === "move"} onDragStart={(event) => onPieceDrag(event, piece, square)}>{GLYPHS[piece]}</span>}
                    {bottomRow && <span className="file-label">{square[0]}</span>}
                    {leftColumn && <span className="rank-label">{square[1]}</span>}
                  </div>
                );
              })}
              <ArrowCanvas arrows={draft.arrows} orientation={draft.orientation} />
            </div>
          </div>

          <div className="piece-tray" aria-label={t.pieceTray}>
            {PIECES.map((piece) => <button key={piece} type="button" className={`tray-piece piece-${draft.pieceStyle} ${piece[0] === "w" ? "white-piece" : "black-piece"}`} draggable onDragStart={(event) => onPieceDrag(event, piece)} aria-label={`${t.placePiece} ${piece}`}>{GLYPHS[piece]}</button>)}
          </div>

          {tool === "arrow" && (
            <div className="arrow-options">
              <div className="color-row">
                {ARROW_COLORS.map((color) => <button key={color} type="button" className={arrowColor === color ? "swatch active" : "swatch"} style={{ background: color }} onClick={() => setArrowColor(color)} aria-label={`${t.arrowColor} ${color}`} />)}
              </div>
              <label>{t.width} <input type="range" min="4" max="16" value={arrowWidth} onChange={(event) => setArrowWidth(Number(event.target.value))} /></label>
            </div>
          )}
        </section>

        <aside className="panel sequence-panel">
          {draft.cardMode === "trainer" ? (
            <>
              <div className="sequence-heading">
                <h2>{t.trainingLine}</h2>
                <span>{Math.max(0, draft.frames.length - 1)} {draft.frames.length === 2 ? t.moveSingular : t.moves}</span>
              </div>
              <div className="sequence-actions">
                <button className="button" type="button" onClick={undoTrainingMove} disabled={draft.frames.length <= 1}>{t.undoLast}</button>
                <button className="button" type="button" onClick={resetBoardAndSequence}>{t.startOver}</button>
              </div>
              <div className="training-sequence" aria-label={t.recordedMoves}>
                {(["w", "b"] as Color[]).map((color) => (
                  <section className={`training-lane ${color === (draft.orientation === "white" ? "w" : "b") ? "player-lane" : ""}`} key={color}>
                    <header><span className={`side-dot ${color}`} />{color === "w" ? t.white : t.black}<small>{color === (draft.orientation === "white" ? "w" : "b") ? t.you : t.automatic}</small></header>
                    <div className="training-moves">
                      {draft.frames.slice(1).map((frame, offset) => {
                        const index = offset + 1;
                        const move = frameMove(draft.frames, index);
                        if (!move || move.color !== color) return null;
                        return (
                          <button key={frame.id} type="button" className={frame.id === draft.activeFrameId ? "active" : ""} onClick={() => loadFrame(frame)}>
                            <span>{Math.ceil(index / 2)}</span>{move.from} → {move.to}
                          </button>
                        );
                      })}
                      {!draft.frames.slice(1).some((_, offset) => frameMove(draft.frames, offset + 1)?.color === color) && <p>{t.noMovesYet}</p>}
                    </div>
                  </section>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="sequence-heading">
                <h2>{t.sequence}</h2>
                <span>{draft.frames.length} {draft.frames.length === 1 ? t.state : t.states}</span>
              </div>
              <div className="sequence-actions">
                <button className="button" type="button" onClick={addFrame}>{t.addState}</button>
                <button className="button" type="button" onClick={updateFrame}>{t.update}</button>
              </div>
              <div className="frame-list">
                {draft.frames.map((frame, index) => (
                  <div key={frame.id} className={`frame-row ${frame.id === draft.activeFrameId ? "active" : ""}`}>
                    <button className="frame-select" type="button" onClick={() => loadFrame(frame)}>
                      <span className="frame-number">{index + 1}</span>
                      <input value={frame.label} onClick={(event) => event.stopPropagation()} onChange={(event) => renameFrame(frame.id, event.target.value)} aria-label={`${t.state} ${index + 1} ${t.frameLabel}`} />
                    </button>
                    <div className="frame-controls">
                      <button type="button" onClick={() => moveFrame(frame.id, -1)} disabled={index === 0} aria-label={t.moveStateUp}>↑</button>
                      <button type="button" onClick={() => moveFrame(frame.id, 1)} disabled={index === draft.frames.length - 1} aria-label={t.moveStateDown}>↓</button>
                      <button type="button" onClick={() => deleteFrame(frame.id)} disabled={draft.frames.length === 1} aria-label={t.deleteState}>×</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="sequence-footer">
                <span>{t.cardControls}</span>
                <div className="mini-controls">
                  <button type="button" onClick={() => stepFrame(-1)} disabled={activeFrameIndex <= 0} aria-label={t.previousFrame}>‹</button>
                  <span>{activeFrameIndex + 1} / {draft.frames.length}</span>
                  <button type="button" onClick={() => stepFrame(1)} disabled={activeFrameIndex >= draft.frames.length - 1} aria-label={t.nextFrame}>›</button>
                </div>
              </div>
            </>
          )}
        </aside>
      </section>
      <canvas className="render-canvas" ref={previewCanvas} />
    </main>
  );
}
