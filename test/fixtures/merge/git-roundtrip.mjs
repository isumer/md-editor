#!/usr/bin/env node
// Builds a deterministic git repository with one unresolved merge conflict.
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureDir = dirname(fileURLToPath(import.meta.url));
const fixedName = 'Fixture Author';
const fixedEmail = 'fixture@example.invalid';
const fixedDate = '2005-04-07T22:13:13 +0000';

const config = [
  '-c',
  `user.name=${fixedName}`,
  '-c',
  `user.email=${fixedEmail}`,
  '-c',
  'core.autocrlf=false',
  '-c',
  'commit.gpgsign=false',
  '-c',
  'merge.conflictStyle=merge',
];

const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: fixedName,
  GIT_AUTHOR_EMAIL: fixedEmail,
  GIT_AUTHOR_DATE: fixedDate,
  GIT_COMMITTER_NAME: fixedName,
  GIT_COMMITTER_EMAIL: fixedEmail,
  GIT_COMMITTER_DATE: fixedDate,
};
// A caller's repository variables must not redirect writes outside the target.
for (const name of [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR',
]) {
  delete gitEnv[name];
}

function fail(message, code) {
  console.error(message);
  process.exit(code);
}

function git(args, options = {}) {
  return spawnSync('git', [...config, ...args], {
    cwd: options.cwd,
    env: gitEnv,
    encoding: 'utf8',
  });
}

function gitOrFail(args, options) {
  const result = git(args, options);
  if (result.error || result.status !== 0) {
    const detail =
      result.error?.message || result.stderr?.trim() || result.stdout?.trim() || '';
    fail(`git ${args.join(' ')} failed: ${detail}`, 1);
  }
  return result.stdout;
}

function commitDoc(sourceName, message, cwd) {
  writeFileSync(join(cwd, 'doc.txt'), readFileSync(join(fixtureDir, sourceName)));
  gitOrFail(['add', 'doc.txt'], { cwd });
  gitOrFail(['commit', '--quiet', '-m', message], { cwd });
}

function main() {
  const targetArg = process.argv[2];
  if (targetArg === undefined) {
    fail('usage: node git-roundtrip.mjs <target-dir>', 1);
  }

  const probe = spawnSync('git', ['--version'], { env: gitEnv, stdio: 'ignore' });
  if (probe.error || probe.status !== 0) {
    fail('git is not available on PATH', 3);
  }

  const targetDir = resolve(targetArg);
  if (existsSync(targetDir)) {
    if (!statSync(targetDir).isDirectory()) {
      fail(`target is not a directory: ${targetDir}`, 2);
    }
    if (readdirSync(targetDir).length > 0) {
      fail(`target directory is not empty: ${targetDir}`, 2);
    }
  } else {
    mkdirSync(targetDir, { recursive: true });
  }

  gitOrFail(['init', '--quiet'], { cwd: targetDir });
  gitOrFail(['symbolic-ref', 'HEAD', 'refs/heads/main'], { cwd: targetDir });

  commitDoc('base.txt', 'Add base document', targetDir);

  gitOrFail(['checkout', '--quiet', '-b', 'left'], { cwd: targetDir });
  commitDoc('left.txt', 'Add left document', targetDir);

  gitOrFail(['checkout', '--quiet', 'main'], { cwd: targetDir });
  gitOrFail(['checkout', '--quiet', '-b', 'right'], { cwd: targetDir });
  commitDoc('right.txt', 'Add right document', targetDir);

  gitOrFail(['checkout', '--quiet', 'left'], { cwd: targetDir });
  const merge = git(['merge', '--quiet', 'right'], { cwd: targetDir });
  if (merge.error || merge.status !== 1) {
    const detail =
      merge.error?.message || merge.stderr?.trim() || merge.stdout?.trim() || '';
    fail(`git merge right did not produce a conflict: ${detail}`, 1);
  }

  const status = gitOrFail(['status', '--porcelain'], { cwd: targetDir });
  const lines = status.split('\n').filter((line) => line.length > 0);
  if (!lines.some((line) => line.startsWith('UU '))) {
    fail('merge has no unmerged doc.txt', 1);
  }

  console.log(`doc.txt: ${join(targetDir, 'doc.txt')}`);
  console.log('merge state:');
  for (const line of lines) {
    console.log(line);
  }
}

main();
