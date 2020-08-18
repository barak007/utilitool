export type LogLevel = "debug" | "verbose" | "warn" | "error" | "silent";
export type Logger = ReturnType<typeof createLogger>;

const debug = console.log.bind(console, "[Debug]");
const log = console.log.bind(console, "[Info]");
const warn = console.warn.bind(console, "[Warning]");
const error = console.error.bind(console, "[Error]");
const noop = (..._: any[]) => {};

export function createLogger(level: LogLevel) {
  if (level === "debug") {
    return { debug, log, warn, error };
  }
  if (level === "verbose") {
    return { debug: noop, log, warn, error };
  }

  if (level === "warn") {
    return { debug: noop, log: noop, warn, error };
  }

  if (level === "error") {
    return { debug: noop, log: noop, warn: noop, error };
  }

  return { debug: noop, log: noop, error: noop, warn: noop };
}
