import type { FeatureRegistration } from "../../editor/featureWiring";
import { wirePreviewLinks } from "./preview";
import { rewriteAssetUrls } from "./rewriteAssets";

export const previewFeature: FeatureRegistration = {
  editorExtensions: [],
  create: (context) => ({
    start: () => wirePreviewLinks(context.preview, context.showStatus),
  }),
  rewriteHtml: rewriteAssetUrls,
};
