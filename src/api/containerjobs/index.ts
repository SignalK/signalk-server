/* eslint-disable @typescript-eslint/no-explicit-any */
import { createDebug } from '../../debug'
const debug = createDebug('signalk-server:api:containerjobs')

import { IRouter, Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { ChildProcess } from 'child_process'

import { WithSecurityStrategy } from '../../security'
import { WithConfig } from '../../app'
import { Responses } from '../'
import { writeSettingsFile } from '../../config/config'

import {
  ContainerJobConfig,
  ContainerJobError,
  ContainerJobResult,
  ContainerRuntimeInfo
} from '@signalk/server-api'

import {
  detectRuntime,
  imageExists,
  pullImage,
  pruneImages,
  executeContainer
} from './runtime'

export const CONTAINER_JOBS_API_PATH = `/signalk/v2/api/containerjobs`

interface ContainerJobsApplication
  extends IRouter, WithConfig, WithSecurityStrategy {}

interface ContainerJobsSettings {
  preferredRuntime: 'podman' | 'docker' | 'auto'
  maxConcurrentJobs: number
  completedJobRetention: number
}

export class ContainerJobsApi {
  private app: ContainerJobsApplication
  private settings!: ContainerJobsSettings
  private runtimeInfo: ContainerRuntimeInfo | null = null
  private jobs: Map<string, ContainerJobResult> = new Map()
  private activeJobCount = 0
  private activeChildren: Map<string, ChildProcess> = new Map()
  private cleanupTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

  constructor(app: ContainerJobsApplication) {
    this.app = app
    this.parseSettings()
    this.initRoutes()
  }

  async start(): Promise<void> {
    this.runtimeInfo = await detectRuntime(this.settings.preferredRuntime)
    if (this.runtimeInfo) {
      debug(
        `Container runtime: ${this.runtimeInfo.runtime} ${this.runtimeInfo.version}` +
          (this.runtimeInfo.isPodmanDockerShim ? ' (podman-docker shim)' : '')
      )
    } else {
      debug('No container runtime found (podman or docker)')
    }
  }

  stop(): void {
    for (const [jobId, child] of this.activeChildren) {
      debug(`Killing container process for job ${jobId}`)
      child.kill('SIGKILL')
    }
    this.activeChildren.clear()
    for (const timer of this.cleanupTimers.values()) {
      clearTimeout(timer)
    }
    this.cleanupTimers.clear()
  }

  getRuntimeInfo(): ContainerRuntimeInfo | null {
    return this.runtimeInfo
  }

  listJobs(label?: string): ContainerJobResult[] {
    let jobs = Array.from(this.jobs.values())
    if (label) {
      jobs = jobs.filter((j) => j.label?.includes(label))
    }
    return jobs.map((job) => ({
      ...job,
      command: [...job.command],
      log: [...job.log]
    }))
  }

  async runJob(config: ContainerJobConfig): Promise<ContainerJobResult> {
    if (!this.runtimeInfo) {
      throw new ContainerJobError(
        'No container runtime available (podman or docker not found)',
        503
      )
    }

    if (this.activeJobCount >= this.settings.maxConcurrentJobs) {
      debug(
        `Rejecting job: ${this.activeJobCount}/${this.settings.maxConcurrentJobs} concurrent jobs running`
      )
      throw new ContainerJobError(
        `Too many concurrent container jobs (max ${this.settings.maxConcurrentJobs})`,
        429
      )
    }

    const jobConfig: ContainerJobConfig = {
      ...config,
      command: [...config.command],
      inputs: config.inputs ? { ...config.inputs } : undefined,
      outputs: config.outputs ? { ...config.outputs } : undefined,
      env: config.env ? { ...config.env } : undefined
    }

    const totalTimeout = jobConfig.timeout ?? 600000
    const deadline = Date.now() + totalTimeout

    const jobId = uuidv4()
    const jobLabel = jobConfig.label ? ` (${jobConfig.label})` : ''
    debug(
      `Job ${jobId}${jobLabel}: starting ${jobConfig.image} ${jobConfig.command.join(' ')}`
    )
    const job: ContainerJobResult = {
      id: jobId,
      status: 'pending',
      image: jobConfig.image,
      command: [...jobConfig.command],
      label: jobConfig.label,
      exitCode: null,
      log: [],
      createdAt: new Date().toISOString(),
      runtime: this.runtimeInfo.runtime
    }
    this.jobs.set(jobId, job)
    this.activeJobCount++

    try {
      job.status = 'pulling'
      const exists = await imageExists(this.runtimeInfo, jobConfig.image)
      if (!exists) {
        debug(`Pulling image: ${jobConfig.image}`)
        jobConfig.onProgress?.({
          stream: 'stderr',
          data: `Pulling image ${jobConfig.image}...\n`
        })
        const pullTimeout = Math.max(0, deadline - Date.now())
        const pull = pullImage(this.runtimeInfo, jobConfig.image, pullTimeout)
        this.activeChildren.set(jobId, pull.child)
        await pull.promise
        this.activeChildren.delete(jobId)
        debug(`Image pulled: ${jobConfig.image}`)
        pruneImages(this.runtimeInfo!).catch((err) =>
          debug(`Image prune after pull failed: ${err.message}`)
        )
      }

      job.status = 'running'
      job.startedAt = new Date().toISOString()

      const runTimeout = Math.max(0, deadline - Date.now())
      const { promise, child } = executeContainer(
        { ...jobConfig, timeout: runTimeout },
        this.runtimeInfo,
        job.log,
        jobConfig.onProgress
      )

      this.activeChildren.set(jobId, child)

      const result = await promise

      this.activeChildren.delete(jobId)

      job.exitCode = result.exitCode
      job.status = result.exitCode === 0 ? 'completed' : 'failed'
      job.completedAt = new Date().toISOString()
      if (result.exitCode !== 0) {
        job.error = `Container exited with code ${result.exitCode}`
        debug(
          `Job ${jobId}${jobLabel}: failed with exit code ${result.exitCode}`
        )
      } else {
        debug(`Job ${jobId}${jobLabel}: completed successfully`)
      }
    } catch (err: any) {
      this.activeChildren.delete(jobId)
      job.status = 'failed'
      job.error = err instanceof Error ? err.message : String(err)
      job.completedAt = new Date().toISOString()
      debug(`Job ${jobId}${jobLabel}: failed with error: ${job.error}`)
    } finally {
      this.activeJobCount--
      this.scheduleCleanup(jobId)
    }

    return { ...job, command: [...job.command], log: [...job.log] }
  }

  private scheduleCleanup(jobId: string): void {
    const timer = setTimeout(() => {
      this.jobs.delete(jobId)
      this.cleanupTimers.delete(jobId)
    }, this.settings.completedJobRetention)
    this.cleanupTimers.set(jobId, timer)
  }

  private parseSettings(): void {
    const defaultSettings: ContainerJobsSettings = {
      preferredRuntime: 'auto',
      maxConcurrentJobs: 2,
      completedJobRetention: 300000
    }

    const existing = (this.app.config.settings as any)['containerJobsApi']
    if (!existing) {
      debug('Applying default settings')
      ;(this.app.config.settings as any)['containerJobsApi'] = defaultSettings
    } else {
      if (existing.preferredRuntime === undefined) {
        existing.preferredRuntime = defaultSettings.preferredRuntime
      }
      if (existing.maxConcurrentJobs === undefined) {
        existing.maxConcurrentJobs = defaultSettings.maxConcurrentJobs
      }
      if (existing.completedJobRetention === undefined) {
        existing.completedJobRetention = defaultSettings.completedJobRetention
      }
    }
    this.settings = (this.app.config.settings as any)['containerJobsApi']
  }

  saveSettings(): void {
    writeSettingsFile(
      this.app as any,
      this.app.config.settings,
      (err?: Error) => {
        if (err) {
          debug(`Failed to save settings: ${err.message}`)
        } else {
          debug('Settings saved')
        }
      }
    )
  }

  private initRoutes(): void {
    const writeAllowed = (req: Request): boolean =>
      this.app.securityStrategy.shouldAllowPut(
        req,
        'vessels.self',
        null,
        'containerjobs'
      )

    this.app.get(
      `${CONTAINER_JOBS_API_PATH}/runtime`,
      (req: Request, res: Response) => {
        if (!writeAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        if (this.runtimeInfo) {
          res.json(this.runtimeInfo)
        } else {
          res.json({ runtime: null, message: 'No container runtime found' })
        }
      }
    )

    this.app.get(
      `${CONTAINER_JOBS_API_PATH}/:jobId`,
      (req: Request, res: Response) => {
        if (!writeAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        const job = this.jobs.get(req.params.jobId)
        if (job) {
          res.json({ ...job, command: [...job.command], log: [...job.log] })
        } else {
          res.status(404).json(Responses.notFound)
        }
      }
    )

    this.app.get(
      `${CONTAINER_JOBS_API_PATH}`,
      (req: Request, res: Response) => {
        if (!writeAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        let jobs = Array.from(this.jobs.values())
        const label = req.query.label as string | undefined
        if (label) {
          jobs = jobs.filter((j) => j.label?.includes(label))
        }
        res.json(
          jobs.map((job) => ({
            ...job,
            command: [...job.command],
            log: [...job.log]
          }))
        )
      }
    )

    this.app.delete(
      `${CONTAINER_JOBS_API_PATH}/:jobId`,
      (req: Request, res: Response) => {
        if (!writeAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }

        const job = this.jobs.get(req.params.jobId)
        if (!job) {
          res.status(404).json(Responses.notFound)
          return
        }

        if (job.status === 'running' || job.status === 'pulling') {
          res.status(409).json({
            state: 'FAILED',
            statusCode: 409,
            message: 'Cannot delete an active job'
          })
          return
        }

        this.jobs.delete(req.params.jobId)
        const timer = this.cleanupTimers.get(req.params.jobId)
        if (timer) {
          clearTimeout(timer)
          this.cleanupTimers.delete(req.params.jobId)
        }
        res.json(Responses.ok)
      }
    )

    this.app.post(
      `${CONTAINER_JOBS_API_PATH}/images/prune`,
      async (req: Request, res: Response) => {
        if (!writeAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }

        if (!this.runtimeInfo) {
          res.status(503).json({
            state: 'FAILED',
            statusCode: 503,
            message: 'No container runtime available'
          })
          return
        }

        try {
          debug('Manual image prune requested')
          const result = await pruneImages(this.runtimeInfo)
          debug(`Image prune complete: ${result.imagesRemoved} images removed`)
          res.json({
            state: 'COMPLETED',
            statusCode: 200,
            ...result
          })
        } catch (err: any) {
          debug(`Image prune failed: ${err.message}`)
          res.status(500).json({
            state: 'FAILED',
            statusCode: 500,
            message: err.message
          })
        }
      }
    )
  }
}
