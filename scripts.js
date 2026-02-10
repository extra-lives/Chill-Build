const SPRITESHEET_PATH = "assets/isometric tileset/isometric tileset/spritesheet.png";
const TILE_SIZE = 32;
const SPRITESHEET_COLUMNS = 11;
const SPRITESHEET_ROWS = 11;
const TOTAL_SLOTS = SPRITESHEET_COLUMNS * SPRITESHEET_ROWS;
const VALID_TILE_COUNT = 115;

const ISO_TILE_WIDTH = 32;
const ISO_TILE_HEIGHT = 16;
const ISO_HALF_W = ISO_TILE_WIDTH / 2;
const ISO_HALF_H = ISO_TILE_HEIGHT / 2;
const DEFAULT_ZOOM = 1.3;
const MIN_ZOOM = DEFAULT_ZOOM;
const MAX_ZOOM = DEFAULT_ZOOM * 3;
const ZOOM_STEP = DEFAULT_ZOOM * 0.1;

const GRID_WIDTH = 30;
const GRID_HEIGHT = 30;
const DEFAULT_TERRAIN_TILE = null;
const LAYER_HEIGHT_PX = 8;
const MAX_LAYERS = 24;
const GHOST_LAYER_ALPHA = 0.1;
const STORAGE_KEY = "relaxing_isometric_builder_save_v1";
const SAVE_DEBOUNCE_MS = 250;
const DEFAULT_CANVAS_BG = "#17171e";
const MAX_UNDO_STEPS = 200;

function createEmptyLayer() {
  return Array.from({ length: GRID_HEIGHT }, () =>
    Array.from({ length: GRID_WIDTH }, () => DEFAULT_TERRAIN_TILE)
  );
}

const state = {
  activeLayerIndex: 0,
  selectedTile: 0,
  zoom: DEFAULT_ZOOM,
  cameraX: 0,
  cameraY: 0,
  isPainting: false,
  isPanning: false,
  panStartX: 0,
  panStartY: 0,
  cameraStartX: 0,
  cameraStartY: 0,
  hoverTile: null,
  pointerX: null,
  pointerY: null,
  isolateLayer: false,
  hideIsolated: false,
  canvasBgColor: DEFAULT_CANVAS_BG,
  layers: [createEmptyLayer()]
};

const worldCanvas = document.getElementById("world");
const worldCtx = worldCanvas.getContext("2d");
const paletteEl = document.getElementById("palette");
const paletteStatusEl = document.getElementById("palette-status");
const saveStatusEl = document.getElementById("save-status");
const worldWrap = document.querySelector(".world-wrap");
const hoverCoordEl = document.getElementById("hover-coord");
const layerPrevBtn = document.getElementById("layer-prev");
const layerNextBtn = document.getElementById("layer-next");
const layerAddBtn = document.getElementById("layer-add");
const layerRemoveBtn = document.getElementById("layer-remove");
const layerIsolateBtn = document.getElementById("layer-isolate");
const layerHideIsolatedBtn = document.getElementById("layer-hide-isolated");
const layerLabelEl = document.getElementById("layer-label");
const saveMapBtn = document.getElementById("save-map");
const undoStrokeBtn = document.getElementById("undo-stroke");
const loadMapBtn = document.getElementById("load-map");
const newMapBtn = document.getElementById("new-map");
const exportMapBtn = document.getElementById("export-map");
const exportImageBtn = document.getElementById("export-image");
const importMapBtn = document.getElementById("import-map");
const importFileInput = document.getElementById("import-file");
const zoomOutBtn = document.getElementById("zoom-out");
const zoomLevelEl = document.getElementById("zoom-level");
const zoomInBtn = document.getElementById("zoom-in");
const bgColorInput = document.getElementById("bg-color");
const confirmModalEl = document.getElementById("confirm-modal");
const confirmMessageEl = document.getElementById("confirm-message");
const confirmYesBtn = document.getElementById("confirm-yes");
const confirmNoBtn = document.getElementById("confirm-no");

let autoSaveTimer = null;
let saveStatusTimer = null;
let activeStroke = null;
const undoStack = [];
const redoStack = [];
let confirmResolve = null;

worldCtx.imageSmoothingEnabled = false;

const spritesheet = new Image();
spritesheet.src = SPRITESHEET_PATH;
spritesheet.onload = () => {
  setupPalette();
  paletteStatusEl.textContent = "Pick a tile, choose a layer, then paint.";
  tryLoadFromLocalStorage(true);
  resetCameraToCenter();
  requestAnimationFrame(render);
};
spritesheet.onerror = () => {
  paletteStatusEl.textContent =
    "Could not load spritesheet. Verify the image path in scripts.js.";
};

function resetCameraToCenter() {
  resizeCanvas();
  const centerX = (GRID_WIDTH - 1) / 2;
  const centerY = (GRID_HEIGHT - 1) / 2;
  const center = gridToScreen(centerX, centerY);
  state.cameraX = worldCanvas.width / (2 * state.zoom) - center.x;
  state.cameraY = worldCanvas.height / (2 * state.zoom) - center.y;
}

function resizeCanvas() {
  const rect = worldWrap.getBoundingClientRect();
  worldCanvas.width = Math.max(320, Math.floor(rect.width));
  worldCanvas.height = Math.max(260, Math.floor(rect.height));
}

function tileIndexToSheetXY(index) {
  const safeIndex = Math.max(0, Math.min(index, TOTAL_SLOTS - 1));
  return {
    sx: (safeIndex % SPRITESHEET_COLUMNS) * TILE_SIZE,
    sy: Math.floor(safeIndex / SPRITESHEET_COLUMNS) * TILE_SIZE
  };
}

function drawTileIndex(index, dx, dy) {
  if (index === null || index === undefined || index < 0 || index >= VALID_TILE_COUNT) return;
  const { sx, sy } = tileIndexToSheetXY(index);
  worldCtx.drawImage(
    spritesheet,
    sx,
    sy,
    TILE_SIZE,
    TILE_SIZE,
    Math.floor(dx),
    Math.floor(dy),
    TILE_SIZE,
    TILE_SIZE
  );
}

function gridToScreen(gridX, gridY) {
  return {
    x: (gridX - gridY) * ISO_HALF_W,
    y: (gridX + gridY) * ISO_HALF_H
  };
}

function screenToGrid(screenX, screenY) {
  const worldX = screenX / state.zoom - state.cameraX;
  const worldY = screenY / state.zoom - state.cameraY + state.activeLayerIndex * LAYER_HEIGHT_PX;
  const gx = (worldY / ISO_HALF_H + worldX / ISO_HALF_W) / 2;
  const gy = (worldY / ISO_HALF_H - worldX / ISO_HALF_W) / 2;
  const tileX = Math.floor(gx);
  const tileY = Math.floor(gy);
  if (tileX < 0 || tileY < 0 || tileX >= GRID_WIDTH || tileY >= GRID_HEIGHT) return null;
  return { x: tileX, y: tileY };
}

function render() {
  renderWorld(true, true, true);
  requestAnimationFrame(render);
}

function renderWorld(drawGrid = true, drawHover = true, drawPointerOverlay = true) {
  worldCtx.setTransform(1, 0, 0, 1, 0, 0);
  worldCtx.fillStyle = state.canvasBgColor;
  worldCtx.fillRect(0, 0, worldCanvas.width, worldCanvas.height);
  worldCtx.setTransform(state.zoom, 0, 0, state.zoom, 0, 0);
  for (let row = 0; row < GRID_HEIGHT; row += 1) {
    for (let col = 0; col < GRID_WIDTH; col += 1) {
      const screen = gridToScreen(col, row);
      for (let layer = 0; layer < state.layers.length; layer += 1) {
        const isNonActiveLayer = layer !== state.activeLayerIndex;
        if (state.isolateLayer && state.hideIsolated && isNonActiveLayer) {
          continue;
        }
        if (drawGrid && layer === state.activeLayerIndex) {
          worldCtx.globalAlpha = 1;
          drawGridCellAt(col, row);
        }
        const isGhosted = state.isolateLayer && isNonActiveLayer;
        worldCtx.globalAlpha = isGhosted ? GHOST_LAYER_ALPHA : 1;
        const dx = screen.x + state.cameraX - ISO_HALF_W;
        const dy = screen.y + state.cameraY - 16 - layer * LAYER_HEIGHT_PX;
        drawTileIndex(state.layers[layer][row][col], dx, dy);
        const isHoverTile =
          drawHover &&
          state.hoverTile &&
          state.hoverTile.x === col &&
          state.hoverTile.y === row &&
          layer === state.activeLayerIndex;
        if (isHoverTile) {
          worldCtx.globalAlpha = 1;
          drawHoverPreviewAt(col, row, layer);
        }
      }
    }
  }
  worldCtx.globalAlpha = 1;
  worldCtx.setTransform(1, 0, 0, 1, 0, 0);
  if (drawPointerOverlay) drawPointer();
}

function drawGridCellAt(x, y) {
  const layerOffsetY = state.activeLayerIndex * LAYER_HEIGHT_PX;
  const s = gridToScreen(x, y);
  const cx = s.x + state.cameraX;
  const cy = s.y + state.cameraY - layerOffsetY;
  worldCtx.save();
  worldCtx.strokeStyle = "rgba(45, 70, 53, 0.18)";
  worldCtx.lineWidth = 1;
  worldCtx.beginPath();
  worldCtx.moveTo(cx, cy);
  worldCtx.lineTo(cx + ISO_HALF_W, cy + ISO_HALF_H);
  worldCtx.lineTo(cx, cy + ISO_TILE_HEIGHT);
  worldCtx.lineTo(cx - ISO_HALF_W, cy + ISO_HALF_H);
  worldCtx.closePath();
  worldCtx.stroke();
  worldCtx.restore();
}

function drawHoverPreviewAt(tileX, tileY, layerIndex) {
  const s = gridToScreen(tileX, tileY);
  const dx = s.x + state.cameraX - ISO_HALF_W;
  const dy = s.y + state.cameraY - 16 - layerIndex * LAYER_HEIGHT_PX;
  const cx = s.x + state.cameraX;
  const cy = s.y + state.cameraY - layerIndex * LAYER_HEIGHT_PX;
  worldCtx.save();

  // Back edges first so they sit behind the preview tile and show through transparency.
  worldCtx.strokeStyle = "rgba(112, 214, 123, 0.55)";
  worldCtx.lineWidth = 2;
  worldCtx.beginPath();
  worldCtx.moveTo(cx, cy);
  worldCtx.lineTo(cx - ISO_HALF_W, cy + ISO_HALF_H);
  worldCtx.moveTo(cx, cy);
  worldCtx.lineTo(cx + ISO_HALF_W, cy + ISO_HALF_H);
  worldCtx.stroke();

  drawTileIndex(state.selectedTile, dx, dy);

  // Front edges last so placement remains clearly readable.
  worldCtx.strokeStyle = "rgba(112, 214, 123, 0.95)";
  worldCtx.lineWidth = 2;
  worldCtx.beginPath();
  worldCtx.moveTo(cx - ISO_HALF_W, cy + ISO_HALF_H);
  worldCtx.lineTo(cx, cy + ISO_TILE_HEIGHT);
  worldCtx.moveTo(cx + ISO_HALF_W, cy + ISO_HALF_H);
  worldCtx.lineTo(cx, cy + ISO_TILE_HEIGHT);
  worldCtx.stroke();
  worldCtx.restore();
}

function drawPointer() {
  if (state.pointerX === null || state.pointerY === null) return;
  worldCtx.save();
  worldCtx.fillStyle = "rgba(35, 48, 39, 0.9)";
  worldCtx.strokeStyle = "rgba(246, 250, 239, 0.95)";
  worldCtx.lineWidth = 1;
  worldCtx.beginPath();
  worldCtx.arc(state.pointerX, state.pointerY, 2.5, 0, Math.PI * 2);
  worldCtx.fill();
  worldCtx.stroke();
  worldCtx.restore();
}

function updateSaveStatus(message, isError = false) {
  if (!saveStatusEl) return;
  clearTimeout(saveStatusTimer);
  saveStatusEl.textContent = message;
  saveStatusEl.style.color = isError ? "#7a2b2b" : "";
  if (!message) return;
  saveStatusTimer = setTimeout(() => {
    saveStatusEl.textContent = "";
  }, 15000);
}

function closeConfirm(result) {
  if (!confirmModalEl || !confirmResolve) return;
  confirmModalEl.hidden = true;
  const resolve = confirmResolve;
  confirmResolve = null;
  resolve(result);
}

function requestConfirm(message) {
  if (!confirmModalEl || !confirmMessageEl || !confirmYesBtn || !confirmNoBtn) {
    return Promise.resolve(true);
  }
  if (confirmResolve) closeConfirm(false);
  confirmMessageEl.textContent = message;
  confirmModalEl.hidden = false;
  confirmNoBtn.focus();
  return new Promise((resolve) => {
    confirmResolve = resolve;
  });
}

function setZoom(nextZoom, pivotX = worldCanvas.width * 0.5, pivotY = worldCanvas.height * 0.5) {
  const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
  // Snap to exact 10% increments relative to default to avoid float drift in the label.
  const stepsFromDefault = Math.round((clamped - DEFAULT_ZOOM) / ZOOM_STEP);
  const snapped = DEFAULT_ZOOM + stepsFromDefault * ZOOM_STEP;
  const normalized = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, snapped));
  if (Math.abs(normalized - state.zoom) < 1e-9) {
    updateZoomLabel();
    return;
  }
  const worldBeforeX = pivotX / state.zoom - state.cameraX;
  const worldBeforeY = pivotY / state.zoom - state.cameraY;
  state.zoom = normalized;
  state.cameraX = pivotX / state.zoom - worldBeforeX;
  state.cameraY = pivotY / state.zoom - worldBeforeY;
  updateZoomLabel();
}

function emptyMap() {
  state.layers = [createEmptyLayer()];
  state.activeLayerIndex = 0;
  updateLayerLabel();
}

function setSelectedTile(index) {
  state.selectedTile = Math.max(0, Math.min(index, VALID_TILE_COUNT - 1));
  const old = paletteEl.querySelector("button.active");
  if (old) old.classList.remove("active");
  const next = paletteEl.querySelector(`button[data-index="${state.selectedTile}"]`);
  if (next) next.classList.add("active");
}

function resetEditorState() {
  emptyMap();
  setSelectedTile(0);
  state.isolateLayer = false;
  state.hideIsolated = false;
  state.hoverTile = null;
  state.pointerX = null;
  state.pointerY = null;
  state.zoom = DEFAULT_ZOOM;
  state.canvasBgColor = DEFAULT_CANVAS_BG;
  updateIsolateButton();
  updateHideIsolatedButton();
  updateHoverCoordLabel();
  updateBgColorInput();
  clearHistory();
  resetCameraToCenter();
}

function buildSnapshot() {
  return {
    version: 1,
    gridWidth: GRID_WIDTH,
    gridHeight: GRID_HEIGHT,
    layerHeightPx: LAYER_HEIGHT_PX,
    canvasBgColor: state.canvasBgColor,
    activeLayerIndex: state.activeLayerIndex,
    layers: state.layers
  };
}

function isValidSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return false;
  if (!Array.isArray(snapshot.layers) || snapshot.layers.length < 1) return false;
  if (
    snapshot.canvasBgColor !== undefined &&
    !/^#[0-9a-fA-F]{6}$/.test(snapshot.canvasBgColor)
  ) {
    return false;
  }
  const snapshotHeight = Number.isInteger(snapshot.gridHeight) ? snapshot.gridHeight : null;
  const snapshotWidth = Number.isInteger(snapshot.gridWidth) ? snapshot.gridWidth : null;
  for (const layer of snapshot.layers) {
    if (!Array.isArray(layer) || layer.length < 1) return false;
    if (snapshotHeight !== null && layer.length !== snapshotHeight) return false;
    const expectedWidth = snapshotWidth ?? layer[0]?.length;
    if (!Number.isInteger(expectedWidth) || expectedWidth < 1) return false;
    for (const row of layer) {
      if (!Array.isArray(row) || row.length !== expectedWidth) return false;
      for (const tile of row) {
        const valid = tile === null || (Number.isInteger(tile) && tile >= 0 && tile < VALID_TILE_COUNT);
        if (!valid) return false;
      }
    }
  }
  return true;
}

function normalizeSnapshotLayers(snapshot) {
  const normalized = Array.from({ length: snapshot.layers.length }, () => createEmptyLayer());
  const sourceHeight = snapshot.layers[0].length;
  const sourceWidth = snapshot.layers[0][0].length;
  const copyHeight = Math.min(sourceHeight, GRID_HEIGHT);
  const copyWidth = Math.min(sourceWidth, GRID_WIDTH);
  for (let layer = 0; layer < snapshot.layers.length; layer += 1) {
    for (let y = 0; y < copyHeight; y += 1) {
      for (let x = 0; x < copyWidth; x += 1) {
        normalized[layer][y][x] = snapshot.layers[layer][y][x];
      }
    }
  }
  return normalized;
}

function applySnapshot(snapshot) {
  if (!isValidSnapshot(snapshot)) {
    throw new Error("Invalid map data");
  }
  state.layers = normalizeSnapshotLayers(snapshot);
  state.canvasBgColor = snapshot.canvasBgColor ?? DEFAULT_CANVAS_BG;
  state.activeLayerIndex = Math.max(
    0,
    Math.min(snapshot.activeLayerIndex ?? 0, state.layers.length - 1)
  );
  updateLayerLabel();
  updateBgColorInput();
  clearHistory();
}

function updateBgColorInput() {
  if (!bgColorInput) return;
  bgColorInput.value = state.canvasBgColor;
}

function updateZoomLabel() {
  if (!zoomLevelEl) return;
  const pct = Math.round((state.zoom / DEFAULT_ZOOM) * 100);
  const boundedPct = Math.max(100, Math.min(300, pct));
  zoomLevelEl.textContent = `${boundedPct}%`;
}

function setCanvasBgColor(value) {
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) return;
  state.canvasBgColor = value;
}

function saveToLocalStorage(isAuto = false) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(buildSnapshot()));
    if (isAuto) {
      updateSaveStatus("Autosaved.");
    } else {
      updateSaveStatus("Saved to this browser.");
    }
  } catch {
    updateSaveStatus("Save failed (storage limit or browser setting).", true);
  }
}

function tryLoadFromLocalStorage(isStartup = false) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      if (isStartup) {
        updateSaveStatus("No local save found. Start building.");
      } else {
        updateSaveStatus("No local save found.");
      }
      return false;
    }
    const parsed = JSON.parse(raw);
    applySnapshot(parsed);
    updateSaveStatus("Loaded local save.");
    return true;
  } catch {
    updateSaveStatus("Could not load save (data is invalid).", true);
    return false;
  }
}

function queueAutoSave() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => saveToLocalStorage(true), SAVE_DEBOUNCE_MS);
}

function clearHistory() {
  activeStroke = null;
  undoStack.length = 0;
  redoStack.length = 0;
  updateUndoButtonState();
}

function startStroke() {
  activeStroke = { changes: new Map() };
}

function commitStroke() {
  if (!activeStroke) return;
  const changes = Array.from(activeStroke.changes.values()).filter(
    (change) => change.before !== change.after
  );
  activeStroke = null;
  if (changes.length === 0) return;
  undoStack.push(changes);
  if (undoStack.length > MAX_UNDO_STEPS) undoStack.shift();
  redoStack.length = 0;
  updateUndoButtonState();
  queueAutoSave();
}

function undoLastStroke() {
  const stroke = undoStack.pop();
  if (!stroke) {
    updateUndoButtonState();
    updateSaveStatus("Nothing to undo.");
    return;
  }
  for (let i = stroke.length - 1; i >= 0; i -= 1) {
    const change = stroke[i];
    state.layers[change.layer][change.y][change.x] = change.before;
  }
  redoStack.push(stroke);
  updateUndoButtonState();
  queueAutoSave();
  updateSaveStatus("Undo applied.");
}

function updateUndoButtonState() {
  if (!undoStrokeBtn) return;
  const canUndo = undoStack.length > 0;
  undoStrokeBtn.disabled = !canUndo;
  undoStrokeBtn.title = canUndo ? "Undo last stroke" : "No undo states available";
}

function updateHoverCoordLabel() {
  if (!hoverCoordEl) return;
  if (!state.hoverTile) {
    hoverCoordEl.textContent = "x: -, y: -";
    return;
  }
  hoverCoordEl.textContent = `x: ${state.hoverTile.x}, y: ${state.hoverTile.y}`;
}

function paintAt(tilePos, erase = false) {
  if (!tilePos) return;
  const layer = state.activeLayerIndex;
  const current = state.layers[layer][tilePos.y][tilePos.x];
  const next = erase ? DEFAULT_TERRAIN_TILE : state.selectedTile;
  if (current === next) return;
  if (!activeStroke) startStroke();
  const key = `${layer}:${tilePos.x}:${tilePos.y}`;
  let change = activeStroke.changes.get(key);
  if (!change) {
    change = {
      layer,
      x: tilePos.x,
      y: tilePos.y,
      before: current,
      after: next
    };
    activeStroke.changes.set(key, change);
  } else {
    change.after = next;
  }
  state.layers[layer][tilePos.y][tilePos.x] = next;
}

function setupPalette() {
  paletteEl.innerHTML = "";
  for (let i = 0; i < VALID_TILE_COUNT; i += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", `Tile ${i}`);
    button.title = `Select tile ${i}`;
    button.dataset.index = String(i);
    if (i === state.selectedTile) button.classList.add("active");

    const preview = document.createElement("canvas");
    preview.width = TILE_SIZE;
    preview.height = TILE_SIZE;
    const pctx = preview.getContext("2d");
    pctx.imageSmoothingEnabled = false;
    const { sx, sy } = tileIndexToSheetXY(i);
    pctx.drawImage(spritesheet, sx, sy, TILE_SIZE, TILE_SIZE, 0, 0, TILE_SIZE, TILE_SIZE);

    button.append(preview);
    button.addEventListener("click", () => {
      setSelectedTile(i);
    });
    paletteEl.append(button);
  }
}

function updateLayerLabel() {
  layerLabelEl.textContent = `Current ${state.activeLayerIndex + 1} of ${state.layers.length}`;
  const canRemoveLayer = state.layers.length > 1;
  layerRemoveBtn.disabled = !canRemoveLayer;
  layerRemoveBtn.title = canRemoveLayer
    ? "Delete current layer"
    : "Cannot remove the only remaining layer";
}

function updateIsolateButton() {
  layerIsolateBtn.textContent = state.isolateLayer ? "Isolate: On" : "Isolate: Off";
  layerIsolateBtn.classList.toggle("is-active", state.isolateLayer);
}

function updateHideIsolatedButton() {
  const enabled = state.isolateLayer;
  layerHideIsolatedBtn.disabled = !enabled;
  if (!enabled) {
    layerHideIsolatedBtn.textContent = "Hide Isolated: Off";
    layerHideIsolatedBtn.classList.remove("is-active");
    layerHideIsolatedBtn.title = "Enable Isolate first to use this";
    return;
  }
  layerHideIsolatedBtn.textContent = state.hideIsolated
    ? "Hide Isolated: On"
    : "Hide Isolated: Off";
  layerHideIsolatedBtn.classList.toggle("is-active", state.hideIsolated);
  layerHideIsolatedBtn.title = "Hide non-active layers while isolate is on";
}

layerPrevBtn.addEventListener("click", () => {
  state.activeLayerIndex = Math.max(0, state.activeLayerIndex - 1);
  updateLayerLabel();
});

layerNextBtn.addEventListener("click", () => {
  state.activeLayerIndex = Math.min(state.layers.length - 1, state.activeLayerIndex + 1);
  updateLayerLabel();
});

layerAddBtn.addEventListener("click", () => {
  if (state.layers.length >= MAX_LAYERS) return;
  state.layers.push(createEmptyLayer());
  state.activeLayerIndex = state.layers.length - 1;
  updateLayerLabel();
  queueAutoSave();
});

layerRemoveBtn.addEventListener("click", async () => {
  const confirmed = await requestConfirm(
    "Remove the current layer? This action cannot be undone with layer restore."
  );
  if (!confirmed) return;
  if (state.layers.length <= 1) return;
  state.layers.splice(state.activeLayerIndex, 1);
  state.activeLayerIndex = Math.min(state.activeLayerIndex, state.layers.length - 1);
  updateLayerLabel();
  queueAutoSave();
});

layerIsolateBtn.addEventListener("click", () => {
  state.isolateLayer = !state.isolateLayer;
  if (!state.isolateLayer) state.hideIsolated = false;
  updateIsolateButton();
  updateHideIsolatedButton();
});

layerHideIsolatedBtn.addEventListener("click", () => {
  if (!state.isolateLayer) return;
  state.hideIsolated = !state.hideIsolated;
  updateHideIsolatedButton();
});

updateLayerLabel();
updateIsolateButton();
updateHideIsolatedButton();
updateBgColorInput();
updateUndoButtonState();
updateZoomLabel();

undoStrokeBtn.addEventListener("click", () => {
  undoLastStroke();
});

saveMapBtn.addEventListener("click", () => {
  saveToLocalStorage(false);
});

loadMapBtn.addEventListener("click", () => {
  tryLoadFromLocalStorage(false);
});

newMapBtn.addEventListener("click", async () => {
  const confirmed = await requestConfirm(
    "Start a new map and reset the editor? Unsaved in-memory changes will be cleared."
  );
  if (!confirmed) {
    updateSaveStatus("New map canceled.");
    return;
  }
  clearTimeout(autoSaveTimer);
  resetEditorState();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Continue with fresh save even if remove fails.
  }
  saveToLocalStorage(false);
  updateSaveStatus("Started a new map, reset view/tools, and saved it.");
});

exportMapBtn.addEventListener("click", () => {
  try {
    const payload = JSON.stringify(buildSnapshot(), null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "relaxing-isometric-map.json";
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    updateSaveStatus("Exported map JSON.");
  } catch {
    updateSaveStatus("Export failed.", true);
  }
});

exportImageBtn.addEventListener("click", () => {
  try {
    renderWorld(false, false, false);
    const a = document.createElement("a");
    a.href = worldCanvas.toDataURL("image/png");
    a.download = "relaxing-isometric-map.png";
    document.body.append(a);
    a.click();
    a.remove();
    updateSaveStatus("Exported PNG image (grid hidden).");
  } catch {
    updateSaveStatus("Image export failed.", true);
  } finally {
    renderWorld(true, true, true);
  }
});

importMapBtn.addEventListener("click", () => {
  importFileInput.click();
});

importFileInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    applySnapshot(parsed);
    saveToLocalStorage(false);
    updateSaveStatus("Imported map and saved locally.");
  } catch {
    updateSaveStatus("Import failed (invalid JSON map file).", true);
  } finally {
    importFileInput.value = "";
  }
});

zoomOutBtn.addEventListener("click", () => {
  setZoom(state.zoom - ZOOM_STEP);
});

zoomInBtn.addEventListener("click", () => {
  setZoom(state.zoom + ZOOM_STEP);
});

bgColorInput.addEventListener("input", (event) => {
  setCanvasBgColor(event.target.value);
  queueAutoSave();
});

worldCanvas.addEventListener("contextmenu", (event) => event.preventDefault());

worldCanvas.addEventListener("pointerdown", (event) => {
  worldCanvas.setPointerCapture(event.pointerId);
  state.pointerX = event.offsetX;
  state.pointerY = event.offsetY;
  if (event.button === 1) {
    state.isPanning = true;
    state.panStartX = event.clientX;
    state.panStartY = event.clientY;
    state.cameraStartX = state.cameraX;
    state.cameraStartY = state.cameraY;
    return;
  }
  const tilePos = screenToGrid(event.offsetX, event.offsetY);
  const erase = event.button === 2;
  state.isPainting = event.button === 0 || event.button === 2;
  if (state.isPainting) startStroke();
  paintAt(tilePos, erase);
});

worldCanvas.addEventListener("pointermove", (event) => {
  state.pointerX = event.offsetX;
  state.pointerY = event.offsetY;
  state.hoverTile = screenToGrid(event.offsetX, event.offsetY);
  updateHoverCoordLabel();
  if (state.isPanning) {
    state.cameraX = state.cameraStartX + (event.clientX - state.panStartX) / state.zoom;
    state.cameraY = state.cameraStartY + (event.clientY - state.panStartY) / state.zoom;
    return;
  }
  if (!state.isPainting) return;
  const erase = event.buttons === 2;
  paintAt(state.hoverTile, erase);
});

worldCanvas.addEventListener("pointerup", () => {
  if (state.isPainting) commitStroke();
  state.isPainting = false;
  state.isPanning = false;
});

worldCanvas.addEventListener("pointerleave", () => {
  if (state.isPainting) commitStroke();
  state.isPainting = false;
  state.isPanning = false;
  state.hoverTile = null;
  state.pointerX = null;
  state.pointerY = null;
  updateHoverCoordLabel();
});

window.addEventListener("resize", () => {
  resetCameraToCenter();
});

worldCanvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    setZoom(state.zoom + direction * ZOOM_STEP, event.offsetX, event.offsetY);
  },
  { passive: false }
);

window.addEventListener("keydown", (event) => {
  if (!confirmModalEl.hidden && event.key === "Escape") {
    event.preventDefault();
    closeConfirm(false);
    return;
  }
  const isUndo = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z";
  if (!isUndo) return;
  event.preventDefault();
  undoLastStroke();
});

confirmYesBtn?.addEventListener("click", () => closeConfirm(true));
confirmNoBtn?.addEventListener("click", () => closeConfirm(false));
confirmModalEl?.addEventListener("click", (event) => {
  if (event.target === confirmModalEl) closeConfirm(false);
});
