export const fileMenu = {
  contributes: true,
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
  ],
} as const;
