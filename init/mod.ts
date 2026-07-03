// Scaffolder for a fresh Chevalier app.
//   deno run -Ar jsr:@chevalier/init my-app
// Writes the template into <dir> (created if missing), then prints next steps.

import { templateFiles } from "./templates.gen.ts";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";

function color(on: boolean, code: string, s: string): string {
  return on ? `${code}${s}${RESET}` : s;
}

async function isEmptyDir(dir: string): Promise<boolean> {
  try {
    for await (const _ of Deno.readDir(dir)) return false;
    return true;
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return true; // absent = fine to create
    throw e;
  }
}

function promptDir(question: string, fallback: string): string {
  const answer = globalThis.prompt(question, fallback);
  return (answer ?? fallback).trim() || fallback;
}

function validName(name: string): boolean {
  // Directory-safe, not empty, no path separators or traversal.
  return name.length > 0 && !/[\\/]/.test(name) && name !== "." &&
    name !== "..";
}

async function main() {
  const tty = Deno.stdout.isTerminal();
  const c = (code: string, s: string) => color(tty, code, s);

  let target = Deno.args[0];
  if (!target) {
    target = promptDir("Project directory:", "my-chevalier-app");
  }
  if (!validName(target)) {
    console.error(c("\x1b[31m", `Invalid directory name: ${target}`));
    Deno.exit(1);
  }

  const dir = `${Deno.cwd()}/${target}`;
  if (!(await isEmptyDir(dir))) {
    console.error(
      c("\x1b[31m", `Directory "${target}" already exists and is not empty.`),
    );
    Deno.exit(1);
  }

  console.log(`\nScaffolding ${c(BOLD, target)} …\n`);

  for (const file of templateFiles(target)) {
    const full = `${dir}/${file.path}`;
    const slash = full.lastIndexOf("/");
    await Deno.mkdir(full.slice(0, slash), { recursive: true });
    if (file.encoding === "base64") {
      // atob keeps the published package dependency-free (no @std/encoding).
      const bin = atob(file.contents);
      const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
      await Deno.writeFile(full, bytes);
    } else {
      await Deno.writeTextFile(full, file.contents);
    }
    console.log(`  ${c(GREEN, "+")} ${c(DIM, `${target}/`)}${file.path}`);
  }

  console.log(`\n${c(GREEN, "Done.")} Next:\n`);
  console.log(`  ${c(CYAN, `cd ${target}`)}`);
  console.log(`  ${c(CYAN, "deno install")}`);
  console.log(`  ${c(CYAN, "deno task dev")}\n`);
}

if (import.meta.main) {
  await main();
}
