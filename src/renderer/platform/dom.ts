export interface RendererElements {
  editorHost: HTMLElement;
  workspace: HTMLElement;
  preview: HTMLElement;
  previewError: HTMLElement;
  status: HTMLElement;
  tabsHost: HTMLElement;
  closePrompt: HTMLElement;
  closePromptMessage: HTMLElement;
}

function requiredElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

export function rendererElements(): RendererElements {
  return {
    editorHost: requiredElement("#editor"),
    workspace: requiredElement("#workspace"),
    preview: requiredElement("#preview"),
    previewError: requiredElement("#preview-error"),
    status: requiredElement("#status"),
    tabsHost: requiredElement("#tabs"),
    closePrompt: requiredElement("#close-prompt"),
    closePromptMessage: requiredElement("#close-prompt-message"),
  };
}
