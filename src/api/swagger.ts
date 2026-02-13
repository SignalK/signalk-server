/* eslint-disable @typescript-eslint/no-explicit-any */
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
import { PluginId, PluginManager } from '../interfaces/plugins'
import { Brand } from '@signalk/server-api'
import { courseAsyncApiDoc } from './course/asyncApi'
import { notificationsAsyncApiDoc } from './notifications/asyncApi'
import { autopilotAsyncApiDoc } from './autopilot/asyncApi'
import { radarAsyncApiDoc } from './radar/asyncApi'
import { resourcesAsyncApiDoc } from './resources/asyncApi'

interface AsyncApiRecord {
  name: string
  title: string
  doc: object
}

const asyncApiDocs: Record<string, AsyncApiRecord> = {
  course: {
    name: 'course',
    title: 'Signal K Course API - WebSocket Deltas',
    doc: courseAsyncApiDoc
  },
  notifications: {
    name: 'notifications',
    title: 'Signal K Notifications API - WebSocket Deltas',
    doc: notificationsAsyncApiDoc
  },
  autopilot: {
    name: 'autopilot',
    title: 'Signal K Autopilot API - WebSocket Deltas',
    doc: autopilotAsyncApiDoc
  },
  radar: {
    name: 'radar',
    title: 'Signal K Radar API - WebSocket Streams',
    doc: radarAsyncApiDoc
  },
  resources: {
    name: 'resources',
    title: 'Signal K Resources API - WebSocket Deltas',
    doc: resourcesAsyncApiDoc
  }
}

/**
 * Recursively resolve JSON $ref pointers in-place against the root document.
 * Only handles local "#/..." references (no external files).
 */
function resolveRefs(node: any, root: any): void {
  if (node === null || node === undefined || typeof node !== 'object') return
  for (const key of Object.keys(node)) {
    const val = node[key]
    if (
      val &&
      typeof val === 'object' &&
      typeof val.$ref === 'string' &&
      val.$ref.startsWith('#/')
    ) {
      const path = val.$ref
        .slice(2)
        .split('/')
        .map((s: string) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
      let target = root
      for (const segment of path) {
        target = target?.[segment]
      }
      if (target !== undefined) {
        node[key] = target
      }
    } else if (typeof val === 'object') {
      resolveRefs(val, root)
    }
  }
}

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

/**
 * Generate a self-contained AsyncAPI documentation viewer page.
 * Fetches the JSON spec from the server and renders it as structured HTML
 * with markdown support via marked.js. No @asyncapi/react-component needed.
 */
function asyncApiViewerHtml(specsJson: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Signal K AsyncAPI Documentation</title>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #1e1e1e; color: #d4d4d4; }
    #nav { display: flex; align-items: center; gap: 12px; padding: 10px 20px; background: #252526; color: #cccccc; border-bottom: 1px solid #3c3c3c; position: sticky; top: 0; z-index: 10; }
    #nav label { font-size: 14px; font-weight: 500; }
    #nav select { padding: 4px 8px; border-radius: 4px; border: 1px solid #3c3c3c; background: #3c3c3c; color: #cccccc; font-size: 14px; }
    #nav select:focus { outline: none; border-color: #007acc; }
    .container { max-width: 960px; margin: 0 auto; padding: 20px; }
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
    .badge-ws { background: #264f78; color: #9cdcfe; }
    .badge-receive { background: #2d4a2d; color: #6a9955; }
    .badge-send { background: #4a4a2d; color: #dcdcaa; }
    .badge-type { background: #3c3c3c; color: #ce9178; font-family: monospace; text-transform: none; }
    .channel-addr { font-family: monospace; color: #dcdcaa; font-size: 14px; font-weight: 600; }
    .msg-name { font-family: monospace; color: #4ec9b0; font-size: 13px; }
    .summary { color: #cccccc; font-size: 13px; margin: 4px 0; }
    .prop-table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 13px; }
    .prop-table th { text-align: left; color: #858585; font-weight: 500; padding: 4px 12px 4px 0; border-bottom: 1px solid #3c3c3c; }
    .prop-table td { padding: 4px 12px 4px 0; border-bottom: 1px solid #2d2d2d; color: #cccccc; }
    .prop-table td:first-child { font-family: monospace; color: #9cdcfe; }
    .schema-block { background: #1a1a1a; border: 1px solid #3c3c3c; border-radius: 4px; padding: 10px; font-family: monospace; font-size: 12px; white-space: pre-wrap; word-break: break-word; max-height: 300px; overflow-y: auto; margin: 8px 0; color: #d4d4d4; }
    .toggle { cursor: pointer; color: #3794ff; font-size: 12px; user-select: none; }
    .toggle:hover { color: #4daafc; }
    .server-info { display: flex; gap: 20px; flex-wrap: wrap; font-size: 13px; }
    .server-info dt { color: #858585; margin: 0; }
    .server-info dd { color: #cccccc; margin: 0 0 8px 0; font-family: monospace; }
  </style>
</head>
<body>
  <div id="nav">
    <label for="spec-select">API:</label>
    <select id="spec-select"></select>
  </div>
  <div class="container" id="content"></div>
  <script>
    var specs = ${specsJson};
    var select = document.getElementById('spec-select');
    var content = document.getElementById('content');
    specs.forEach(function(s, i) {
      var opt = document.createElement('option');
      opt.value = i;
      opt.textContent = s.title;
      select.appendChild(opt);
    });

    function esc(s) {
      if (!s) return '';
      var d = document.createElement('div');
      d.textContent = s;
      return d.innerHTML;
    }

    function md(s) {
      if (!s) return '';
      return typeof marked !== 'undefined' ? marked.parse(s) : '<p>' + esc(s) + '</p>';
    }

    function typeLabel(schema) {
      if (!schema) return 'any';
      if (schema.anyOf || schema.oneOf) {
        var items = schema.anyOf || schema.oneOf;
        return items.map(typeLabel).join(' | ');
      }
      if (schema.type === 'array') return typeLabel(schema.items) + '[]';
      if (schema.type) return schema.type;
      if (schema.const !== undefined) return JSON.stringify(schema.const);
      return 'object';
    }

    function renderSchema(schema, depth) {
      if (!schema || typeof schema !== 'object') return '';
      depth = depth || 0;
      if (depth > 4) return '<div class="schema-block">...</div>';

      var html = '';
      // For objects with properties
      if (schema.type === 'object' && schema.properties) {
        var req = schema.required || [];
        html += '<table class="prop-table"><tr><th>Property</th><th>Type</th><th>Description</th></tr>';
        Object.keys(schema.properties).forEach(function(k) {
          var p = schema.properties[k];
          var isReq = req.indexOf(k) >= 0;
          html += '<tr><td>' + esc(k) + (isReq ? ' *' : '') + '</td>';
          html += '<td><span class="badge badge-type">' + esc(typeLabel(p)) + '</span></td>';
          html += '<td>' + esc(p.description || '') + '</td></tr>';
        });
        html += '</table>';
      } else if (schema.anyOf || schema.oneOf) {
        var items = schema.anyOf || schema.oneOf;
        html += '<div style="margin:4px 0">';
        items.forEach(function(item, i) {
          if (i > 0) html += '<div style="color:#858585;margin:2px 8px;font-size:12px">or</div>';
          html += renderSchema(item, depth + 1);
        });
        html += '</div>';
      } else {
        // Simple type
        html += '<div style="margin:4px 0"><span class="badge badge-type">' + esc(typeLabel(schema)) + '</span>';
        if (schema.description) html += ' <span class="summary">' + esc(schema.description) + '</span>';
        if (schema.enum) html += '<br><span style="color:#858585;font-size:12px">enum: </span><span style="font-family:monospace;font-size:12px;color:#ce9178">' + schema.enum.map(function(e) { return JSON.stringify(e); }).join(', ') + '</span>';
        html += '</div>';
      }
      return html;
    }

    function renderDoc(doc) {
      var html = '';
      // Header
      html += '<h1>' + esc(doc.info.title) + '</h1>';
      html += '<div class="version">v' + esc(doc.info.version) + ' &mdash; AsyncAPI ' + esc(doc.asyncapi) + '</div>';
      if (doc.info.description) {
        html += '<div class="description">' + md(doc.info.description) + '</div>';
      }

      // Servers
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

      // Channels
      if (doc.channels) {
        html += '<h2>Channels</h2>';
        Object.keys(doc.channels).forEach(function(cname) {
          var ch = doc.channels[cname];
          html += '<div class="card">';
          html += '<div class="card-header"><span class="channel-addr">' + esc(ch.address || cname) + '</span></div>';
          if (ch.description) html += '<div class="summary">' + esc(ch.description) + '</div>';
          if (ch.parameters) {
            html += '<h3>Parameters</h3><table class="prop-table"><tr><th>Name</th><th>Description</th></tr>';
            Object.keys(ch.parameters).forEach(function(pname) {
              html += '<tr><td>' + esc(pname) + '</td><td>' + esc(ch.parameters[pname].description || '') + '</td></tr>';
            });
            html += '</table>';
          }
          if (ch.messages) {
            html += '<h3>Messages</h3>';
            Object.keys(ch.messages).forEach(function(mkey) {
              var msg = ch.messages[mkey];
              html += '<div style="margin:8px 0 16px 0;padding:10px;background:#1e1e1e;border:1px solid #333;border-radius:4px">';
              html += '<div class="msg-name">' + esc(msg.name || mkey) + '</div>';
              if (msg.title) html += '<div style="color:#e0e0e0;font-size:13px;font-weight:500;margin:2px 0">' + esc(msg.title) + '</div>';
              if (msg.summary) html += '<div class="summary">' + esc(msg.summary) + '</div>';
              if (msg.contentType) html += '<div style="margin:4px 0"><span class="badge badge-type">' + esc(msg.contentType) + '</span></div>';
              if (msg.payload) {
                html += '<h3 style="margin:8px 0 4px 0">Payload</h3>';
                html += renderSchema(msg.payload, 0);
              }
              html += '</div>';
            });
          }
          html += '</div>';
        });
      }

      // Operations
      if (doc.operations) {
        html += '<h2>Operations</h2>';
        Object.keys(doc.operations).forEach(function(oname) {
          var op = doc.operations[oname];
          html += '<div class="card">';
          html += '<div class="card-header"><span class="badge ' + (op.action === 'receive' ? 'badge-receive' : 'badge-send') + '">' + esc(op.action) + '</span><strong>' + esc(oname) + '</strong></div>';
          if (op.summary) html += '<div class="summary" style="font-weight:500">' + esc(op.summary) + '</div>';
          if (op.description) html += '<div class="summary">' + esc(op.description) + '</div>';
          html += '</div>';
        });
      }

      // Schemas
      if (doc.components && doc.components.schemas) {
        html += '<h2>Schemas</h2>';
        Object.keys(doc.components.schemas).forEach(function(sname) {
          var schema = doc.components.schemas[sname];
          html += '<div class="card">';
          html += '<div class="card-header"><strong>' + esc(sname) + '</strong><span class="badge badge-type">' + esc(typeLabel(schema)) + '</span></div>';
          if (schema.description) html += '<div class="summary">' + esc(schema.description) + '</div>';
          html += renderSchema(schema, 0);
          var toggleId = 'schema-raw-' + sname.replace(/[^a-zA-Z0-9]/g, '_');
          html += '<div class="toggle" onclick="var el=document.getElementById(\\'' + toggleId + '\\');el.style.display=el.style.display===\\'none\\'?\\'block\\':\\'none\\'">Show/hide raw schema</div>';
          html += '<div class="schema-block" id="' + toggleId + '" style="display:none">' + esc(JSON.stringify(schema, null, 2)) + '</div>';
          html += '</div>';
        });
      }

      return html;
    }

    function loadSpec(index) {
      content.innerHTML = '<p style="color:#858585">Loading...</p>';
      fetch(specs[index].url)
        .then(function(r) { return r.json(); })
        .then(function(doc) { content.innerHTML = renderDoc(doc); })
        .catch(function(err) { content.innerHTML = '<p style="color:#f44">Error loading spec: ' + esc(err.message) + '</p>'; });
    }

    select.addEventListener('change', function() { loadSpec(this.value); });
    loadSpec(0);
  <\/script>
</body>
</html>`
}

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
      if (!(apiDoc as any).servers) {
        try {
          ;(apiDoc as any).servers = [{ url: `${apiPath}` }]
        } catch {
          // plugin docs may be frozen or have getter-only properties
        }
      }
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

  // Serve list of available AsyncAPI documents
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

  // Serve unified AsyncAPI viewer with dropdown
  // Custom renderer — the @asyncapi/react-component v3 standalone bundle is
  // broken in browser (parser calls fs.readFile), so we render our own HTML.
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

  // Serve AsyncAPI JSON document
  // - Strip TypeBox $id fields (confuse the AsyncAPI parser)
  // - Inline-resolve $ref pointers (avoids readFile bug in v3 standalone bundle)
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
        res.json(cleaned)
      } else {
        res.status(404).json('Not found')
      }
    }
  )
}
