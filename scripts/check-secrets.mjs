import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

// Inspect publishable files without ever printing a credential's value.
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const credentials = /(?:sb_secret_[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/;
const found = [];
for (const file of new Set(files)) {
  if (!statSync(file, { throwIfNoEntry: false })?.isFile()) continue;
  if (credentials.test(readFileSync(file, "utf8"))) found.push(file);
}
if (found.length) {
  console.error(`Possible private credentials found in: ${found.join(", ")}`);
  process.exitCode = 1;
} else console.log(`Checked ${new Set(files).size} publishable files; no private credentials found.`);
