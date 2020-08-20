import { dirname } from "path";
import {
  findConfigFile,
  readJsonConfigFile,
  parseJsonSourceFileConfigFileContent,
  sys,
  ParsedCommandLine,
} from "typescript";
import { PackageJson } from "type-fest";

export function loadProjectConfigurations(directoryPath: string) {
  const tsConfigPath = findConfigFile(directoryPath, sys.fileExists);
  const packageJSONPath = findConfigFile(
    directoryPath,
    sys.fileExists,
    "package.json"
  );

  if (!packageJSONPath) {
    throw new Error(`Could not find package.json at ${directoryPath}`);
  }
  if (!tsConfigPath) {
    throw new Error(`Could not find tsconfig at ${directoryPath}`);
  }

  const tsconfig = readAndParseConfigFile(tsConfigPath);
  const rootPackageJSON = loadPackageJSON(packageJSONPath);
  return { tsconfig, rootPackageJSON, tsConfigPath, packageJSONPath };
}

function readAndParseConfigFile(filePath: string): ParsedCommandLine {
  const jsonSourceFile = readJsonConfigFile(filePath, sys.readFile);
  return parseJsonSourceFileConfigFileContent(
    jsonSourceFile,
    sys,
    dirname(filePath)
  );
}

function loadPackageJSON(packageJSONPath: string): PackageJson {
  const content = sys.readFile(packageJSONPath, "utf8");
  if (!content) {
    throw new Error("Cannot read " + packageJSONPath);
  }
  try {
    return JSON.parse(content);
  } catch (e) {
    e.message = `Failed to parse "${packageJSONPath}" ${e.message}`;
    throw e;
  }
}
