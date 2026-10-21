// Resolve hooks for register.mjs: "@/x" → <repo>/x, and extensionless relative imports → .ts/.tsx.
import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = new URL("../../", import.meta.url);
const isFile = (path) => existsSync(path) && statSync(path).isFile();

export async function resolve(specifier, context, next) {
  let base = null;
  if (specifier.startsWith("@/")) base = new URL(specifier.slice(2), root);
  else if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL?.startsWith("file:")) {
    base = new URL(specifier, context.parentURL);
  }
  if (base) {
    const path = fileURLToPath(base);
    for (const candidate of [path, `${path}.ts`, `${path}.tsx`, `${path}/index.ts`]) {
      if (isFile(candidate)) return next(pathToFileURL(candidate).href, context);
    }
  }
  return next(specifier, context);
}
