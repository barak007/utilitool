#!/usr/bin/env node

import yargs from "yargs";

const { argv } = yargs
  .option("project", {
    alias: "p",
    default: process.cwd(),
    description: "directory path of the project",
  })
  .alias("h", "help")
  .help()
  .strict();

console.log(argv);
