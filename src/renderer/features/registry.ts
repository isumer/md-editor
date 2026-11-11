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

export interface DeferredInstalledFeatures extends InstalledFeatures {
  installDeferred(registrations: readonly FeatureRegistration[]): void;
}

export function installFeatures(context: FeatureContext): DeferredInstalledFeatures {
  const installed = new Set(registrations);
  const hooks = registrations.map((registration) => registration.create(context));
  let started = false;
  const installDeferred = (
    deferred: readonly FeatureRegistration[],
  ): void => {
    const additions = deferred.filter((registration) => !installed.has(registration));
    for (const registration of additions) installed.add(registration);
    const addedHooks = additions.map((registration) => registration.create(context));
    hooks.push(...addedHooks);
    if (started) callHooks(addedHooks, (hook) => hook.start?.());
    for (const document of context.documents()) {
      const source = document.state.doc.toString();
      callHooks(addedHooks, (hook) => hook.documentCreated?.(document, source));
      if (context.isActive(document)) {
        callHooks(addedHooks, (hook) => hook.documentActivated?.(document));
      }
    }
  };
  return {
    start: () => {
      if (started) return;
      started = true;
      callHooks(hooks, (hook) => hook.start?.());
    },
    installDeferred,
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
