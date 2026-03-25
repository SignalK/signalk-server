import { expect } from 'chai'
import { ContainerJobsApi } from '../dist/api/containerjobs/index.js'
import { ContainerJobError } from '@signalk/server-api'
import {
  cleanEnv,
  detectRuntime,
  buildVolumeArgs,
  appendToLog,
  imageExists
} from '../dist/api/containerjobs/runtime.js'
import type {
  ContainerJobConfig,
  ContainerRuntimeInfo
} from '@signalk/server-api'

describe('Container Jobs API - runtime utilities', () => {
  describe('cleanEnv', () => {
    it('strips systemd socket activation variables', () => {
      const original = { ...process.env }
      process.env.LISTEN_FDS = '1'
      process.env.LISTEN_PID = '1234'
      process.env.LISTEN_FDNAMES = 'test'
      process.env.HOME = '/home/test'

      try {
        const env = cleanEnv()

        expect(env.LISTEN_FDS).to.be.undefined
        expect(env.LISTEN_PID).to.be.undefined
        expect(env.LISTEN_FDNAMES).to.be.undefined
        expect(env.HOME).to.equal('/home/test')
      } finally {
        delete process.env.LISTEN_FDS
        delete process.env.LISTEN_PID
        delete process.env.LISTEN_FDNAMES
        Object.assign(process.env, original)
      }
    })
  })

  describe('buildVolumeArgs', () => {
    const podmanInfo: ContainerRuntimeInfo = {
      runtime: 'podman',
      version: 'podman version 5.0.0'
    }
    const dockerInfo: ContainerRuntimeInfo = {
      runtime: 'docker',
      version: 'Docker version 27.0.0'
    }
    const shimInfo: ContainerRuntimeInfo = {
      runtime: 'podman',
      version: 'podman version 5.0.0',
      isPodmanDockerShim: true
    }

    it('generates read-only volume args with :Z for podman inputs', () => {
      const config: ContainerJobConfig = {
        image: 'test',
        command: ['echo'],
        inputs: { '/input': '/host/source' }
      }
      const args = buildVolumeArgs(config, podmanInfo)
      expect(args).to.deep.equal(['-v', '/host/source:/input:ro,Z'])
    })

    it('generates read-write volume args with :Z for podman outputs', () => {
      const config: ContainerJobConfig = {
        image: 'test',
        command: ['echo'],
        outputs: { '/output': '/host/dest' }
      }
      const args = buildVolumeArgs(config, podmanInfo)
      expect(args).to.deep.equal(['-v', '/host/dest:/output:Z'])
    })

    it('omits :Z for docker inputs', () => {
      const config: ContainerJobConfig = {
        image: 'test',
        command: ['echo'],
        inputs: { '/input': '/host/source' }
      }
      const args = buildVolumeArgs(config, dockerInfo)
      expect(args).to.deep.equal(['-v', '/host/source:/input:ro'])
    })

    it('omits :Z for docker outputs', () => {
      const config: ContainerJobConfig = {
        image: 'test',
        command: ['echo'],
        outputs: { '/output': '/host/dest' }
      }
      const args = buildVolumeArgs(config, dockerInfo)
      expect(args).to.deep.equal(['-v', '/host/dest:/output'])
    })

    it('uses :Z for podman-docker shim', () => {
      const config: ContainerJobConfig = {
        image: 'test',
        command: ['echo'],
        inputs: { '/input': '/host/source' },
        outputs: { '/output': '/host/dest' }
      }
      const args = buildVolumeArgs(config, shimInfo)
      expect(args).to.deep.equal([
        '-v',
        '/host/source:/input:ro,Z',
        '-v',
        '/host/dest:/output:Z'
      ])
    })

    it('handles multiple inputs and outputs', () => {
      const config: ContainerJobConfig = {
        image: 'test',
        command: ['echo'],
        inputs: { '/in1': '/host/a', '/in2': '/host/b' },
        outputs: { '/out1': '/host/c' }
      }
      const args = buildVolumeArgs(config, podmanInfo)
      expect(args).to.have.lengthOf(6)
      expect(args).to.include('-v')
    })

    it('returns empty array when no volumes specified', () => {
      const config: ContainerJobConfig = {
        image: 'test',
        command: ['echo']
      }
      const args = buildVolumeArgs(config, podmanInfo)
      expect(args).to.deep.equal([])
    })
  })

  describe('appendToLog', () => {
    it('appends lines to log buffer', () => {
      const log: string[] = []
      appendToLog(log, 'line1\nline2\n')
      expect(log).to.deep.equal(['line1', 'line2'])
    })

    it('respects max log lines limit', () => {
      const log: string[] = []
      for (let i = 0; i < 120; i++) {
        appendToLog(log, `line${i}`)
      }
      expect(log.length).to.be.at.most(100)
      expect(log[log.length - 1]).to.equal('line119')
    })

    it('filters empty lines', () => {
      const log: string[] = []
      appendToLog(log, 'line1\n\n\nline2')
      expect(log).to.deep.equal(['line1', 'line2'])
    })
  })
})

describe('Container Jobs API - ContainerJobsApi', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type RouteHandler = (...args: any[]) => void
  function createMockApp(settingsOverride?: object) {
    const routes: Record<string, RouteHandler> = {}
    return {
      config: {
        settings: {
          containerJobsApi: settingsOverride
        },
        configPath: '/tmp/test'
      },
      securityStrategy: {
        shouldAllowPut: () => true
      },
      get: (path: string, handler: RouteHandler) => {
        routes[`GET ${path}`] = handler
      },
      post: (path: string, handler: RouteHandler) => {
        routes[`POST ${path}`] = handler
      },
      put: (path: string, handler: RouteHandler) => {
        routes[`PUT ${path}`] = handler
      },
      delete: (path: string, handler: RouteHandler) => {
        routes[`DELETE ${path}`] = handler
      },
      _routes: routes
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
  }

  it('creates with default settings when none provided', () => {
    const app = createMockApp()
    new ContainerJobsApi(app)
    expect(app.config.settings.containerJobsApi).to.deep.include({
      preferredRuntime: 'auto',
      maxConcurrentJobs: 2,
      completedJobRetention: 300000
    })
  })

  it('preserves existing settings', () => {
    const app = createMockApp({
      preferredRuntime: 'podman',
      maxConcurrentJobs: 4,
      completedJobRetention: 60000
    })
    new ContainerJobsApi(app)
    expect(app.config.settings.containerJobsApi.preferredRuntime).to.equal(
      'podman'
    )
    expect(app.config.settings.containerJobsApi.maxConcurrentJobs).to.equal(4)
  })

  it('fills in missing settings with defaults', () => {
    const app = createMockApp({ preferredRuntime: 'docker' })
    new ContainerJobsApi(app)
    expect(app.config.settings.containerJobsApi.preferredRuntime).to.equal(
      'docker'
    )
    expect(app.config.settings.containerJobsApi.maxConcurrentJobs).to.equal(2)
    expect(app.config.settings.containerJobsApi.completedJobRetention).to.equal(
      300000
    )
  })

  it('getRuntimeInfo returns null before start', () => {
    const app = createMockApp()
    const api = new ContainerJobsApi(app)
    expect(api.getRuntimeInfo()).to.be.null
  })

  it('throws 503 when no runtime available', async () => {
    const app = createMockApp()
    const api = new ContainerJobsApi(app)
    try {
      await api.runJob({
        image: 'alpine',
        command: ['echo', 'hello']
      })
      expect.fail('Should have thrown')
    } catch (err) {
      expect(err).to.be.instanceOf(ContainerJobError)
      expect((err as ContainerJobError).statusCode).to.equal(503)
    }
  })

  it('registers REST routes', () => {
    const app = createMockApp()
    new ContainerJobsApi(app)
    expect(app._routes['GET /signalk/v2/api/containerjobs']).to.be.a('function')
    expect(app._routes['GET /signalk/v2/api/containerjobs/runtime']).to.be.a(
      'function'
    )
    expect(app._routes['GET /signalk/v2/api/containerjobs/:jobId']).to.be.a(
      'function'
    )
    expect(app._routes['DELETE /signalk/v2/api/containerjobs/:jobId']).to.be.a(
      'function'
    )
    expect(
      app._routes['POST /signalk/v2/api/containerjobs/images/prune']
    ).to.be.a('function')
  })

  it('stop cleans up timers', () => {
    const app = createMockApp()
    const api = new ContainerJobsApi(app)
    api.stop()
  })
})

describe('Container Jobs API - runtime detection', () => {
  it('detectRuntime returns info when podman is available', async function () {
    this.timeout(10000)
    const result = await detectRuntime('auto')
    if (result) {
      expect(result.runtime).to.be.oneOf(['podman', 'docker'])
      expect(result.version).to.be.a('string').that.is.not.empty
    }
  })

  it('imageExists returns false for non-existent image', async function () {
    this.timeout(10000)
    const runtimeInfo = await detectRuntime('auto')
    if (!runtimeInfo) {
      this.skip()
      return
    }
    const exists = await imageExists(
      runtimeInfo,
      'nonexistent-image-that-does-not-exist:never'
    )
    expect(exists).to.be.false
  })
})
