import * as SecureStore from "expo-secure-store";

// Where the refresh token lives: the iOS Keychain or Android Keystore. secureStorage.web.ts stands in
// for `expo start --web`, which is only for development.
export const secureStorage = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  remove: (key: string) => SecureStore.deleteItemAsync(key),
};
