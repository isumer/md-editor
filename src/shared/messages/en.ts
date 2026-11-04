export type MessageKey =
  | "request.invalid"
  | "grant.invalid"
  | "sender.forbidden"
  | "link.invalid"
  | "link.unsupportedScheme"
  | "file.notFound"
  | "file.isDirectory"
  | "file.permissionDenied"
  | "file.diskFull"
  | "file.conflict"
  | "file.tooLarge"
  | "file.unknown";

export const messages: Readonly<Record<MessageKey, string>> = {
  "request.invalid": "The request was not valid.",
  "grant.invalid": "The file permission is no longer valid.",
  "sender.forbidden": "This frame is not allowed to use application services.",
  "link.invalid": "The link is not a valid URL.",
  "link.unsupportedScheme": "This kind of link cannot be opened.",
  "file.notFound": "Could not access “{file}”: it was not found.",
  "file.isDirectory": "Could not open “{file}”: it is a folder.",
  "file.permissionDenied": "Could not access “{file}”: permission was denied.",
  "file.diskFull": "Could not save “{file}”: the disk is full.",
  "file.conflict": "Could not save “{file}”: it changed on disk.",
  "file.tooLarge": "Could not access “{file}”: it is too large.",
  "file.unknown": "Could not access “{file}”: {reason}.",
};

export function formatMessage(
  key: MessageKey,
  params: Readonly<Record<string, string>>,
): string {
  return messages[key].replace(/\{([^}]+)\}/g, (placeholder, name: string) =>
    params[name] ?? placeholder);
}
