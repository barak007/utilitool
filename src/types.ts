type version = string;
type npmPackageName = string;

export interface PackageData {
  name: string;
  files: Set<string>;
  dependencies: Map<npmPackageName, version>;
}
