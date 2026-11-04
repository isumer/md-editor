const source = "(?:^|/)src";
const renderer = `${source}/renderer`;

/** @type {import("dependency-cruiser").IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "shared-no-dependencies",
      severity: "error",
      from: { path: `${source}/shared/` },
      to: {},
    },
    {
      name: "node-shared-boundaries",
      severity: "error",
      from: { path: `${source}/node-shared/` },
      to: {
        path: `${source}/`,
        pathNot: `${source}/(?:node-shared|shared)/`,
      },
    },
    {
      name: "main-boundaries",
      severity: "error",
      from: { path: `${source}/main/` },
      to: {
        path: `${source}/`,
        pathNot: `${source}/(?:main|node-shared|shared)/`,
      },
    },
    {
      name: "io-worker-boundaries",
      severity: "error",
      from: { path: `${source}/io-worker/` },
      to: {
        path: `${source}/`,
        pathNot: `${source}/(?:io-worker|node-shared|shared)/`,
      },
    },
    {
      name: "preload-boundaries",
      severity: "error",
      from: { path: `${source}/preload/` },
      to: {
        path: `${source}/`,
        pathNot: `${source}/(?:preload|shared)/`,
      },
    },
    {
      // The sandboxed preload can require only electron at runtime; shared code reaches it as types.
      name: "preload-types-only",
      severity: "error",
      from: { path: `${source}/preload/` },
      to: { path: `${source}/`, dependencyTypesNot: ["type-only"] },
    },
    {
      name: "preload-no-other-packages",
      severity: "error",
      from: { path: `${source}/preload/` },
      to: {
        path: "node_modules/",
        pathNot: "node_modules/electron/",
      },
    },
    {
      name: "renderer-no-node",
      severity: "error",
      from: { path: `${renderer}/` },
      to: { dependencyTypes: ["core"] },
    },
    {
      name: "renderer-no-electron",
      severity: "error",
      from: { path: `${renderer}/` },
      to: { path: "node_modules/electron/" },
    },
    {
      name: "renderer-core-boundaries",
      severity: "error",
      from: { path: `${renderer}/core/` },
      to: {
        path: `${source}/`,
        pathNot: `${source}/(?:renderer/core|shared)/`,
      },
    },
    {
      name: "core-no-codemirror-view",
      severity: "error",
      from: { path: `${renderer}/core/` },
      to: { path: "node_modules/@codemirror/view/" },
    },
    {
      name: "renderer-core-package-boundaries",
      severity: "error",
      from: { path: `${renderer}/core/` },
      to: {
        path: "node_modules/",
        pathNot: "node_modules/@codemirror/state/",
      },
    },
    {
      name: "renderer-editor-boundaries",
      severity: "error",
      from: { path: `${renderer}/editor/` },
      to: {
        path: `${source}/`,
        pathNot: `${source}/(?:renderer/(?:core|editor)|shared)/`,
      },
    },
    {
      name: "renderer-editor-package-boundaries",
      severity: "error",
      from: { path: `${renderer}/editor/` },
      to: {
        path: "node_modules/",
        pathNot: "node_modules/(?:@codemirror/|codemirror/)",
      },
    },
    {
      // Generic: features/X may import only its own folder among features; they cooperate via commands.
      name: "no-feature-to-feature",
      severity: "error",
      from: { path: `${renderer}/features/([^/]+)/` },
      to: {
        path: `${renderer}/features/`,
        pathNot: `${renderer}/features/$1/`,
      },
    },
    {
      name: "renderer-feature-boundaries",
      severity: "error",
      from: { path: `${renderer}/features/` },
      to: {
        path: `${source}/`,
        pathNot: `${source}/(?:renderer/(?:core|editor|features|platform|ui)|shared)/`,
      },
    },
    {
      name: "renderer-feature-package-boundaries",
      severity: "error",
      from: { path: `${renderer}/features/` },
      to: {
        path: "node_modules/",
        pathNot: "node_modules/(?:dompurify/|solid-js/)",
      },
    },
    {
      name: "renderer-ui-boundaries",
      severity: "error",
      from: { path: `${renderer}/ui/` },
      to: {
        path: `${source}/`,
        pathNot: `${source}/(?:renderer/(?:core|ui)|shared)/`,
      },
    },
    {
      name: "renderer-ui-package-boundaries",
      severity: "error",
      from: { path: `${renderer}/ui/` },
      to: {
        path: "node_modules/",
        pathNot: "node_modules/solid-js/",
      },
    },
    {
      name: "renderer-platform-boundaries",
      severity: "error",
      from: { path: `${renderer}/platform/` },
      to: {
        path: `${source}/`,
        pathNot: `${source}/(?:renderer/(?:core|platform)|shared)/`,
      },
    },
    {
      name: "renderer-platform-no-packages",
      severity: "error",
      from: { path: `${renderer}/platform/` },
      to: { path: "node_modules/" },
    },
    {
      name: "renderer-main-boundaries",
      severity: "error",
      from: { path: `${renderer}/main\.ts$` },
      to: {
        path: `${source}/`,
        pathNot: `${source}/(?:renderer|shared)/`,
      },
    },
    {
      name: "renderer-worker-boundaries",
      severity: "error",
      from: { path: `${renderer}/workers/` },
      to: {
        path: `${source}/`,
        pathNot: `${source}/(?:renderer/workers|shared)/`,
      },
    },
    {
      name: "renderer-worker-package-boundaries",
      severity: "error",
      from: { path: `${renderer}/workers/` },
      to: {
        path: "node_modules/",
        pathNot: "node_modules/(?:@codemirror/state/|highlight\.js/|markdown-it/)",
      },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
      dependencyTypes: [
        "npm",
        "npm-dev",
        "npm-optional",
        "npm-peer",
        "npm-bundled",
        "npm-no-pkg",
      ],
    },
    tsPreCompilationDeps: true,
  },
};
