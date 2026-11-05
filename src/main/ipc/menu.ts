import { menuContracts } from "../../shared/ipc/menu";
import type { ContributionPump } from "../app/menuContribution";
import { handle } from "./handle";

export function registerMenuIpcHandler(contributions: ContributionPump): void {
  handle(menuContracts.contribute, async (request) => {
    contributions.push(request);
  });
}
