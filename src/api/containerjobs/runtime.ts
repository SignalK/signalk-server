import { execFile, spawn, ChildProcess } from 'child_process'
import {
  ContainerRuntimeInfo,
  ContainerJobConfig,
  ContainerJobProgress
} from '@signalk/server-api'

const DEFAULT_PULL_TIMEOUT = 600000
const IMAGE_EXISTS_TIMEOUT = 30000
const MAX_LOG_LINES = 100

export function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  delete env.LISTEN_FDS
  delete env.LISTEN_PID
  delete env.LISTEN_FDNAMES
  return env
}

function tryRuntime(
  binary: string
): Promise<{ available: boolean; version: string; output: string }> {
  return new Promise((resolve) => {
    execFile(binary, ['--version'], { env: cleanEnv() }, (error, stdout) => {
      if (error) {
        resolve({ available: false, version: '', output: '' })
      } else {
        resolve({
          available: true,
          version: stdout.trim(),
          output: stdout.toLowerCase()
        })
      }
    })
  })
}

export async function detectRuntime(
  preferred: 'podman' | 'docker' | 'auto'
): Promise<ContainerRuntimeInfo | null> {
  const order: Array<'podman' | 'docker'> =
    preferred === 'docker' ? ['docker', 'podman'] : ['podman', 'docker']

  for (const binary of order) {
    const result = await tryRuntime(binary)
    if (!result.available) {
      continue
    }

    if (binary === 'docker' && result.output.includes('podman')) {
      return {
        runtime: 'podman',
        version: result.version,
        isPodmanDockerShim: true
      }
    }

    return { runtime: binary, version: result.version }
  }

  return null
}

function isPodman(info: ContainerRuntimeInfo): boolean {
  return info.runtime === 'podman' || info.isPodmanDockerShim === true
}

function runtimeBinary(info: ContainerRuntimeInfo): string {
  return info.isPodmanDockerShim ? 'docker' : info.runtime
}

export function imageExists(
  info: ContainerRuntimeInfo,
  image: string
): Promise<boolean> {
  const binary = runtimeBinary(info)
  const args = isPodman(info)
    ? ['image', 'exists', image]
    : ['image', 'inspect', image]

  return new Promise((resolve) => {
    execFile(
      binary,
      args,
      { env: cleanEnv(), timeout: IMAGE_EXISTS_TIMEOUT },
      (error) => {
        resolve(!error)
      }
    )
  })
}

export function pullImage(
  info: ContainerRuntimeInfo,
  image: string,
  timeout: number = DEFAULT_PULL_TIMEOUT
): { promise: Promise<void>; child: ChildProcess } {
  const binary = runtimeBinary(info)
  const child = spawn(binary, ['pull', image], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: cleanEnv()
  })

  let stderr = ''
  child.stderr?.on('data', (data: Buffer) => {
    stderr += data.toString()
  })

  let timeoutId: ReturnType<typeof setTimeout> | undefined

  const promise = new Promise<void>((resolve, reject) => {
    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error(`Image pull timed out after ${timeout}ms`))
      }, timeout)
    }

    child.on('error', (err) => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      reject(new Error(`Failed to pull ${image}: ${err.message}`))
    })

    child.on('close', (code) => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      if (code !== 0) {
        reject(
          new Error(`Failed to pull ${image} (exit ${code}): ${stderr.trim()}`)
        )
      } else {
        resolve()
      }
    })
  })

  return { promise, child }
}

export interface PruneResult {
  imagesRemoved: number
  spaceReclaimed: string
}

export function pruneImages(info: ContainerRuntimeInfo): Promise<PruneResult> {
  const binary = runtimeBinary(info)
  return new Promise((resolve, reject) => {
    execFile(
      binary,
      ['image', 'prune', '-f'],
      { timeout: 60000, env: cleanEnv() },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(`Failed to prune images: ${stderr || error.message}`)
          )
        } else {
          const lines = stdout
            .trim()
            .split(/\r?\n/)
            .filter((l) => l.length > 0)
          resolve({
            imagesRemoved: lines.length,
            spaceReclaimed: stdout.trim()
          })
        }
      }
    )
  })
}

export function buildVolumeArgs(
  config: ContainerJobConfig,
  info: ContainerRuntimeInfo
): string[] {
  const args: string[] = []
  const zFlag = isPodman(info) ? ',Z' : ''

  if (config.inputs) {
    for (const [containerPath, hostPath] of Object.entries(config.inputs)) {
      args.push('-v', `${hostPath}:${containerPath}:ro${zFlag}`)
    }
  }

  if (config.outputs) {
    for (const [containerPath, hostPath] of Object.entries(config.outputs)) {
      args.push('-v', `${hostPath}:${containerPath}${zFlag ? ':Z' : ''}`)
    }
  }

  return args
}

function buildEnvArgs(env?: Record<string, string>): string[] {
  if (!env) {
    return []
  }
  const args: string[] = []
  for (const [key, value] of Object.entries(env)) {
    args.push('-e', `${key}=${value}`)
  }
  return args
}

export function appendToLog(log: string[], text: string): void {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
  log.push(...lines)
  if (log.length > MAX_LOG_LINES) {
    log.splice(0, log.length - MAX_LOG_LINES)
  }
}

export interface ContainerExecResult {
  exitCode: number
}

export function executeContainer(
  config: ContainerJobConfig,
  info: ContainerRuntimeInfo,
  log: string[],
  onProgress?: (data: ContainerJobProgress) => void
): { promise: Promise<ContainerExecResult>; child: ChildProcess } {
  const binary = runtimeBinary(info)
  const volumeArgs = buildVolumeArgs(config, info)
  const envArgs = buildEnvArgs(config.env)

  const args = [
    'run',
    '--rm',
    '--init',
    ...volumeArgs,
    ...envArgs,
    config.image,
    ...config.command
  ]

  const child = spawn(binary, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: cleanEnv()
  })

  const handleData = (stream: 'stdout' | 'stderr') => (data: Buffer) => {
    const text = data.toString()
    appendToLog(log, text)
    try {
      onProgress?.({ stream, data: text })
    } catch {
      // plugin callback errors must not crash the process
    }
  }

  child.stdout?.on('data', handleData('stdout'))
  child.stderr?.on('data', handleData('stderr'))

  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = config.timeout ?? DEFAULT_PULL_TIMEOUT

  const promise = new Promise<ContainerExecResult>((resolve, reject) => {
    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error(`Container timed out after ${timeout}ms`))
      }, timeout)
    }

    child.on('error', (err) => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      reject(new Error(`Failed to start ${binary}: ${err.message}`))
    })

    child.on('close', (code) => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      resolve({ exitCode: code ?? 1 })
    })
  })

  return { promise, child }
}
