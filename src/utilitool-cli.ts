#!/usr/bin/env node

import yargs from "yargs";
import { utilitool, defaultOptions } from "./utilitool";
import { logIntro } from "./show-banner";
import { resolve } from "path";

const {
  argv: { project, outDir, logLevel, build, clean },
} = yargs
  .option("project", {
    alias: "p",
    default: defaultOptions.project,
    description: "directory path of the project",
  })
  .option("outDir", {
    alias: "o",
    default: defaultOptions.outDir,
    description: "output directory for the built packages",
  })
  .option("build", {
    alias: "b",
    default: defaultOptions.build,
    description: "build newly created packages",
  })
  .option("clean", {
    alias: "c",
    default: defaultOptions.clean,
    description: "remove outDir before start",
  })
  .option("logLevel", {
    alias: "ll",
    default: defaultOptions.logLevel,
    description: `Logging level - "debug" | "verbose" | "warn" | "error" | "silent"`,
  })
  .alias("h", "help")
  .help()
  .strict();

logIntro();

utilitool({
  project: resolve(project),
  outDir,
  logLevel,
  build,
  clean,
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
