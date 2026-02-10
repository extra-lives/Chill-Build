# Relaxing Isometric Builder

A browser-based isometric building sandbox built with vanilla JavaScript, HTML, and SCSS.  
This project lets you paint tiles from a spritesheet onto a layered isometric grid for casual worldbuilding and scene composition.

## What It Does

- Paints isometric 32x32 tiles from a single spritesheet palette.
- Supports multiple stacked build layers with adjustable active layer.
- Provides isolate tools:
  - Ghost non-active layers.
  - Optionally hide non-active layers while isolating.
- Includes live placement preview with depth-aware outlines.
- Supports zoom controls (10% increments), middle-mouse panning, and hover coordinates.
- Includes local persistence:
  - Save/load with `localStorage`
  - JSON import/export
  - PNG image export (without grid)
- Includes per-stroke undo.

## Controls

- `Left Click`: Paint tile
- `Right Click`: Erase tile on active layer
- `Middle Mouse Drag`: Pan camera
- `Mouse Wheel` or `Zoom +/-`: Zoom view
- `Ctrl+Z` / `Cmd+Z`: Undo last stroke

## Notes

- The map uses a 30x30 isometric grid.
- Layer spacing and isolate opacity are configurable in `scripts.js`.
