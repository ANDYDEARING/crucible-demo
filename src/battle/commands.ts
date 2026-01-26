/**
 * battle/commands.ts
 *
 * Command pattern for battle actions.
 * Commands are pure data objects that can be serialized for multiplayer sync.
 * Execution is handled by the BattleScene through a CommandExecutor interface.
 */

// =============================================================================
// COMMAND TYPES
// =============================================================================

/** Base command with type discriminator */
interface BaseCommand {
  type: string;
}

/** Move to a target tile */
export interface MoveCommand extends BaseCommand {
  type: "move";
  targetX: number;
  targetZ: number;
}

/** Attack a target unit */
export interface AttackCommand extends BaseCommand {
  type: "attack";
  targetUnitId: string;
}

/** Heal a target unit (self or ally) */
export interface HealCommand extends BaseCommand {
  type: "heal";
  targetUnitId: string;
}

/** Toggle conceal ability */
export interface ConcealCommand extends BaseCommand {
  type: "conceal";
}

/** Toggle cover ability */
export interface CoverCommand extends BaseCommand {
  type: "cover";
}

/** Union of all command types */
export type BattleCommand =
  | MoveCommand
  | AttackCommand
  | HealCommand
  | ConcealCommand
  | CoverCommand;

// =============================================================================
// COMMAND FACTORIES
// =============================================================================

/** Create a move command */
export function createMoveCommand(targetX: number, targetZ: number): MoveCommand {
  return { type: "move", targetX, targetZ };
}

/** Create an attack command */
export function createAttackCommand(targetUnitId: string): AttackCommand {
  return { type: "attack", targetUnitId };
}

/** Create a heal command */
export function createHealCommand(targetUnitId: string): HealCommand {
  return { type: "heal", targetUnitId };
}

/** Create a conceal command */
export function createConcealCommand(): ConcealCommand {
  return { type: "conceal" };
}

/** Create a cover command */
export function createCoverCommand(): CoverCommand {
  return { type: "cover" };
}

// =============================================================================
// COMMAND QUEUE
// =============================================================================

/**
 * Immutable command queue for managing pending actions.
 * Supports queue, dequeue, undo operations.
 */
export class CommandQueue {
  private commands: BattleCommand[] = [];

  /** Get all queued commands */
  getCommands(): readonly BattleCommand[] {
    return this.commands;
  }

  /** Get number of queued commands */
  get length(): number {
    return this.commands.length;
  }

  /** Check if queue is empty */
  isEmpty(): boolean {
    return this.commands.length === 0;
  }

  /** Add a command to the queue */
  enqueue(command: BattleCommand): void {
    this.commands.push(command);
  }

  /** Remove and return the first command */
  dequeue(): BattleCommand | undefined {
    return this.commands.shift();
  }

  /** Remove and return the last command (for undo) */
  pop(): BattleCommand | undefined {
    return this.commands.pop();
  }

  /** Peek at the first command without removing */
  peek(): BattleCommand | undefined {
    return this.commands[0];
  }

  /** Peek at the last command without removing */
  peekLast(): BattleCommand | undefined {
    return this.commands[this.commands.length - 1];
  }

  /** Clear all commands */
  clear(): void {
    this.commands = [];
  }

  /** Check if queue has a command of a specific type */
  hasCommandOfType(type: BattleCommand["type"]): boolean {
    return this.commands.some(c => c.type === type);
  }

  /** Get the last move command (for determining effective position) */
  getLastMoveCommand(): MoveCommand | undefined {
    for (let i = this.commands.length - 1; i >= 0; i--) {
      if (this.commands[i].type === "move") {
        return this.commands[i] as MoveCommand;
      }
    }
    return undefined;
  }

  /** Serialize queue to JSON (for multiplayer sync) */
  toJSON(): BattleCommand[] {
    return [...this.commands];
  }

  /** Deserialize queue from JSON */
  static fromJSON(data: BattleCommand[]): CommandQueue {
    const queue = new CommandQueue();
    queue.commands = [...data];
    return queue;
  }
}

// =============================================================================
// COMMAND EXECUTOR INTERFACE
// =============================================================================

/**
 * Interface for executing commands.
 * Implemented by BattleScene to handle visual effects.
 */
export interface CommandExecutor {
  /** Execute a move command */
  executeMove(command: MoveCommand, onComplete: () => void): void;

  /** Execute an attack command */
  executeAttack(command: AttackCommand, onComplete: () => void): void;

  /** Execute a heal command */
  executeHeal(command: HealCommand, onComplete: () => void): void;

  /** Execute a conceal command */
  executeConceal(command: ConcealCommand, onComplete: () => void): void;

  /** Execute a cover command */
  executeCover(command: CoverCommand, onComplete: () => void): void;

  /** Called when all queued commands are complete */
  onQueueComplete(): void;

  /** Called after each action to check for reactions (cover fire, etc.) */
  checkReactions(onReactionComplete: () => void): boolean;
}

/**
 * Process a command queue using an executor.
 * Handles sequential execution with reaction checks.
 */
export function processCommandQueue(
  queue: CommandQueue,
  executor: CommandExecutor
): void {
  const commands = [...queue.getCommands()];
  queue.clear();

  function processNext(index: number): void {
    if (index >= commands.length) {
      executor.onQueueComplete();
      return;
    }

    const command = commands[index];
    const afterExecution = () => {
      // Check for reactions after each action
      const reactionTriggered = executor.checkReactions(() => {
        // Reaction complete - queue processing stops
        executor.onQueueComplete();
      });

      if (!reactionTriggered) {
        // No reaction, continue to next command
        processNext(index + 1);
      }
    };

    switch (command.type) {
      case "move":
        executor.executeMove(command, afterExecution);
        break;
      case "attack":
        executor.executeAttack(command, afterExecution);
        break;
      case "heal":
        executor.executeHeal(command, afterExecution);
        break;
      case "conceal":
        executor.executeConceal(command, afterExecution);
        break;
      case "cover":
        executor.executeCover(command, afterExecution);
        break;
    }
  }

  processNext(0);
}

// =============================================================================
// COMMAND VALIDATION
// =============================================================================

/** Validate a move command (basic bounds check) */
export function isValidMoveCommand(command: MoveCommand, gridSize: number): boolean {
  return (
    command.targetX >= 0 &&
    command.targetX < gridSize &&
    command.targetZ >= 0 &&
    command.targetZ < gridSize
  );
}

/** Get human-readable description of a command */
export function describeCommand(command: BattleCommand): string {
  switch (command.type) {
    case "move":
      return `Move to (${command.targetX}, ${command.targetZ})`;
    case "attack":
      return `Attack unit ${command.targetUnitId}`;
    case "heal":
      return `Heal unit ${command.targetUnitId}`;
    case "conceal":
      return "Activate Conceal";
    case "cover":
      return "Activate Cover";
  }
}
