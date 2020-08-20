export function copyDefinedKeys<T>(target: T, origin: T, keys: Array<keyof T>) {
  for (const key of keys) {
    const value = origin[key];
    if (value !== undefined) {
      target[key] = value;
    }
  }
  return target;
}
