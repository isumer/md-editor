import { IoControlHandler } from "./control";
import { IoGrantTable } from "./grants";
import { IoFileService } from "./services/file";

const grants = new IoGrantTable();
const files = new IoFileService(grants);
new IoControlHandler(process.parentPort, grants, files).start();
