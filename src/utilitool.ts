import { join, dirname, basename, extname, parse } from "path";
import validate from "validate-npm-package-name";
import {
  findConfigFile,
  readJsonConfigFile,
  parseJsonSourceFileConfigFileContent,
  sys,
  ParsedCommandLine,
  transpileModule,
} from "typescript";
import type { PackageJson } from "type-fest";
import type { PackageData } from "./types";
import { createLogger, LogLevel } from "./log-level";
import { parseCode, findImportRanges } from "./ts-imports";

interface Options {
  project: string;
  outDir: string;
  logLevel: LogLevel;
}

export const defaultOptions: Options = {
  project: process.cwd(),
  outDir: "utilitool-packages",
  logLevel: "debug",
};

export async function utilitool(options: Partial<Options>) {
  const { project, outDir, logLevel } = { ...defaultOptions, ...options };

  const logger = createLogger(logLevel);

  logger.log(`utilitool is running on project at: ${project}`);

  const tsConfigPath = findConfigFile(project, sys.fileExists);
  const packageJSONPath = findConfigFile(
    project,
    sys.fileExists,
    "package.json"
  );

  logger.debug("tsconfigPath", tsConfigPath);
  logger.debug("rootPackageJSONPath", packageJSONPath);

  if (!tsConfigPath || !packageJSONPath) {
    return;
  }

  const tsconfig = readAndParseConfigFile(tsConfigPath);
  const rootPackageJSON = loadPackageJSON(packageJSONPath);

  const packagesData = new Map<string, PackageData>();

  for (const filePath of tsconfig.fileNames) {
    preparePackageData(filePath, rootPackageJSON, packagesData);
  }
  const fullOutDir = join(project, outDir);

  logger.debug(Array.from(packagesData).map(([name]) => name));

  for (const packageData of packagesData.values()) {
    const packageDir = join(fullOutDir, packageData.name);

    for (const filePath of packageData.files) {
      const sourceText = sys.readFile(filePath, "utf8");
      logger.debug("process", filePath, sourceText);
      if (sourceText) {
        const sourceFile = parseCode(filePath, sourceText);
        const importRanges = findImportRanges(sourceFile);
        let npmImportCount = 0;

        for (const { text } of importRanges) {
          const npmDepVersion = rootPackageJSON.dependencies?.[text];
          if (npmDepVersion) {
            packageData.dependencies.set(text, npmDepVersion);
            npmImportCount++;
          }
        }

        if (importRanges.length !== npmImportCount) {
          throw new Error("Non npm packages imports are not supported for now");
        }

        logger.debug(
          filePath,
          importRanges.map(({ text }) => text)
        );
      }
    }

    sys.writeFile(
      join(packageDir, "package.json"),
      JSON.stringify(createPackageJson(rootPackageJSON, packageData))
    );
  }
}

function createPackageJson(
  rootPackageJSON: PackageJson,
  packageData: PackageData
) {
  return {
    name: packageData.name,
    version: rootPackageJSON.version,
    dependencies: Object.fromEntries(packageData.dependencies.entries()),
  };
}

function getSharedPackagesData() {
  return {
    baseVersion: "0.0.0",
  };
}

function loadPackageJSON(packageJSONPath: string): PackageJson {
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

function getPackageNameFromFile(filePath: string) {
  const fileName = basename(filePath);
  const name = parse(fileName).name;
  const { validForNewPackages, errors } = validate(name);

  if (validForNewPackages) {
    return name;
  } else {
    throw new Error(
      `Invalid utilitool entry fileName.${
        errors ? "\n" + errors?.join("\n") : ""
      }`
    );
  }
}

function getFullPackageName(filePath: string, packageJSON: PackageJson) {
  const name = getPackageNameFromFile(filePath);
  return packageJSON.name + "-" + name;
}

function preparePackageData(
  filePath: string,
  packageJSON: PackageJson,
  packages: Map<string, PackageData>
) {
  const name = getFullPackageName(filePath, packageJSON);

  let packageData = packages.get(name);
  if (!packageData) {
    packageData = {
      dependencies: new Map(),
      files: new Set([filePath]),
      name,
    };
    packages.set(name, packageData);
  } else {
    packageData.files.add(filePath);
  }
}
