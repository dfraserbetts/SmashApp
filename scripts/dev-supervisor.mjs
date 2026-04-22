import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const nextBin = path.join(rootDir, 'node_modules', 'next', 'dist', 'bin', 'next');

const watchedFiles = [
  path.join(rootDir, 'prisma', 'schema.prisma'),
  path.join(rootDir, 'prisma', 'client.ts'),
  path.join(rootDir, 'package.json'),
];

const watchedDirs = [
  path.join(rootDir, 'prisma', 'migrations'),
];

let child = null;
let restartTimer = null;
let shuttingDown = false;

function log(message) {
  process.stdout.write(`[dev-supervisor] ${message}\n`);
}

function startChild() {
  child = spawn(process.execPath, [nextBin, 'dev'], {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    if (signal) {
      log(`Next dev exited from signal ${signal}.`);
      return;
    }
    if (code && code !== 0) {
      log(`Next dev exited with code ${code}. Waiting for file changes or manual restart.`);
    }
  });
}

function stopChildAndRestart(reason) {
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    log(`Restarting dev server because ${reason}.`);
    const previousChild = child;
    if (!previousChild || previousChild.killed) {
      startChild();
      return;
    }

    previousChild.once('exit', () => {
      if (!shuttingDown) startChild();
    });

    previousChild.kill('SIGTERM');
    setTimeout(() => {
      if (!shuttingDown && previousChild.exitCode === null && !previousChild.killed) {
        previousChild.kill('SIGKILL');
      }
    }, 3000);
  }, 150);
}

function watchFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  fs.watchFile(filePath, { interval: 300 }, (current, previous) => {
    if (current.mtimeMs !== previous.mtimeMs) {
      stopChildAndRestart(path.relative(rootDir, filePath));
    }
  });
}

function watchDir(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  try {
    fs.watch(
      dirPath,
      { recursive: true },
      (_eventType, filename) => {
        stopChildAndRestart(
          filename ? path.join(path.relative(rootDir, dirPath), filename.toString()) : path.relative(rootDir, dirPath),
        );
      },
    );
  } catch {
    fs.watch(dirPath, (_eventType, filename) => {
      stopChildAndRestart(
        filename ? path.join(path.relative(rootDir, dirPath), filename.toString()) : path.relative(rootDir, dirPath),
      );
    });
  }
}

for (const filePath of watchedFiles) watchFile(filePath);
for (const dirPath of watchedDirs) watchDir(dirPath);

function shutdown(signal) {
  shuttingDown = true;
  if (restartTimer) clearTimeout(restartTimer);
  log(`Shutting down from ${signal}.`);
  if (!child || child.killed) {
    process.exit(0);
    return;
  }
  child.once('exit', () => process.exit(0));
  child.kill('SIGTERM');
  setTimeout(() => {
    if (child && child.exitCode === null && !child.killed) {
      child.kill('SIGKILL');
    }
  }, 3000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

log('Watching Prisma/runtime files for restart-sensitive changes.');
startChild();
