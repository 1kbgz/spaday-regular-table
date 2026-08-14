import { bundle } from "./tools/bundle.mjs";
import { node_modules_external } from "./tools/externals.mjs";

import fs from "fs";
import cpy from "cpy";

const BUNDLES = [
  {
    entryPoints: ["src/ts/index.ts"],
    plugins: [node_modules_external()],
    outfile: "dist/esm/index.js",
  },
  {
    entryPoints: ["src/ts/index.ts"],
    outfile: "dist/cdn/index.js",
  },
];

async function build() {
  fs.rmSync("dist", { recursive: true, force: true });
  fs.rmSync("../spaday_regular_table/extension", {
    recursive: true,
    force: true,
  });

  // Copy HTML
  await cpy("src/html/*", "dist/");

  // Copy images
  fs.mkdirSync("dist/img", { recursive: true });
  await cpy("src/img/*", "dist/img");

  await cpy("node_modules/regular-table/dist/css/material.css", "dist/css", {
    flat: true,
  });

  await Promise.all(BUNDLES.map(bundle)).catch(() => process.exit(1));

  // Copy servable assets to python extension (exclude esm/)
  fs.mkdirSync("../spaday_regular_table/extension", { recursive: true });
  await cpy("dist/**/*", "../spaday_regular_table/extension", {
    filter: (file) =>
      !file.relativePath.startsWith("esm/") &&
      !file.relativePath.startsWith("dist/esm/"),
  });
}

build();
