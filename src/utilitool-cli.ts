#!/usr/bin/env node

import yargs from "yargs";
import { utilitool, defaultOptions } from "./utilitool";
import { logIntro } from "./show-banner";

const {
  argv: { project, outDir, logLevel },
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
  project,
  outDir,
  logLevel,
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
