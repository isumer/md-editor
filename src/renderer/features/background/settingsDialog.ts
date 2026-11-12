import type { SettingsReadResponse } from "../../../shared/ipc/settings";
import type { ResolvedTheme } from "./background";

type Pane = "editor" | "preview";

export interface BackgroundDialogActions {
  changeBackground(pane: Pane, value: string): void;
  changeTheme(theme: "light" | "dark" | "system"): void;
  resetBackground(pane: Pane): void;
}

export interface BackgroundSettingsDialog {
  dispose(): void;
  update(settings: SettingsReadResponse, theme: ResolvedTheme): void;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Readonly<Record<string, string>> = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, value);
  }
  return node;
}

function backgroundRow(pane: Pane): HTMLDivElement {
  const row = element("div", { class: "background-settings-row" });
  const label = element("label", { for: `${pane}-background-input` });
  label.textContent = pane === "editor" ? "Editor background" : "Preview background";
  const input = element("input", {
    id: `${pane}-background-input`,
    type: "color",
  });
  const reset = element("button", {
    id: `${pane}-background-reset`,
    type: "button",
  });
  reset.textContent = "Reset to theme default";
  row.append(label, input, reset);
  return row;
}

function buildDialog(): HTMLDialogElement {
  const dialog = element("dialog", {
    id: "background-settings-dialog",
    "aria-labelledby": "background-settings-title",
  });
  const title = element("h2", { id: "background-settings-title" });
  title.textContent = "Settings";
  const themeLabel = element("label", { for: "background-theme-input" });
  themeLabel.textContent = "Theme";
  const theme = element("select", { id: "background-theme-input" });
  const themes = [
    { value: "system", text: "System" },
    { value: "light", text: "Light" },
    { value: "dark", text: "Dark" },
  ] as const;
  for (const item of themes) {
    const option = element("option", { value: item.value });
    option.textContent = item.text;
    theme.append(option);
  }
  const close = element("button", { type: "button", "data-action": "close" });
  close.textContent = "Close";
  dialog.append(title, themeLabel, theme, backgroundRow("editor"),
    backgroundRow("preview"), close);
  return dialog;
}

function openDialog(dialog: HTMLDialogElement): void {
  dialog.showModal();
}

function closeDialog(dialog: HTMLDialogElement): void {
  dialog.close();
}

function inputValue(selector: string, value: string): void {
  const input = document.querySelector<HTMLInputElement>(selector);
  if (input !== null) input.value = value;
}

function wireDialog(dialog: HTMLDialogElement, actions: BackgroundDialogActions): void {
  dialog.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    if (target.id === "background-theme-input") {
      if (target.value === "light" || target.value === "dark" || target.value === "system") {
        actions.changeTheme(target.value);
      }
      return;
    }
    if (target.id === "editor-background-input") actions.changeBackground("editor", target.value);
    if (target.id === "preview-background-input") actions.changeBackground("preview", target.value);
  });
  dialog.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    if (target.id === "editor-background-reset") actions.resetBackground("editor");
    if (target.id === "preview-background-reset") actions.resetBackground("preview");
    if (target.dataset["action"] === "close") closeDialog(dialog);
  });
}

export function installBackgroundSettingsDialog(
  actions: BackgroundDialogActions,
): BackgroundSettingsDialog {
  const open = element("button", { id: "background-settings-open", type: "button" });
  open.textContent = "Settings";
  const dialog = buildDialog();
  open.addEventListener("click", () => openDialog(dialog));
  wireDialog(dialog, actions);
  const sidebarHeader = document.querySelector<HTMLElement>(".workspace-sidebar-header");
  (sidebarHeader ?? document.body).append(open);
  document.body.append(dialog);
  return {
    dispose: () => {
      open.remove();
      dialog.remove();
    },
    update: (settings, theme) => {
      inputValue("#background-theme-input", settings.theme);
      inputValue("#editor-background-input", settings.editor.background ??
        (theme === "dark" ? "#0d1117" : "#ffffff"));
      inputValue("#preview-background-input", settings.preview.background ??
        (theme === "dark" ? "#0d1117" : "#ffffff"));
    },
  };
}
