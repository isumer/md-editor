import { compareMenu } from "../../../shared/ipc/menu/compare";
import { composeMenuItems } from "../../../shared/ipc/menu/compose";
import { fileMenu } from "../../../shared/ipc/menu/file";
import { viewMenu } from "../../../shared/ipc/menu/view";
import { shellMenu } from "./shell";

export const menuItems = composeMenuItems([fileMenu, compareMenu, viewMenu]);
export { shellMenu };
