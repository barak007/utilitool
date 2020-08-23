import { execSync } from "child_process";
import { join, basename, parse, relative, resolve } from "path";
import { nodeFs } from "@file-services/node";
import { valid as validateSemver, ReleaseType } from "semver";
import validateNpmPackageName from "validate-npm-package-name";
import ts, { sys, ParsedCommandLine, nodeModuleNameResolver } from "typescript";
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
  release?: ReleaseType | "none";
  prereleaseId?: string;
  noGitTagVersion?: boolean;
  message?: string;
}

export const defaultOptions: Required<UtilitoolOptions> = {
  project: process.cwd(),
  outDir: "utilitool-packages",
  logLevel: "verbose",
  build: true,
  clean: true,
  release: "patch",
  prereleaseId: "beta",
  noGitTagVersion: false,
  message: "",
};

export async function utilitool(options: UtilitoolOptions) {
  const {
    project,
    outDir,
    logLevel,
    clean,
    build,
    release,
    prereleaseId,
    noGitTagVersion,
    message,
  } = {
    ...defaultOptions,
    ...options,
  };

  const logger = createLogger(logLevel);

  logger.log(`utilitool is running on: "${project}"`);

  logger.log(`bumping project version`);

  npmVersionBump(release, message, prereleaseId, noGitTagVersion, project);

  const { tsconfig, rootPackageJSON, license } = loadProjectConfigurations(
    project
  );

  validateTsconfig(tsconfig);
  validatePackageJSON(rootPackageJSON);

  logger.log(`using version ${rootPackageJSON.version}`);

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

      packageLogger.log(`writing file "${relativeFilePathInPackage}"`);
      sys.writeFile(filePathInPackage, newSource);
    }

    packageLogger.log(`writing index.ts`);
    writeIndexFile(packageData, project, packageDir);

    packageLogger.log(`writing package.json`);
    writePackageJson(packageDir, rootPackageJSON, packageData);

    if (license) {
      packageLogger.log(`writing LiCENSE`);
      sys.writeFile(join(packageDir, "LICENSE"), license);
    }
  }

  logger.log(`writing shared tsconfig.json`);

  writeSharedTsconfig(tsconfig, packagesData, fullOutDir);

  if (build) {
    logger.log(`building newly created projects`);
    execSync("tsc", { cwd: fullOutDir });
  }
}

function npmVersionBump(
  release: string,
  message: string,
  prereleaseId: string,
  noGitTagVersion: boolean,
  project: string
) {
  if (release === "none") {
    return;
  }
  const msgArg = message ? ` -m ${JSON.stringify(message)}` : "";
  const preIdArg = release.startsWith("pre")
    ? ` --preid=${JSON.stringify(prereleaseId)}`
    : "";
  const noGitArg = noGitTagVersion ? ` --no-git-tag-version` : "";
  execSync(`npm version ${release}${msgArg}${preIdArg}${noGitArg}`, {
    cwd: project,
  });
}

function validateTsconfig(tsconfig: ts.ParsedCommandLine) {
  const errors = [];
  if (tsconfig.options.moduleResolution !== ts.ModuleResolutionKind.NodeJs) {
    errors.push(`moduleResolution must be set not "node".`);
  }
  if (errors.length) {
    throw new Error(`tsconfig validation failed:\n${errors.join("\n")}`);
  }
}

function validatePackageJSON(packageJSON: PackageJson) {
  const errors = [];
  if (!packageJSON.version || !validateSemver(packageJSON.version)) {
    errors.push(`invalid version "${packageJSON.version}".`);
  }
  if (!packageJSON.name) {
    errors.push(`missing "name" field.`);
  }
  if (errors.length) {
    throw new Error(`package.json validation failed:\n${errors.join("\n")}`);
  }
}

function writePackageJson(
  packageDir: string,
  rootPackageJSON: PackageJson,
  packageData: PackageData
) {
  sys.writeFile(
    join(packageDir, "package.json"),
    JSON.stringify(createPackageJson(rootPackageJSON, packageData), null, 4) +
      "\n"
  );
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
  const dependencies: Record<string, string> = {};
  for (const [name, version] of packageData.dependencies) {
    dependencies[name] = rootPackageJSON.dependencies?.[name] ?? "^" + version;
  }
  return copyDefinedKeys(
    {
      name: packageData.name,
      dependencies,
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
      version: packageJSON.version!,
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
