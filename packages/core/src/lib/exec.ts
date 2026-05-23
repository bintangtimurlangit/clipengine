/**
 * Ergonomic wrapper around `execa`. The engine spawns ffmpeg,
 * ffprobe, yt-dlp, and the Whisper binary the same way: with a
 * deadline and an optional cancellation signal so the worker pool
 * can SIGTERM stuck subprocesses cleanly.
 */

import { type Options as ExecaOptions, execa, type ResultPromise } from 'execa';

export interface RunCommandOptions {
  /** Argv list, including subcommands. */
  args: string[];
  /** Optional working directory; defaults to the current process cwd. */
  cwd?: string;
  /**
   * AbortSignal that should kill the subprocess. The worker pool
   * passes a per-run signal so cancel propagates immediately.
   */
  signal?: AbortSignal;
  /**
   * Hard timeout in milliseconds. After this elapses the subprocess
   * is sent SIGTERM and the promise rejects.
   */
  timeoutMs?: number;
  /** Additional environment variables. */
  env?: Record<string, string>;
  /** Inherit stdio for live streaming, off by default. */
  stdio?: 'pipe' | 'inherit';
}

export interface RunCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Run a command and resolve once it exits successfully. */
export async function runCommand(
  command: string,
  options: RunCommandOptions,
): Promise<RunCommandResult> {
  const execaOptions: ExecaOptions = {
    cwd: options.cwd,
    env: options.env,
    cancelSignal: options.signal,
    timeout: options.timeoutMs,
    stdio: options.stdio ?? 'pipe',
    reject: true,
  };
  const result = (await execa(command, options.args, execaOptions)) as Awaited<ResultPromise>;
  return {
    exitCode: result.exitCode ?? 0,
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    stderr: typeof result.stderr === 'string' ? result.stderr : '',
  };
}

/** Like {@link runCommand} but returns the result even when the exit code is non-zero. */
export async function runCommandLossy(
  command: string,
  options: RunCommandOptions,
): Promise<RunCommandResult> {
  const result = await execa(command, options.args, {
    cwd: options.cwd,
    env: options.env,
    cancelSignal: options.signal,
    timeout: options.timeoutMs,
    stdio: options.stdio ?? 'pipe',
    reject: false,
  });
  return {
    exitCode: result.exitCode ?? -1,
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    stderr: typeof result.stderr === 'string' ? result.stderr : '',
  };
}
