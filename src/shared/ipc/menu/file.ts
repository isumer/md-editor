export const fileMenu = {
  menuTitleKey: "menu.file",
  items: [
    {
      id: "file-open",
      titleKey: "menu.open",
      accelerator: "CmdOrCtrl+O",
      commandId: "file.open",
    },
    {
      id: "file-save",
      titleKey: "menu.save",
      accelerator: "CmdOrCtrl+S",
      commandId: "file.save",
    },
    {
      id: "file-save-as",
      titleKey: "menu.saveAs",
      accelerator: "CmdOrCtrl+Shift+S",
      commandId: "file.saveAs",
    },
    {
      id: "file-compare-open",
      titleKey: "menu.compareOpen",
      accelerator: "CmdOrCtrl+Shift+C",
      commandId: "file.compareOpen",
    },
  ],
} as const;

declare global {
  interface SharedMenuDeclarations {
    file: typeof fileMenu;
  }
}
