import * as messageModules from "./messages/registry";

type MessageModules = typeof messageModules;
type ModuleName = keyof MessageModules;
type OtherKeys<Name extends ModuleName> = {
  [Other in Exclude<ModuleName, Name>]: keyof MessageModules[Other];
}[Exclude<ModuleName, Name>];
type DuplicateKeys = {
  [Name in ModuleName]: Extract<keyof MessageModules[Name], OtherKeys<Name>>;
}[ModuleName];
type UnionToIntersection<Union> = (
  Union extends unknown ? (value: Union) => void : never
) extends (value: infer Intersection) => void ? Intersection : never;

const checkedModules: DuplicateKeys extends never ? MessageModules : never = messageModules;

export const messages = Object.assign(
  {},
  ...Object.values(checkedModules),
) as UnionToIntersection<MessageModules[ModuleName]>;
export type MessageKey = keyof typeof messages;

export function formatMessage(
  key: MessageKey,
  params: Readonly<Record<string, string>>,
): string {
  return messages[key].replace(/\{([^}]+)\}/g, (placeholder, name: string) =>
    params[name] ?? placeholder);
}
