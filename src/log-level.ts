export type LogLevel = "debug" | "verbose" | "warn" | "error" | "silent";
export type Logger = ReturnType<typeof createLogger>;

export function createLogger(level: LogLevel, namespace?: string) {
  const ns = namespace ? `[${namespace}]` : "";
  const debug = console.log.bind(console, `[Debug]${ns}`);
  const log = console.log.bind(console, `[Info]${ns}`);
  const warn = console.warn.bind(console, `[Warning]${ns}`);
  const error = console.error.bind(console, `[Error]${ns}`);
  const noop = (..._: any[]) => {};

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
