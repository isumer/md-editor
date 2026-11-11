import type { FeatureContext } from "../../editor/featureWiring";
import { exportDocument } from "../../platform/api";
import exportWorkerUrl from "./export.worker.ts?worker&url";
import { HtmlExportClient } from "./client";
import type { ExportBlock, ResolvedExportTheme } from "./html";

type ExportFormat = "html" | "pdf";

function activeDocument(context: FeatureContext) {
  return context.documents().find((document) => context.isActive(document)) ?? null;
}

function relativeAssets(html: string): string {
  return html.replaceAll(/doc-asset:\/\/[^/]+\/[^/]+\//g, "");
}

function renderedBlocks(preview: HTMLElement): ExportBlock[] {
  return [...preview.querySelectorAll<HTMLElement>("[data-block-id]")].map((element) => ({
    id: element.dataset["blockId"] as string,
    html: relativeAssets(element.innerHTML),
  }));
}

function field(label: string, control: HTMLElement): HTMLLabelElement {
  const row = document.createElement("label");
  row.append(label, control);
  return row;
}

export class ExportController {
  private readonly dialog = document.createElement("dialog");
  private readonly form = document.createElement("form");
  private readonly alwaysLight = document.createElement("input");
  private readonly pageSize = document.createElement("select");
  private readonly margin = document.createElement("input");
  private readonly background = document.createElement("input");
  private format: ExportFormat = "html";
  private readonly client = new HtmlExportClient(
    new Worker(new URL(exportWorkerUrl, window.location.href), { type: "module" }),
  );

  constructor(private readonly context: FeatureContext) {
    this.configureDialog();
  }

  open(format: ExportFormat): void {
    this.format = format;
    this.dialog.dataset["format"] = format;
    this.dialog.querySelector<HTMLElement>("[data-html-options]")?.toggleAttribute("hidden", format !== "html");
    this.dialog.querySelector<HTMLElement>("[data-pdf-options]")?.toggleAttribute("hidden", format !== "pdf");
    this.dialog.showModal();
  }

  private configureDialog(): void {
    this.dialog.dataset["testid"] = "export-dialog";
    this.form.method = "dialog";
    this.alwaysLight.type = "checkbox";
    this.alwaysLight.dataset["testid"] = "export-always-light";
    this.pageSize.append(new Option("A4", "A4"), new Option("Letter", "Letter"));
    this.pageSize.dataset["testid"] = "export-page-size";
    this.margin.type = "number";
    this.margin.min = "0";
    this.margin.max = "10";
    this.margin.step = "0.1";
    this.margin.value = "0.5";
    this.background.type = "checkbox";
    this.background.checked = true;
    const html = document.createElement("div");
    html.dataset["htmlOptions"] = "";
    html.append(field("Always use light theme", this.alwaysLight));
    const pdf = document.createElement("div");
    pdf.dataset["pdfOptions"] = "";
    pdf.append(
      field("Page size", this.pageSize),
      field("Margins in inches", this.margin),
      field("Print background", this.background),
    );
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => this.dialog.close());
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = "Export";
    this.form.append(html, pdf, cancel, submit);
    this.form.addEventListener("submit", (event) => this.submit(event));
    this.dialog.append(this.form);
    document.body.append(this.dialog);
  }

  private submit(event: SubmitEvent): void {
    event.preventDefault();
    this.dialog.close();
    void this.run().catch((error: unknown) => {
      this.context.showStatus(error instanceof Error ? error.message : String(error));
    });
  }

  private async run(): Promise<void> {
    const active = activeDocument(this.context);
    if (!active) throw new Error("No document is open");
    if (this.context.preview.dataset["renderComplete"] !== "true") {
      throw new Error("The preview is still rendering");
    }
    const resolvedTheme: ResolvedExportTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark" : "light";
    const html = await this.client.build({
      title: active.name ?? "Untitled",
      blocks: renderedBlocks(this.context.preview),
      theme: resolvedTheme,
      alwaysLight: this.format === "html" && this.alwaysLight.checked,
    });
    const baseName = (active.name ?? "Untitled").replace(/\.[^.]+$/, "");
    const request = this.format === "html"
      ? { format: "html" as const, html, suggestedName: `${baseName}.html` }
      : {
          format: "pdf" as const,
          html,
          suggestedName: `${baseName}.pdf`,
          options: {
            pageSize: this.pageSize.value === "Letter" ? "Letter" as const : "A4" as const,
            margins: {
              top: this.margin.valueAsNumber,
              bottom: this.margin.valueAsNumber,
              left: this.margin.valueAsNumber,
              right: this.margin.valueAsNumber,
            },
            printBackground: this.background.checked,
          },
        };
    const result = await exportDocument(request);
    if (!result.ok) throw new Error(result.error.messageKey);
  }
}
