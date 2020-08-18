import { join, dirname, basename, parse, relative, resolve } from "path";
import validateNpmPackageName from "validate-npm-package-name";
import {
  findConfigFile,
  readJsonConfigFile,
  parseJsonSourceFileConfigFileContent,
  sys,
  ParsedCommandLine,
  nodeModuleNameResolver,
} from "typescript";
import type { PackageJson } from "type-fest";
import type { PackageData } from "./types";
import { createLogger, LogLevel } from "./log-level";
import {
  parseCode,
  findImportRanges,
  remapImports,
  ITextRange,
} from "./ts-imports";

export interface UtilitoolOptions {
  project?: string;
  outDir?: string;
  logLevel?: LogLevel;
}

export const defaultOptions: Required<UtilitoolOptions> = {
  project: process.cwd(),
  outDir: "utilitool-packages",
  logLevel: "debug",
};

export async function utilitool(options: UtilitoolOptions) {
  const { project, outDir, logLevel } = { ...defaultOptions, ...options };

  const logger = createLogger(logLevel);

  logger.log(`utilitool is running on project at: ${project}`);

  const { tsconfig, rootPackageJSON } = loadProjectConfigurations(project);

  const { packagesData, fileToPackage } = createPackagesData(
    tsconfig,
    rootPackageJSON
  );

  const fullOutDir = resolve(project, outDir);

  logger.debug(Array.from(packagesData).map(([name]) => name));

  for (const packageData of packagesData.values()) {
    const packageDir = join(fullOutDir, packageData.name);

    for (const filePath of packageData.files) {
      const sourceText = sys.readFile(filePath, "utf8");
      if (sourceText) {
        logger.debug("process", filePath);
        const fileResolvedDependencies = new Map();
        const sourceFile = parseCode(filePath, sourceText);
        const importRanges = findImportRanges(sourceFile);

        processFileImports(
          importRanges,
          filePath,
          tsconfig,
          packageData,
          fileResolvedDependencies,
          fileToPackage
        );

        const newSource = remapImports(sourceText, importRanges, (request) =>
          fileResolvedDependencies.get(request)
        );
        const relativeFilePathInPackage = relative(project, filePath);
        const filePathInPackage = join(packageDir, relativeFilePathInPackage);

        sys.writeFile(filePathInPackage, newSource);
        logger.debug(
          `Write file "${relativeFilePathInPackage}" to package "${packageData.name}"`
        );
      } else {
        throw new Error(`Could not read file "${filePath}" or file is empty`);
      }
    }

    sys.writeFile(
      join(packageDir, "package.json"),
      JSON.stringify(createPackageJson(rootPackageJSON, packageData), null, 4) +
        "\n"
    );
  }
}

function createPackagesData(
  tsconfig: ParsedCommandLine,
  rootPackageJSON: PackageJson
) {
  const packagesData = new Map<string, PackageData>();
  const fileToPackage = new Map<string, Set<PackageData>>();

  for (const filePath of tsconfig.fileNames) {
    preparePackageData(filePath, rootPackageJSON, packagesData, fileToPackage);
  }
  return { packagesData, fileToPackage };
}

function loadProjectConfigurations(project: string) {
  const tsConfigPath = findConfigFile(project, sys.fileExists);
  const packageJSONPath = findConfigFile(
    project,
    sys.fileExists,
    "package.json"
  );

  if (!packageJSONPath) {
    throw new Error(`Could not find package.json at ${project}`);
  }
  if (!tsConfigPath) {
    throw new Error(`Could not find tsconfig at ${project}`);
  }

  const tsconfig = readAndParseConfigFile(tsConfigPath);
  const rootPackageJSON = loadPackageJSON(packageJSONPath);
  return { tsconfig, rootPackageJSON };
}

function processFileImports(
  importRanges: ITextRange[],
  filePath: string,
  tsconfig: ParsedCommandLine,
  packageData: PackageData,
  fileResolvedDependencies: Map<any, any>,
  fileToPackage: Map<string, Set<PackageData>>
) {
  for (const { text } of importRanges) {
    const { resolvedModule } = nodeModuleNameResolver(
      text,
      filePath,
      tsconfig.options,
      sys
    );

    if (resolvedModule?.isExternalLibraryImport && resolvedModule.packageId) {
      const { name, version } = resolvedModule.packageId;
      packageData.dependencies.set(name, version);
      fileResolvedDependencies.set(text, name);
    } else if (resolvedModule?.resolvedFileName) {
      const packageDataSet = fileToPackage.get(resolvedModule.resolvedFileName);
      if (packageDataSet?.size === 1) {
        const { name, version } = Array.from(packageDataSet)[0];
        packageData.dependencies.set(name, version);
        fileResolvedDependencies.set(text, name);
      } else {
        throw new Error(
          `Request that points to a file that contained within multiple packages are not supported yet ${text} from ${filePath}`
        );
      }
    } else {
      throw new Error(`Failed to resolve request "${text}" from ${filePath}`);
    }
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
  const { validForNewPackages, errors } = validateNpmPackageName(name);

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
  packages: Map<string, PackageData>,
  fileToPackage: Map<string, Set<PackageData>>
) {
  const name = getFullPackageName(filePath, packageJSON);

  let packageData = packages.get(name);
  if (!packageData) {
    packageData = {
      dependencies: new Map(),
      files: new Set([filePath]),
      name,
      version: packageJSON.version || "",
    };
    packages.set(name, packageData);
  } else {
    packageData.files.add(filePath);
  }

  let packageSet = fileToPackage.get(filePath);
  if (!packageSet) {
    packageSet = new Set([packageData]);
    fileToPackage.set(filePath, packageSet);
  } else {
    packageSet.add(packageData);
  }
}
