export const viewMenu = {
  order: 20,
  menuTitleKey: "menu.view",
  items: [
    {
      id: "view-split",
      titleKey: "menu.viewSplit",
      accelerator: "CmdOrCtrl+1",
      commandId: "view.split",
    },
    {
      id: "view-editor",
      titleKey: "menu.viewEditor",
      accelerator: "CmdOrCtrl+2",
      commandId: "view.editor",
    },
    {
      id: "view-preview",
      titleKey: "menu.viewPreview",
      accelerator: "CmdOrCtrl+3",
      commandId: "view.preview",
    },
    {
      id: "view-full-screen",
      titleKey: "menu.viewFullScreen",
      accelerator: "F11",
      darwinAccelerator: "Ctrl+Command+F",
      commandId: "view.toggleFullScreen",
    },
  ],
} as const;
