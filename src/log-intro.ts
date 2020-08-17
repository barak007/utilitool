import { readFileSync } from "fs";
import { join } from "path";

export function logIntro() {
  console.log(
    `%c${readFileSync(join(__dirname, "../banner.txt"), "utf8")}`,
    "font-family:monospace;"
  );
}
