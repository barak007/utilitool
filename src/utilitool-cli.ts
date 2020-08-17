#!/usr/bin/env node

import yargs from "yargs";
import { utilitool, defaultOptions } from "./utilitool";
import { logIntro } from "./log-intro";

const {
  argv: { project, logLevel },
} = yargs
  .option("project", {
    alias: "p",
    default: defaultOptions.project,
    description: "directory path of the project",
  })
  .option("logLevel", {
    alias: "ll",
    default: defaultOptions.logLevel,
    description: "Log level",
  })
  .alias("h", "help")
  .help()
  .strict();

logIntro();

utilitool({
  project,
  logLevel,
}).catch((error) => {
  console.error(error);
  process.exit(1);
});

