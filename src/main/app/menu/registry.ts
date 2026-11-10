import { registerMenuDeclarations } from "../../../shared/ipc/menu";
import { fileMenu } from "../../../shared/ipc/menu/file";

const menuDeclarations = [fileMenu] as const;

registerMenuDeclarations(menuDeclarations);

export { shellMenu } from "./shell";
