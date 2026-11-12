export const fileMenu = {
  order: 0,
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
      id: "file-export-html",
      titleKey: "menu.exportHtml",
      accelerator: "CmdOrCtrl+Alt+H",
      commandId: "file.exportHtml",
    },
    {
      id: "file-export-pdf",
      titleKey: "menu.exportPdf",
      accelerator: "CmdOrCtrl+Alt+P",
      commandId: "file.exportPdf",
    },
  ],
} as const;
