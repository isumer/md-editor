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
  | "file.unknown"
  | "menu.file"
  | "menu.open"
  | "menu.save"
  | "menu.saveAs"
  | "menu.undo"
  | "menu.redo"
  | "menu.view"
  | "menu.viewSplit"
  | "menu.viewEditor"
  | "menu.viewPreview"
  | "menu.resetDivider"
  | "menu.fullScreen"
  | "menu.focusMode"
  | "menu.exitFocusMode"
  | "menu.syncScroll";

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
  "file.unknown": "Could not access “{file}”: {reason}.",
  "menu.file": "File",
  "menu.open": "Open",
  "menu.save": "Save",
  "menu.saveAs": "Save As",
  "menu.undo": "Undo",
  "menu.redo": "Redo",
  "menu.view": "View",
  "menu.viewSplit": "Split",
  "menu.viewEditor": "Editor Only",
  "menu.viewPreview": "Preview Only",
  "menu.resetDivider": "Reset Divider",
  "menu.fullScreen": "Full Screen",
  "menu.focusMode": "Focus Mode",
  "menu.exitFocusMode": "Exit Focus Mode",
  "menu.syncScroll": "Sync Scroll",
};

export function formatMessage(
  key: MessageKey,
  params: Readonly<Record<string, string>>,
): string {
  return messages[key].replace(/\{([^}]+)\}/g, (placeholder, name: string) =>
    params[name] ?? placeholder);
}
