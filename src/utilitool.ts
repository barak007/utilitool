import { readFileSync } from "fs";
import { join, dirname, basename, extname, parse } from "path";
import {
  createCompilerHost,
  findConfigFile,
  readJsonConfigFile,
  parseJsonSourceFileConfigFileContent,
  sys,
  ParsedCommandLine,
  preProcessFile,
  transpile,
  transpileModule,
} from "typescript";

import { PackageData, PackageJSON } from "./types";

interface Options {
  projectRoot: string;
}

export async function utilitool({ projectRoot }: Options) {
  const tsConfigPath = findConfigFile(projectRoot, sys.fileExists);
  const packageJSONPath = findConfigFile(
    projectRoot,
    sys.fileExists,
    "package.json"
  );

  console.log("tsconfigPath", tsConfigPath);
  console.log("packageJSONPath", packageJSONPath);

  if (!tsConfigPath || !packageJSONPath) {
    return;
  }

  const tsconfig = readAndParseConfigFile(tsConfigPath);
  const packageJSON = loadPackageJSON(packageJSONPath);

  const sharedPackageData = getSharedPackagesData();

  const packagesData = new Map<string, PackageData>();

  for (const filePath of tsconfig.fileNames) {
    preparePackageData(filePath, packageJSON, packagesData);
  }

  console.log(Array.from(packagesData).map(([name]) => name));

  for (const [filePath] of packagesData) {
    const source = sys.readFile(filePath, "utf8");
    if (source) {
      const res = transpileModule(source, {
        compilerOptions: tsconfig.options,
        transformers: { before: [] },
      });
    }
  }
}

function loadPackageJSON(packageJSONPath: string) {
  const content = sys.readFile(packageJSONPath, "utf8");
  if (!content) {
    throw new Error("Cannot read " + packageJSONPath);
  }
  try {
    return JSON.parse(content);
  } catch (e) {
    e.message = "Failed to parse package.json " + packageJSONPath;
    throw e;
  }
}

function readAndParseConfigFile(filePath: string): ParsedCommandLine {
  const jsonSourceFile = readJsonConfigFile(filePath, sys.readFile);
  return parseJsonSourceFileConfigFileContent(
    jsonSourceFile,
    sys,
    dirname(filePath)
  );
}

function getSharedPackagesData() {
  return {
    baseVersion: "0.0.0",
  };
}

function getPackageNameFromFile(filePath: string) {
  const fileName = basename(filePath);
  const name = parse(fileName).name;
  if (name.match(/[a-zA-Z][a-zA-Z0-1-_]+/)) {
    return name;
  } else {
    throw new Error("Invalid file utilitool fileName");
  }
}

function getFullPackageName(filePath: string, packageJSON: PackageJSON) {
  const name = getPackageNameFromFile(filePath);
  return packageJSON.name + "-" + name;
}

function preparePackageData(
  filePath: string,
  packageJSON: PackageJSON,
  packages: Map<string, PackageData>
) {
  const name = getFullPackageName(filePath, packageJSON);

  let packageData = packages.get(name);
  if (!packageData) {
    packageData = {
      files: new Set([filePath]),
      name,
    };
    packages.set(name, packageData);
  } else {
    packageData.files.add(filePath);
  }
}

function logIntro() {
  console.log(
    `%c${readFileSync(join(__dirname, "../banner.txt"), "utf8")}`,
    "font-family:monospace;"
  );

  console.log("Processing files...");
  console.log("Creating packages...");
  console.log("Publishing...");
}