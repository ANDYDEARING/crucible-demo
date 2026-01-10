# Game Requirements

## Overview

A tactical RPG prototype inspired by Final Fantasy Tactics, Front Mission, and Warhammer. The core philosophy: **loadout building should be as engaging as the battle itself**.

## Target Platforms

- **Demo**: Web browser
- **Future**: Mobile via Capacitor → Babylon Native if needed

## Tech Stack

- **Engine**: Babylon.js
- **Language**: TypeScript
- **Build**: Vite
- **Multiplayer**: TBD (Colyseus, Supabase, or custom WebSocket)
- **Mobile**: Capacitor (later)

## Prototype Scope

### Screens

1. **Title Screen** - Entry point, play/options
2. **Loadout Screen** - Build and save team compositions
3. **Battle Screen** - The tactical grid combat

### Core Features (Prototype)

- [ ] Isometric 3D grid that can rotate (90° increments like FFT)
- [ ] Turn-based tactical combat (3v3)
- [ ] No character growth/progression (prototype limitation)
- [ ] Multiplayer from day one (2 players)
- [ ] Save/load/share loadouts between players

### Loadout System

Players build teams before battle. This is a core engagement loop, not just a menu.

- Units have stats, equipment, abilities
- Loadouts can be saved locally
- Loadouts can be shared (URL or code)
- Inspiration: CCG deckbuilding, Warhammer army lists

### Combat System

**Turn Structure:**
- Prototype: Fixed alternating turns (I go, you go)
- Future: Speed stat determines turn order, shown in UI widget on left side

**Win Condition:**
- Eliminate all enemy units

**Grid:**
- Larger grid (size TBD, needs to accommodate 3v3 with room to maneuver)
- Height/terrain elevation matters
- Camera should prevent viewing underside of map (future polish)

**Unit Types (3 for prototype):**
1. **Tank** - High HP, low damage, protects allies
2. **Damage** - High damage, fragile
3. **Support** - Healing/buffs, utility

### Camera Constraints (Future)

- Limit camera angle to prevent seeing under the map
- 90° rotation increments for clarity

## Non-Goals (Prototype)

- Single-player campaign/story
- Character progression/leveling
- AI opponents (multiplayer only for now)
- Audio/music
- Polish/juice

## Open Questions

1. ~~Turn structure: Full team moves, or alternating unit activations?~~ **Decided: I go, you go (speed-based later)**
2. How are matches made? Lobby? Direct invite?
3. ~~What's the win condition? Eliminate all units? Objectives?~~ **Decided: Eliminate all enemy units**
4. ~~Unit variety: How many unit types for prototype?~~ **Decided: 3 types (tank, damage, support), 3v3**
5. Grid size? (needs to fit 6 units with tactical space)
