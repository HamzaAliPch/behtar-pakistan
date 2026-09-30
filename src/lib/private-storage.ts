import path from "node:path";
import { assertFriendTestIsolation } from "./friend-test-safety";

assertFriendTestIsolation();
export const privateStorageRoot = process.env.PRIVATE_UPLOAD_ROOT || path.join(process.cwd(), "private_uploads");

export function privateStoragePath(...parts: string[]) {
  // Runtime-only private path. Never trace this directory into a build artifact.
  const target = path.resolve(/* turbopackIgnore: true */ privateStorageRoot, ...parts);
  const root = path.resolve(/* turbopackIgnore: true */ privateStorageRoot);
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error("Invalid private storage path");
  return target;
}
