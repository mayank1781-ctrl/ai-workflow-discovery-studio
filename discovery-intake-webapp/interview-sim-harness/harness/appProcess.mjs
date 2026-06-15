import { spawn } from 'node:child_process';
import { sleep } from './util.mjs';

export async function bootApp(config) {
  if (config.skipAppBoot) {
    await waitForReady(config.appBaseUrl, 30_000);
    return { stop: async () => {}, booted: false };
  }
  if (!config.openAiKey) {
    throw new Error('OPENAI_API_KEY is not visible to this process; live-app mode cannot boot the app.');
  }

  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: config.appRoot,
    env: {
      ...process.env,
      AUTH_ENABLED: 'false',
      PORT: config.appPort,
      OPENAI_API_KEY: config.openAiKey
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const output = [];
  const remember = (chunk) => {
    const text = String(chunk || '');
    output.push(text);
    if (output.join('').length > 8000) output.shift();
  };
  child.stdout.on('data', remember);
  child.stderr.on('data', remember);

  try {
    await waitForReady(config.appBaseUrl, 30_000, child, () => output.join(''));
  } catch (error) {
    await stopApp(child);
    throw error;
  }

  return {
    booted: true,
    stop: () => stopApp(child),
    output: () => output.join('')
  };
}

async function waitForReady(url, timeoutMs, child = null, readOutput = () => '') {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (child?.exitCode !== null) {
      throw new Error(`App process exited before readiness. Output:\n${readOutput()}`);
    }
    try {
      const response = await fetch(url, { method: 'GET' });
      if (response.ok) return true;
    } catch {
      // Keep polling.
    }
    await sleep(500);
  }
  throw new Error(`App did not respond within ${Math.round(timeoutMs / 1000)}s at ${url}. Output:\n${readOutput()}`);
}

async function stopApp(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  const started = Date.now();
  while (child.exitCode === null && Date.now() - started < 5000) {
    await sleep(100);
  }
  if (child.exitCode === null) child.kill('SIGKILL');
}

