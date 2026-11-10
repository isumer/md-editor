import type {
  FeatureContext,
  FeatureHooks,
  FeatureRegistration,
  FeatureRewriteContext,
  InstalledFeatures,
} from "../editor/featureWiring";
import * as featureList from "./list";

const registrations: readonly FeatureRegistration[] = Object.values(featureList);

export const featureEditorExtensions = registrations.flatMap(
  (registration) => registration.editorExtensions,
);

export function rewriteFeatureHtml(
  html: string,
  context: FeatureRewriteContext,
): string {
  return registrations.reduce(
    (result, registration) => registration.rewriteHtml?.(result, context) ?? result,
    html,
  );
}

function callHooks(
  hooks: readonly FeatureHooks[],
  call: (hook: FeatureHooks) => void,
): void {
  for (const hook of hooks) call(hook);
}

function runCommand(hooks: readonly FeatureHooks[], commandId: string): void {
  for (const hook of hooks) {
    const command = hook.commands?.[commandId];
    if (command !== undefined) {
      command();
      return;
    }
  }
}

export function installFeatures(context: FeatureContext): InstalledFeatures {
  const hooks = registrations.map((registration) => registration.create(context));
  return {
    start: () => callHooks(hooks, (hook) => hook.start?.()),
    documentActivated: (document) =>
      callHooks(hooks, (hook) => hook.documentActivated?.(document)),
    documentCreated: (document, source) =>
      callHooks(hooks, (hook) => hook.documentCreated?.(document, source)),
    documentRemoved: (documentId) =>
      callHooks(hooks, (hook) => hook.documentRemoved?.(documentId)),
    documentStateChanged: (documentId, state) =>
      callHooks(hooks, (hook) => hook.documentStateChanged?.(documentId, state)),
    runCommand: (commandId) => runCommand(hooks, commandId),
  };
}
