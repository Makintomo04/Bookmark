// `expo start --web` is for development only; browsers have no secure enclave, so this uses
// localStorage. The phone builds use secureStorage.ts.
const storage = () => (typeof localStorage === "undefined" ? null : localStorage);

export const secureStorage = {
  get: async (key: string) => storage()?.getItem(key) ?? null,
  set: async (key: string, value: string) => storage()?.setItem(key, value),
  remove: async (key: string) => storage()?.removeItem(key),
};
