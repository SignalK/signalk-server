/* eslint-disable @typescript-eslint/no-explicit-any */
import nodePath from 'path'
import { marked } from 'marked'
import { IRouter, NextFunction, Request, Response } from 'express'
import swaggerUi from 'swagger-ui-express'
import { SERVERROUTESPREFIX } from '../constants'
import { courseApiRecord } from './course/openApi'
import { notificationsApiRecord } from './notifications/openApi'
import { resourcesApiRecord } from './resources/openApi'
import { autopilotApiRecord } from './autopilot/openApi'
import { securityApiRecord } from './security/openApi'
import { discoveryApiRecord } from './discovery/openApi'
import { weatherApiRecord } from './weather/openApi'
import { appsApiRecord } from './apps/openApi'
import { historyApiRecord } from './history/openApi'
import { radarApiRecord } from './radar/openApi'
import { courseAsyncApiDoc } from './course/asyncApi'
import { autopilotAsyncApiDoc } from './autopilot/asyncApi'
import { notificationsAsyncApiDoc } from './notifications/asyncApi'
import { radarAsyncApiDoc } from './radar/asyncApi'
import { resourcesAsyncApiDoc } from './resources/asyncApi'
import { PluginId, PluginManager } from '../interfaces/plugins'
import { Brand } from '@signalk/server-api'

export type OpenApiDescription = Brand<object, 'OpenApiDescription'>

export interface OpenApiRecord {
  name: string
  path: string
  apiDoc: OpenApiDescription
}

interface ApiRecords {
  [name: string]: OpenApiRecord
}

const apiDocs = [
  discoveryApiRecord,
  appsApiRecord,
  autopilotApiRecord,
  courseApiRecord,
  notificationsApiRecord,
  resourcesApiRecord,
  weatherApiRecord,
  securityApiRecord,
  historyApiRecord,
  radarApiRecord
].reduce<ApiRecords>((acc, apiRecord: OpenApiRecord) => {
  acc[apiRecord.name] = apiRecord
  return acc
}, {})

export function mountSwaggerUi(app: IRouter & PluginManager, path: string) {
  const allApiNames = () =>
    Object.keys(apiDocs).concat(
      app.getPluginOpenApiRecords().map(({ name }) => name)
    )

  // custom middleware to re-setup swaggerUI, because plugins have
  // not been loaded when this is called early in server startup sequence
  app.use(path, (req: Request, res: Response, next: NextFunction) => {
    swaggerUi.setup(undefined, {
      explorer: true,
      swaggerOptions: {
        urls: allApiNames().map((name) => ({
          name,
          url: `${SERVERROUTESPREFIX}/openapi/${name}`
        }))
      }
    })
    next()
  })

  app.use(
    path,
    swaggerUi.serve,
    swaggerUi.setup(undefined, {
      explorer: true,
      swaggerOptions: {
        urls: Object.keys(apiDocs).map((name) => ({
          name,
          url: `${SERVERROUTESPREFIX}/openapi/${name}`
        }))
      }
    })
  )

  const apiDefinitionHandler = (req: Request, res: Response) => {
    let apiRecord
    if (req.params.api) {
      apiRecord = apiDocs[req.params.api]
    } else if (req.params.pluginId) {
      apiRecord = app.getPluginOpenApi(req.params.pluginId as PluginId)
    }
    const apiDoc = apiRecord?.apiDoc
    const apiPath = apiRecord?.path

    if (apiDoc && apiPath !== undefined) {
      ;(apiDoc as any).servers = (apiDoc as any).servers ?? [
        {
          url: `${apiPath}`
        }
      ]
      res.json(apiDoc)
    } else {
      res.status(404)
      res.json('Not found')
    }
  }
  app.get(
    `${SERVERROUTESPREFIX}/openapi/plugins/:pluginId`,
    apiDefinitionHandler
  )
  app.get(`${SERVERROUTESPREFIX}/openapi/:api`, apiDefinitionHandler)

  // -------------------------------------------------------------------------
  // AsyncAPI endpoints
  // -------------------------------------------------------------------------

  interface AsyncApiRecord {
    name: string
    title: string
    doc: object
  }

  const asyncApiDocs: Record<string, AsyncApiRecord> = {
    course: {
      name: 'course',
      title: 'Course API',
      doc: courseAsyncApiDoc
    },
    autopilot: {
      name: 'autopilot',
      title: 'Autopilot API',
      doc: autopilotAsyncApiDoc
    },
    notifications: {
      name: 'notifications',
      title: 'Notifications API',
      doc: notificationsAsyncApiDoc
    },
    radar: {
      name: 'radar',
      title: 'Radar API',
      doc: radarAsyncApiDoc
    },
    resources: {
      name: 'resources',
      title: 'Resources API',
      doc: resourcesAsyncApiDoc
    }
  }

  // List available AsyncAPI docs
  app.get(`${SERVERROUTESPREFIX}/asyncapi`, (_req: Request, res: Response) => {
    res.json(
      Object.values(asyncApiDocs).map(({ name, title }) => ({
        name,
        title,
        jsonUrl: `${SERVERROUTESPREFIX}/asyncapi/${name}`,
        docsUrl: `${SERVERROUTESPREFIX}/asyncapi/docs`
      }))
    )
  })

  // Serve marked.js from node_modules
  app.get('/skServer/vendor/marked.umd.js', (_req: Request, res: Response) => {
    res.sendFile(
      nodePath.join(
        nodePath.dirname(require.resolve('marked/package.json')),
        'lib',
        'marked.umd.js'
      )
    )
  })

  // Serve unified AsyncAPI viewer with dropdown
  // MUST be registered before /asyncapi/:api to avoid matching "docs" as :api
  const asyncApiUrls = Object.values(asyncApiDocs).map(({ name, title }) => ({
    name: title,
    url: `${SERVERROUTESPREFIX}/asyncapi/${name}`
  }))

  app.get(
    `${SERVERROUTESPREFIX}/asyncapi/docs`,
    (_req: Request, res: Response) => {
      const specsJson = JSON.stringify(
        asyncApiUrls.map((u) => ({
          title: u.name,
          url: u.url
        }))
      )
      res.send(asyncApiViewerHtml(specsJson))
    }
  )

  // Serve individual AsyncAPI JSON documents
  app.get(
    `${SERVERROUTESPREFIX}/asyncapi/:api`,
    (req: Request, res: Response) => {
      const record = asyncApiDocs[req.params.api]
      if (record) {
        const cleaned = JSON.parse(
          JSON.stringify(record.doc, (key, value) =>
            key === '$id' ? undefined : value
          )
        )
        resolveRefs(cleaned, cleaned)
        if (cleaned.info?.description) {
          cleaned.info.descriptionHtml = marked(cleaned.info.description)
        }
        res.json(cleaned)
      } else {
        res.status(404).json('Not found')
      }
    }
  )
}

function resolveRefs(obj: any, root: any): void {
  if (!obj || typeof obj !== 'object') return
  for (const key of Object.keys(obj)) {
    if (
      key === '$ref' &&
      typeof obj[key] === 'string' &&
      obj[key].startsWith('#/')
    ) {
      const path = obj[key].slice(2).split('/')
      let target = root
      for (const p of path) {
        target = target?.[p]
      }
      if (target && typeof target === 'object') {
        delete obj.$ref
        Object.assign(obj, JSON.parse(JSON.stringify(target)))
      }
    } else {
      resolveRefs(obj[key], root)
    }
  }
}

function asyncApiViewerHtml(specsJson: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Signal K AsyncAPI Documentation</title>
  <script src="/skServer/vendor/marked.umd.js"><\/script>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #1e1e1e; color: #d4d4d4; }
    #nav { display: flex; align-items: center; gap: 12px; padding: 10px 20px; background: #252526; color: #cccccc; border-bottom: 1px solid #3c3c3c; }
    #nav label { font-size: 14px; font-weight: 500; }
    #nav select { padding: 4px 8px; border-radius: 4px; border: 1px solid #3c3c3c; background: #3c3c3c; color: #cccccc; font-size: 14px; }
    #nav select:focus { outline: none; border-color: #007acc; }
    .container { max-width: 960px; margin: 0 auto; padding: 20px; height: calc(100vh - 45px); overflow-y: auto; }
    h1 { color: #e0e0e0; font-size: 22px; margin: 0 0 4px 0; }
    h2 { color: #569cd6; font-size: 18px; margin: 28px 0 12px 0; border-bottom: 1px solid #3c3c3c; padding-bottom: 6px; }
    h3 { color: #9cdcfe; font-size: 15px; margin: 16px 0 8px 0; }
    .version { color: #858585; font-size: 13px; margin-bottom: 16px; }
    .description { line-height: 1.6; margin-bottom: 20px; }
    .description code { background: #2d2d2d; color: #ce9178; padding: 1px 5px; border-radius: 3px; font-size: 13px; }
    .description pre { background: #1a1a1a; border: 1px solid #3c3c3c; border-radius: 4px; padding: 12px; overflow-x: auto; }
    .description pre code { background: none; padding: 0; }
    a { color: #3794ff; text-decoration: none; }
    a:hover { color: #4daafc; text-decoration: underline; }
    .card { background: #252526; border: 1px solid #3c3c3c; border-radius: 6px; padding: 16px; margin-bottom: 12px; }
    .card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
    .badge-ws { background: #2b5797; color: #9cdcfe; }
    .badge-receive { background: #264f36; color: #6a9955; }
    .summary { color: #b0b0b0; font-size: 13px; margin-bottom: 8px; }
    .channel-addr { font-family: monospace; color: #dcdcaa; font-size: 14px; }
    .msg-name { font-family: monospace; color: #ce9178; font-size: 13px; }
    .prop-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
    .prop-table th { text-align: left; padding: 6px 8px; border-bottom: 1px solid #3c3c3c; color: #858585; font-weight: 500; }
    .prop-table td { padding: 6px 8px; border-bottom: 1px solid #2d2d2d; }
    .type-tag { color: #4ec9b0; font-family: monospace; font-size: 12px; }
    dl.server-info { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 8px 0 0 0; font-size: 13px; }
    dl.server-info dt { color: #858585; }
    dl.server-info dd { margin: 0; }
    .schema-block { background: #1a1a1a; border: 1px solid #3c3c3c; border-radius: 4px; padding: 12px; font-family: monospace; font-size: 12px; white-space: pre-wrap; overflow-x: auto; margin-top: 8px; }
    #loading { text-align: center; padding: 60px; color: #858585; }
  </style>
</head>
<body>
  <div id="nav">
    <label for="spec-select">API:</label>
    <select id="spec-select"></select>
  </div>
  <div class="container" id="content"><div id="loading">Loading...</div></div>
  <script>
    var SPECS = ${specsJson};

    function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
    function md(s) { return typeof marked !== 'undefined' ? marked.parse(s) : '<p>' + esc(s) + '</p>'; }

    function schemaToString(schema, indent) {
      indent = indent || 0;
      if (!schema) return 'any';
      var pad = '  '.repeat(indent);
      if (schema.anyOf) return schema.anyOf.map(function(s) { return schemaToString(s, indent); }).join(' | ');
      if (schema.const !== undefined) return JSON.stringify(schema.const);
      if (schema.type === 'object' && schema.properties) {
        var lines = ['{'];
        Object.keys(schema.properties).forEach(function(k) {
          lines.push(pad + '  ' + k + ': ' + schemaToString(schema.properties[k], indent + 1));
        });
        lines.push(pad + '}');
        return lines.join('\\n');
      }
      if (schema.type === 'array' && schema.items) return schemaToString(schema.items, indent) + '[]';
      if (schema.type) return schema.type;
      return 'any';
    }

    function renderDoc(doc) {
      var html = '<h1>' + esc(doc.info.title) + '</h1>';
      html += '<div class="version">v' + esc(doc.info.version) + ' — AsyncAPI ' + esc(doc.asyncapi) + '</div>';
      if (doc.info.description) {
        html += '<div class="description">' + md(doc.info.description) + '</div>';
      }

      if (doc.servers) {
        html += '<h2>Servers</h2>';
        Object.keys(doc.servers).forEach(function(sname) {
          var srv = doc.servers[sname];
          html += '<div class="card"><div class="card-header"><span class="badge badge-ws">' + esc(srv.protocol) + '</span><strong>' + esc(sname) + '</strong></div>';
          html += '<dl class="server-info">';
          html += '<div><dt>Host</dt><dd>' + esc(srv.host) + '</dd></div>';
          if (srv.pathname) html += '<div><dt>Path</dt><dd>' + esc(srv.pathname) + '</dd></div>';
          if (srv.description) html += '<div><dt>Description</dt><dd>' + esc(srv.description) + '</dd></div>';
          html += '</dl></div>';
        });
      }

      if (doc.channels) {
        html += '<h2>Channels</h2>';
        Object.keys(doc.channels).forEach(function(cname) {
          var ch = doc.channels[cname];
          html += '<div class="card">';
          html += '<div class="card-header"><span class="channel-addr">' + esc(ch.address || cname) + '</span></div>';
          if (ch.description) html += '<div class="summary">' + esc(ch.description) + '</div>';
          if (ch.messages) {
            html += '<h3>Messages</h3>';
            Object.keys(ch.messages).forEach(function(mname) {
              var msg = ch.messages[mname];
              html += '<div style="margin-bottom:12px">';
              html += '<div class="msg-name">' + esc(msg.name || mname) + '</div>';
              if (msg.title) html += '<div><strong>' + esc(msg.title) + '</strong></div>';
              if (msg.summary) html += '<div class="summary">' + esc(msg.summary) + '</div>';
              if (msg.payload) {
                html += '<div class="schema-block">' + esc(schemaToString(msg.payload)) + '</div>';
              }
              html += '</div>';
            });
          }
          html += '</div>';
        });
      }

      if (doc.operations) {
        html += '<h2>Operations</h2>';
        Object.keys(doc.operations).forEach(function(oname) {
          var op = doc.operations[oname];
          html += '<div class="card">';
          html += '<div class="card-header"><span class="badge badge-receive">' + esc(op.action) + '</span><strong>' + esc(oname) + '</strong></div>';
          if (op.summary) html += '<div class="summary">' + esc(op.summary) + '</div>';
          if (op.description) html += '<div class="summary">' + esc(op.description) + '</div>';
          html += '</div>';
        });
      }
      return html;
    }

    var select = document.getElementById('spec-select');
    SPECS.forEach(function(s, i) {
      var opt = document.createElement('option');
      opt.value = i;
      opt.textContent = s.title;
      select.appendChild(opt);
    });

    function loadSpec(idx) {
      var spec = SPECS[idx];
      document.getElementById('content').innerHTML = '<div id="loading">Loading...</div>';
      fetch(spec.url).then(function(r) { return r.json(); }).then(function(doc) {
        document.getElementById('content').innerHTML = renderDoc(doc);
      }).catch(function(err) {
        document.getElementById('content').innerHTML = '<p style="color:#f48771">Error: ' + esc(err.message) + '</p>';
      });
    }

    select.addEventListener('change', function() { loadSpec(parseInt(this.value)); });
    loadSpec(0);
  <\/script>
</body>
</html>`
}
