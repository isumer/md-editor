import type { MdApi } from "./api";

declare global {
  interface Window {
    mdApi: MdApi;
  }
}

export {};
