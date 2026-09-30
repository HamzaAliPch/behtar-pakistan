import path from "node:path";
import { realpathSync } from "node:fs";

const testRoot = path.resolve(process.cwd(), "runtime", "friend-test");
const expectedUploads = path.join(testRoot, "uploads");

export function assertFriendTestIsolation() {
  if (process.env.FRIEND_TEST_MODE !== "1") return;
  if (process.env.DATABASE_URL !== "file:./friend-test.db") throw new Error("Friend test refused: unexpected database path");
  const configured = process.env.PRIVATE_UPLOAD_ROOT;
  if (!configured || !path.isAbsolute(configured) || path.normalize(configured).toLowerCase() !== path.normalize(expectedUploads).toLowerCase()) throw new Error("Friend test refused: unexpected upload path");
  try {
    if (path.normalize(realpathSync(configured)).toLowerCase() !== path.normalize(expectedUploads).toLowerCase()) throw new Error("Friend test refused: upload path redirects elsewhere");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Friend test refused")) throw error;
    throw new Error("Friend test refused: upload directory does not exist");
  }
}

export const friendTestRoot = testRoot;
