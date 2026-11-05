import type { MessageKey } from "../../shared/messages/en";
import { evaluateWhen, type ContextKeyService } from "./contextKeys";

export type CommandTarget = string | undefined;

export interface CommandContext {
  readonly contextKeys: ContextKeyService;
}

export interface Command {
  readonly id: string;
  readonly titleKey: MessageKey;
  readonly when?: string;
  run(
    ctx: CommandContext,
    args: unknown,
    target: CommandTarget,
  ): void | Promise<void>;
}

export interface CommandRegistry {
  register(command: Command): () => void;
  get(id: string): Command | undefined;
  list(): readonly Command[];
  run(
    id: string,
    ctx: CommandContext,
    args?: unknown,
    target?: CommandTarget,
  ): Promise<boolean>;
}

export function createCommandRegistry(): CommandRegistry {
  const commands = new Map<string, Command>();

  return {
    register(command) {
      if (commands.has(command.id)) {
        throw new Error(`Duplicate command id: ${command.id}`);
      }
      commands.set(command.id, command);
      return () => {
        if (commands.get(command.id) === command) {
          commands.delete(command.id);
        }
      };
    },
    get: (id) => commands.get(id),
    list: () => [...commands.values()],
    async run(id, ctx, args, target) {
      const command = commands.get(id);
      if (command === undefined) {
        return false;
      }
      if (command.when !== undefined &&
        !evaluateWhen(command.when, ctx.contextKeys.get())) {
        return false;
      }
      await command.run(ctx, args, target);
      return true;
    },
  };
}
