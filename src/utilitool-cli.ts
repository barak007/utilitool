#!/usr/bin/env node

import yargs from "yargs";
import { utilitool, defaultOptions } from "./utilitool";
import { logIntro } from "./show-banner";
import { resolve } from "path";

const {
  argv: {
    project,
    outDir,
    logLevel,
    build,
    clean,
    message,
    noGitTagVersion,
    prereleaseId,
    release,
  },
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
  .option("noGitTagVersion", {
    alias: "ngtv",
    default: defaultOptions.noGitTagVersion,
    description: `npm version --no-git-tag-version`,
  })
  .option("message", {
    alias: "m",
    default: defaultOptions.message,
    description: `npm version message`,
  })
  .option("prereleaseId", {
    alias: "preid",
    default: defaultOptions.prereleaseId,
    description: `npm version --preid`,
  })
  .option("release", {
    alias: "r",
    default: defaultOptions.release,
    description: `semver release type or "none"`,
    choices: [
      "none",
      "patch",
      "minor",
      "major",
      "prepatch",
      "preminor",
      "premajor",
      "prerelease",
    ],
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
  message,
  noGitTagVersion,
  prereleaseId,
  release,
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
