# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

A tactical RPG prototype (FFT/Front Mission inspired) built to learn agentic AI workflows. Core philosophy: loadout building should be as engaging as battle itself.

## Commands

```bash
npm run dev      # Start dev server at localhost:5173
npm run build    # Type check + production build
npx tsc --noEmit # Type check only
```

## Technology Stack

- **Babylon.js** - 3D engine (rotatable isometric grid)
- **TypeScript** - Strict mode enabled
- **Vite** - Dev server and bundler
- **Mobile path**: Web → Capacitor → Babylon Native if needed

## Project Structure

```
/docs                    - Requirements and design documents
/src
  /scenes               - Babylon.js scene files (TitleScene, LoadoutScene, BattleScene)
  main.ts               - Entry point, engine setup
```

## Architecture Decisions

- **Scenes as functions**: Each screen (title, loadout, battle) is a function that creates and returns a Scene
- **No visual editor**: Everything is code for agentic development compatibility
- **GUI via @babylonjs/gui**: 2D UI overlays on 3D scenes

## Workflow Guidelines

When implementing features:
1. Document requirements in `/docs/requirements.md` first
2. Propose architecture options with trade-offs before major implementations
3. Start with minimal working prototype, iterate based on feedback
4. Keep the game playable at each stage

## Open Questions (see docs/requirements.md)

- Turn structure (full team vs alternating activations)
- Match-making approach
- Win conditions
- Unit variety for prototype

## Conversation Log

### 2026-01-21
- Started conversation logging in CLAUDE.md
- Added team color selector to LoadoutScene
  - 7 colors: Red, Orange, Blue, Green, Purple, Pink, Yellow
  - Each player can select their team color at the top of their panel
  - When one player selects a color, it's disabled (grayed out) for the other player
  - Team color updates the 3D model preview and panel border/title color
  - Colors stored in `Loadout.playerTeamColor` and `Loadout.enemyTeamColor`
