---
title: Container Jobs API
---

# Container Jobs API

The Container Jobs API allows plugins to run containerized workloads (using podman or docker) through the server, without managing container runtimes directly.

The server automatically detects the available container runtime at startup (podman is preferred, with docker as fallback). Plugins use `app.runContainerJob()` to run containers, while the REST endpoints provide monitoring and management for the Admin UI and other clients.

## Plugin API

### Check runtime availability

```typescript
const runtime = app.getContainerRuntime()
if (runtime) {
  app.debug(`Container runtime: ${runtime.runtime} ${runtime.version}`)
} else {
  app.debug('No container runtime available')
}
```

Returns `null` if neither podman nor docker is installed, or a `ContainerRuntimeInfo` object:

```typescript
interface ContainerRuntimeInfo {
  runtime: 'podman' | 'docker'
  version: string
  isPodmanDockerShim?: boolean
}
```

### Run a container job

```typescript
import {
  ContainerJobConfig,
  ContainerJobResult,
  ContainerJobError
} from '@signalk/server-api'

try {
  const result: ContainerJobResult = await app.runContainerJob({
    image: 'ghcr.io/osgeo/gdal:alpine-small-latest',
    command: [
      'ogr2ogr',
      '-f',
      'GeoJSON',
      '/output/data.json',
      '/input/source.shp'
    ],
    inputs: { '/input': '/path/to/input/dir' },
    outputs: { '/output': '/path/to/output/dir' },
    env: { OGR_GEOMETRY_ACCEPT_UNCLOSED_RING: 'YES' },
    timeout: 300000,
    label: 'my-plugin:convert-shapefile',
    onProgress: ({ stream, data }) => {
      app.debug(`[${stream}] ${data}`)
    }
  })

  if (result.exitCode === 0) {
    app.debug(`Job completed: ${result.id}`)
  } else {
    app.debug(`Container exited with code ${result.exitCode}`)
  }
} catch (err) {
  if (err instanceof ContainerJobError) {
    // err.statusCode: 503 (no runtime) or 429 (concurrency limit)
    app.debug(`Container job error: ${err.message}`)
  }
}
```

### ContainerJobConfig

| Property     | Type                     | Required | Description                                                                               |
| ------------ | ------------------------ | -------- | ----------------------------------------------------------------------------------------- |
| `image`      | `string`                 | yes      | Container image to run (pulled automatically if not present)                              |
| `command`    | `string[]`               | yes      | Command and arguments to execute                                                          |
| `inputs`     | `Record<string, string>` | no       | Read-only volume mounts (container path → host path)                                      |
| `outputs`    | `Record<string, string>` | no       | Read-write volume mounts (container path → host path)                                     |
| `env`        | `Record<string, string>` | no       | Environment variables passed to the container                                             |
| `timeout`    | `number`                 | no       | Total timeout in milliseconds across image pull and container execution (default: 600000) |
| `label`      | `string`                 | no       | Label for filtering jobs via `listContainerJobs()`                                        |
| `onProgress` | `function`               | no       | Callback receiving `{ stream: 'stdout' \| 'stderr', data: string }` chunks in real-time   |

### ContainerJobResult

| Property      | Type             | Description                                                |
| ------------- | ---------------- | ---------------------------------------------------------- |
| `id`          | `string`         | Unique job ID (UUID)                                       |
| `status`      | `string`         | `pending`, `pulling`, `running`, `completed`, or `failed`  |
| `image`       | `string`         | Container image used                                       |
| `command`     | `string[]`       | Command executed                                           |
| `label`       | `string`         | Job label (if provided)                                    |
| `exitCode`    | `number \| null` | Container exit code (`null` while running)                 |
| `log`         | `string[]`       | Rolling buffer of container stdout/stderr (last 100 lines) |
| `error`       | `string`         | Error message (if failed)                                  |
| `createdAt`   | `string`         | ISO 8601 timestamp                                         |
| `startedAt`   | `string`         | ISO 8601 timestamp (when container started running)        |
| `completedAt` | `string`         | ISO 8601 timestamp (when job finished)                     |
| `runtime`     | `string`         | Runtime used (`podman` or `docker`)                        |

### List tracked jobs

```typescript
const allJobs = app.listContainerJobs()
const myJobs = app.listContainerJobs('my-plugin')
```

Returns an array of `ContainerJobResult` objects, optionally filtered by label substring.

## Server behavior

- **Runtime detection** runs at startup. The server prefers podman over docker and detects podman-docker shims.
- **Image pulling** happens automatically before each job if the image is not present locally. Dangling images are pruned after each pull.
- **SELinux**: on systems with SELinux, the server adds `:Z` flags to volume mounts automatically when using podman.
- **Concurrency**: the server limits concurrent container jobs (default: 2, configurable via settings). Excess jobs receive a 429 error.
- **Timeouts** use a deadline model: the timeout budget is shared across image pull and container execution. If pulling takes 30 seconds of a 60-second timeout, the container gets the remaining 30 seconds.
- **Shutdown**: active containers are killed and cleanup timers cleared when the server stops.

## REST API

All endpoints require authentication with the `containerJobs` feature permission.

### `GET /signalk/v2/api/containerjobs/runtime`

Returns the detected container runtime, or 503 if none is available.

```json
{
  "runtime": "podman",
  "version": "podman version 5.4.2"
}
```

### `GET /signalk/v2/api/containerjobs`

Returns all tracked jobs (active and recently completed).

### `GET /signalk/v2/api/containerjobs/:jobId`

Returns a specific job by ID, or 404 if not found.

### `DELETE /signalk/v2/api/containerjobs/:jobId`

Removes a completed or failed job from tracking. Returns 409 if the job is still active.

### `POST /signalk/v2/api/containerjobs/images/prune`

Removes dangling (untagged) container images. Returns the output from the prune command.
