import { execSync } from "child_process";
import { join, basename, parse, relative, resolve } from "path";
import validateNpmPackageName from "validate-npm-package-name";
import { nodeFs } from "@file-services/node";

import { sys, ParsedCommandLine, nodeModuleNameResolver } from "typescript";
import type { PackageJson } from "type-fest";
import type { PackageData, SourceFileData } from "./types";
import { createLogger, LogLevel, Logger } from "./log-level";
import {
  parseCode,
  findImportRanges,
  remapImports,
  ITextRange,
} from "./ts-imports";
import { tsCompilerOptionsCopyList } from "./ts-compiler-options-copy-list";
import { loadProjectConfigurations } from "./load-project-configurations";
import { copyDefinedKeys } from "./copy-defined-keys";

export interface UtilitoolOptions {
  project?: string;
  outDir?: string;
  logLevel?: LogLevel;
  build?: boolean;
  clean?: boolean;
}

export const defaultOptions: Required<UtilitoolOptions> = {
  project: process.cwd(),
  outDir: "utilitool-packages",
  logLevel: "verbose",
  build: true,
  clean: true,
};

export async function utilitool(options: UtilitoolOptions) {
  const { project, outDir, logLevel, clean, build } = {
    ...defaultOptions,
    ...options,
  };

  const logger = createLogger(logLevel);

  logger.log(`utilitool is running on: "${project}"`);

  const { tsconfig, rootPackageJSON } = loadProjectConfigurations(project);

  const fullOutDir = resolve(project, outDir);

  const { packagesData, sourceFileData, fileToPackage } = createPackagesData(
    tsconfig,
    rootPackageJSON,
    fullOutDir
  );

  cleanOutDir(clean, fullOutDir, logger);

  logger.debug(Array.from(packagesData).map(([name]) => name));

  for (const packageData of packagesData.values()) {
    const packageLogger = createLogger(logLevel, packageData.name);
    packageLogger.log(`init package processing`);
    const { packageDir } = packageData;

    for (const filePath of packageData.files) {
      const { importRanges, sourceText } = sourceFileData.get(filePath)!;

      const fileResolvedDependencies = new Map();

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
      packageLogger.log(`writing file "${relativeFilePathInPackage}"`);
    }

    packageLogger.log(`writing "${packageData.name}" index.ts`);
    writeIndexFile(packageData, project, packageDir);

    packageLogger.log(`writing "${packageData.name}" package.json`);
    sys.writeFile(
      join(packageDir, "package.json"),
      JSON.stringify(createPackageJson(rootPackageJSON, packageData), null, 4) +
        "\n"
    );
  }

  logger.log(`writing shared tsconfig.json`);

  writeSharedTsconfig(tsconfig, packagesData, fullOutDir);

  if (build) {
    logger.log(`building newly created projects`);
    execSync("tsc", { cwd: fullOutDir });
  }
}

function createSourceFileData(filePath: string): SourceFileData {
  const sourceText = sys.readFile(filePath, "utf8");
  if (!sourceText) {
    throw new Error(
      `Could not read source file "${filePath}" or file is empty`
    );
  }
  const sourceFile = parseCode(filePath, sourceText);
  const importRanges = findImportRanges(sourceFile);
  return { filePath, sourceText, sourceFile, importRanges };
}

function cleanOutDir(clean: boolean, fullOutDir: string, logger: Logger) {
  if (clean && nodeFs.existsSync(fullOutDir)) {
    logger.log(`cleaning output directory "${fullOutDir}"`);
    nodeFs.removeSync(fullOutDir);
  }
}

function writeIndexFile(
  packageData: PackageData,
  project: string,
  packageDir: string
) {
  let indexFile = "";

  for (const filePath of packageData.files) {
    const { dir, name } = parse(filePath);
    const request =
      "./" + join(relative(project, dir), name).replace(/\\/g, "/");
    indexFile += `export * from "${request}"\n`;
  }

  sys.writeFile(join(packageDir, "index.ts"), indexFile);
}

function writeSharedTsconfig(
  tsconfig: ParsedCommandLine,
  packagesData: Map<string, PackageData>,
  fullOutDir: string
) {
  const paths: Record<string, string[]> = {};

  for (const packageName of packagesData.keys()) {
    paths[packageName] = ["./" + packageName + "/index.ts"];
  }

  const rawCompilerOptions = tsconfig.raw?.compilerOptions;

  if (!rawCompilerOptions) {
    throw new Error("Missing raw tsconfig CompilerOptions");
  }

  const packageCompilerOptions = copyDefinedKeys(
    {
      baseUrl: "./",
      paths,
    },
    rawCompilerOptions,
    tsCompilerOptionsCopyList
  );

  sys.writeFile(
    join(fullOutDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: packageCompilerOptions,
      },
      null,
      4
    ) + "\n"
  );
}

function createPackagesData(
  tsconfig: ParsedCommandLine,
  rootPackageJSON: PackageJson,
  outDir: string
) {
  const packagesData = new Map<string, PackageData>();
  const fileToPackage = new Map<string, Set<PackageData>>();
  const sourceFileData = new Map<string, SourceFileData>();

  for (const filePath of tsconfig.fileNames) {
    sourceFileData.set(filePath, createSourceFileData(filePath));
    preparePackageData(
      filePath,
      rootPackageJSON,
      packagesData,
      fileToPackage,
      outDir
    );
  }
  return { packagesData, fileToPackage, sourceFileData };
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
          `Request that points to a file that contained within multiple packages are not supported yet. "${text}" from "${filePath}"`
        );
      }
    } else {
      throw new Error(`Failed to resolve request "${text}" from "${filePath}"`);
    }
  }
}

function createPackageJson(
  rootPackageJSON: PackageJson,
  packageData: PackageData
) {
  return copyDefinedKeys(
    {
      name: packageData.name,
      dependencies: Object.fromEntries(packageData.dependencies.entries()),
      main: "index.js",
    },
    rootPackageJSON,
    [
      "author",
      "bugs",
      "contributors",
      "funding",
      "license",
      "maintainers",
      "repository",
      "version",
    ]
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
  fileToPackage: Map<string, Set<PackageData>>,
  outDir: string
) {
  const name = getFullPackageName(filePath, packageJSON);

  let packageData = packages.get(name);
  if (!packageData) {
    packageData = {
      packageDir: join(outDir, name),
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
