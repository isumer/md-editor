import { sessionContracts } from "../../shared/ipc/session";
import type { CloseRequestBroker } from "../app/closeRequests";
import type { SessionStore } from "../app/session";
import type { DocumentGrantService } from "../services/documentGrants";
import { handle } from "./handle";

export function registerSessionIpcHandler(
  store: SessionStore,
  fileService: DocumentGrantService,
  closeRequests: CloseRequestBroker,
): void {
  handle(sessionContracts.load, async (_request, context) => {
    const stored = await store.read();
    const documents = [];
    for (const document of stored.documents) {
      try {
        const reference = await fileService.openPath(context.windowId, document.path);
        documents.push({
          grant: reference.grant,
          name: reference.name,
          savedText: document.savedText,
          text: document.text,
        });
      } catch {
        // A document deleted or moved since the session is not restorable.
      }
    }
    return { documents };
  });
  handle(sessionContracts.closeResult, async (result, context) => {
    await closeRequests.settle(result, context.windowId);
  });
}
