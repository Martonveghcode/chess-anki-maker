export type LineColor = "w" | "b";
export type LineOrientation = "white" | "black";

export type LineMove = {
  from: string;
  to: string;
  color: LineColor;
  piece: string;
};

export type LineFrame = {
  id: string;
  label: string;
  position: Record<string, string>;
  arrows: { id: string; from: string; to: string; color: string; width: number }[];
  move?: LineMove;
};

export type SavedLine = {
  id: string;
  name: string;
  explanation: string;
  folderId: string | null;
  orientation: LineOrientation;
  boardTheme: string;
  pieceStyle: string;
  frames: LineFrame[];
  createdAt: string;
  updatedAt: string;
};

export type LineFolder = {
  id: string;
  name: string;
  collapsed: boolean;
  createdAt: string;
};

export type LineLibrary = {
  version: 1;
  folders: LineFolder[];
  lines: SavedLine[];
};

const FALLBACK_KEY = "chess-anki-maker:line-library";

export function emptyLineLibrary(): LineLibrary {
  return { version: 1, folders: [], lines: [] };
}

function isLibrary(value: unknown): value is LineLibrary {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LineLibrary>;
  return Array.isArray(candidate.folders) && Array.isArray(candidate.lines);
}

function readFallback(): LineLibrary {
  try {
    const saved = localStorage.getItem(FALLBACK_KEY);
    if (!saved) return emptyLineLibrary();
    const parsed = JSON.parse(saved);
    return isLibrary(parsed) ? { version: 1, folders: parsed.folders, lines: parsed.lines } : emptyLineLibrary();
  } catch {
    return emptyLineLibrary();
  }
}

function saveFallback(library: LineLibrary) {
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(library));
  } catch {
    // The desktop JSON API remains authoritative when browser storage is unavailable.
  }
}

export async function loadLineLibrary(): Promise<LineLibrary> {
  try {
    const response = await fetch("/api/lines", { headers: { Accept: "application/json" } });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Local line storage is unavailable");
    const payload = await response.json() as { library?: unknown };
    if (!isLibrary(payload.library)) throw new Error("Invalid line library");
    const library = { version: 1, folders: payload.library.folders, lines: payload.library.lines } as LineLibrary;
    saveFallback(library);
    return library;
  } catch {
    return readFallback();
  }
}

export async function persistLineLibrary(library: LineLibrary): Promise<LineLibrary> {
  saveFallback(library);
  try {
    const response = await fetch("/api/lines", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ library }),
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Local line storage is unavailable");
    const payload = await response.json() as { library?: unknown; message?: string };
    if (!isLibrary(payload.library)) throw new Error(payload.message || "Invalid line library");
    const saved = { version: 1, folders: payload.library.folders, lines: payload.library.lines } as LineLibrary;
    saveFallback(saved);
    window.dispatchEvent(new CustomEvent("chess-lines-updated", { detail: saved }));
    return saved;
  } catch {
    window.dispatchEvent(new CustomEvent("chess-lines-updated", { detail: library }));
    return library;
  }
}

export async function appendSavedLine(line: SavedLine): Promise<LineLibrary> {
  const library = await loadLineLibrary();
  return persistLineLibrary({ ...library, lines: [...library.lines, line] });
}
