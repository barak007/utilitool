export interface PackageData {
  name: string;
  files: Set<string>;
}

export interface PackageJSON {
  name: string;
  version: string;
}
