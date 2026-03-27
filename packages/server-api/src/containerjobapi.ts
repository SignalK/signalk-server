/** @category Container Jobs API */
export type ContainerJobStatus =
  | 'pending'
  | 'pulling'
  | 'running'
  | 'completed'
  | 'failed'

/** @category Container Jobs API */
export type ContainerRuntime = 'podman' | 'docker'

/** @category Container Jobs API */
export interface ContainerJobProgress {
  stream: 'stdout' | 'stderr'
  data: string
}

/** @category Container Jobs API */
export interface ContainerJobConfig {
  image: string
  command: string[]
  /**
   * Input volume mounts: keys are container paths, values are host paths.
   * Mounted read-only.
   */
  inputs?: Record<string, string>
  /**
   * Output volume mounts: keys are container paths, values are host paths.
   * Mounted read-write.
   */
  outputs?: Record<string, string>
  env?: Record<string, string>
  /**
   * Total timeout in milliseconds across pull and run phases (default: 600000).
   * If exceeded, the container is killed and the job fails.
   */
  timeout?: number
  onProgress?: (data: ContainerJobProgress) => void
  label?: string
}

/** @category Container Jobs API */
export interface ContainerJobResult {
  id: string
  status: ContainerJobStatus
  image: string
  command: string[]
  label?: string
  exitCode: number | null
  log: string[]
  error?: string
  createdAt: string
  startedAt?: string
  completedAt?: string
  runtime: ContainerRuntime
}

/** @category Container Jobs API */
export interface ContainerRuntimeInfo {
  runtime: ContainerRuntime
  version: string
  isPodmanDockerShim?: boolean
}

/** @category Container Jobs API */
export class ContainerJobError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message)
    this.name = 'ContainerJobError'
  }
}

/**
 * @ignore this is extended by {@link ServerAPI}, no need to document separately
 */
export interface WithContainerJobsApi {
  /**
   * Run a container job using the server's detected container runtime.
   *
   * @throws {ContainerJobError} statusCode 503 if no container runtime is available
   * @throws {ContainerJobError} statusCode 429 if concurrency limit is reached
   */
  runContainerJob(config: ContainerJobConfig): Promise<ContainerJobResult>

  /**
   * List tracked container jobs, optionally filtered by label substring.
   */
  listContainerJobs(label?: string): ContainerJobResult[]

  getContainerRuntime(): ContainerRuntimeInfo | null
}
