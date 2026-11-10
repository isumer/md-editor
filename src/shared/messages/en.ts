export type MessageKey =
  | "request.invalid"
  | "grant.invalid"
  | "file.workerRestarted"
  | "file.outOfSync"
  | "sender.forbidden"
  | "link.invalid"
  | "link.unsupportedScheme"
  | "file.notFound"
  | "file.isDirectory"
  | "file.permissionDenied"
  | "file.diskFull"
  | "file.conflict"
  | "file.tooLarge"
  | "file.binary"
  | "file.alreadyOpen"
  | "file.openInFlight"
  | "file.saveInFlight"
  | "file.unknown"
  | "menu.file"
  | "menu.open"
  | "menu.save"
  | "menu.saveAs"
  | "menu.undo"
  | "menu.redo"
  | "merge.left"
  | "merge.result"
  | "merge.right"
  | "merge.conflict"
  | "merge.conflictLeft"
  | "merge.conflictsLeft"
  | "merge.accept.left"
  | "merge.accept.right"
  | "merge.accept.both"
  | "menu.viewSplit"
  | "menu.viewEditor"
  | "menu.viewPreview"
  | "menu.syncScroll"
  | "menu.focusMode"
  | "tab.close"
  | "tab.unsaved"
  | "close.cancel"
  | "close.discard"
  | "close.save"
  | "close.dirtyFile"
  | "close.dirtyDocuments"
  | "preview.workerRestarted"
  | "draft.recovered";

export const messages: Readonly<Record<MessageKey, string>> = {
  "request.invalid": "The request was not valid.",
  "grant.invalid": "The file permission is no longer valid.",
  "file.workerRestarted": "Could not save “{file}”: the file service restarted. Try again.",
  "file.outOfSync": "Could not save “{file}”: the file service lost track of the document. Try again.",
  "sender.forbidden": "This frame is not allowed to use application services.",
  "link.invalid": "The link is not a valid URL.",
  "link.unsupportedScheme": "This kind of link cannot be opened.",
  "file.notFound": "Could not access “{file}”: it was not found.",
  "file.isDirectory": "Could not open “{file}”: it is a folder.",
  "file.permissionDenied": "Could not access “{file}”: permission was denied.",
  "file.diskFull": "Could not save “{file}”: the disk is full.",
  "file.conflict": "Could not save “{file}”: it changed on disk.",
  "file.tooLarge": "Could not access “{file}”: it is too large.",
  "file.binary": "Could not open “{file}”: it is a binary file.",
  "file.alreadyOpen": "{file} is open in another tab. Close it first or choose another name.",
  "file.openInFlight": "Could not open “{file}”: another tab is saving it. Try again.",
  "file.saveInFlight": "Could not save “{file}”: another tab is saving it. Try again.",
  "file.unknown": "Could not access “{file}”: {reason}.",
  "menu.file": "File",
  "menu.open": "Open",
  "menu.save": "Save",
  "menu.saveAs": "Save As",
  "menu.undo": "Undo",
  "menu.redo": "Redo",
  "merge.left": "Left",
  "merge.result": "Result",
  "merge.right": "Right",
  "merge.conflict": "Conflict {number}",
  "merge.conflictLeft": "{count} conflict left",
  "merge.conflictsLeft": "{count} conflicts left",
  "merge.accept.left": "← Left",
  "merge.accept.right": "Right →",
  "merge.accept.both": "Both",
  "menu.viewSplit": "Split View",
  "menu.viewEditor": "Editor Only",
  "menu.viewPreview": "Preview Only",
  "menu.syncScroll": "Sync Scroll",
  "menu.focusMode": "Focus Mode",
  "tab.close": "Close {file}",
  "tab.unsaved": "Unsaved changes",
  "close.cancel": "Cancel",
  "close.discard": "Discard",
  "close.save": "Save",
  "close.dirtyFile": "“{file}” has unsaved changes. Save before closing?",
  "close.dirtyDocuments": "These documents have unsaved changes: {files}",
  "preview.workerRestarted": "The preview stopped responding. It was restarted.",
  "draft.recovered": "Recovered unsaved text for “{file}”.",
};

export function formatMessage(
  key: MessageKey,
  params: Readonly<Record<string, string>>,
): string {
  return messages[key].replace(/\{([^}]+)\}/g, (placeholder, name: string) =>
    params[name] ?? placeholder);
}
