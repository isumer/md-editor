import { compareMenu } from "../../../shared/ipc/menu/compare";
import { composeMenuItems } from "../../../shared/ipc/menu/compose";
import { fileMenu } from "../../../shared/ipc/menu/file";
import { mergeMenu } from "../../../shared/ipc/menu/merge";
import { shellMenu } from "./shell";

export const menuItems = composeMenuItems([fileMenu, compareMenu, mergeMenu]);
export { shellMenu };
