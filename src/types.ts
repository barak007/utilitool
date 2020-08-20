type version = string;
type npmPackageName = string;

export interface PackageData {
  name: string;
  packageDir: string;
  files: Set<string>;
  dependencies: Map<npmPackageName, version>;
  version: version;
}
