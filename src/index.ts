import { readFileSync } from "fs";
import { join, dirname } from "path";
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

const configPath = findConfigFile(process.cwd(), sys.fileExists);
console.log("configPath", configPath);
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

const sharedPackageData = getSharedPackagesData();

if (configPath) {
  const config = readAndParseConfigFile(configPath);
  //   const host = createCompilerHost(config.options);
  const packages = new Map();
  for (const filePath of config.fileNames) {
    preparePackageData(filePath, packages);
  }
  for (const filePath of config.fileNames) {
    const source = sys.readFile(filePath, "utf8");
    if (source) {
      const res = transpileModule(source, {
        compilerOptions: config.options,
        transformers: { after: [] },
      });
    }
  }
}

interface PackageData {}

function preparePackageData(
  filePath: string,
  packages: Map<string, PackageData>
) {
  packages.set(filePath, {
    filePath,
    name: "tralala",
  });
}

console.log(
  `%c${readFileSync(join(__dirname, "../banner.txt"), "utf8")}`,
  "font-family:monospace;"
);

console.log("Processing files...");
console.log("Creating packages...");
console.log("Publishing...");
