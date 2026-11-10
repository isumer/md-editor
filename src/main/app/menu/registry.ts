import { registerMenuDeclarations } from "../../../shared/ipc/menu";
import { fileMenu } from "../../../shared/ipc/menu/file";

registerMenuDeclarations([fileMenu]);

export { shellMenu } from "./shell";
