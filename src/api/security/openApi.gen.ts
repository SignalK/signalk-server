/**
 * OpenAPI 3.1.0 Document for the Signal K Security API
 */

import {
  securitySchemes,
  defaultSecurity,
  signalKExternalDocs,
  signalKTermsOfService,
  signalKLicense,
  serverVersion
} from '../openapi-utils'

// ---------------------------------------------------------------------------
// OpenAPI Document
// ---------------------------------------------------------------------------

export const securityOpenApiDoc = {
  openapi: '3.1.0',
  info: {
    version: serverVersion,
    title: 'Signal K Security API',
    termsOfService: signalKTermsOfService,
    license: signalKLicense
  },
  externalDocs: signalKExternalDocs,
  servers: [{ url: '/signalk/v1' }],
  tags: [
    { name: 'authentication', description: 'User authentication' },
    { name: 'access', description: 'Device access' },
    { name: 'oidc', description: 'OpenID Connect (OIDC) configuration' }
  ],
  components: {
    schemas: {
      IsoTime: {
        type: 'string',
        pattern:
          '^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2}):(\\d{2}(?:\\.\\d*)?)((-(\\d{2}):(\\d{2})|Z)?)$',
        example: '2022-04-22T05:02:56.484Z'
      },
      RequestState: {
        type: 'string',
        enum: ['PENDING', 'FAILED', 'COMPLETED']
      },
      OIDCPermission: {
        type: 'string',
        enum: ['readonly', 'readwrite', 'admin'],
        description: 'Signal K permission level'
      },
      OIDCConfigResponse: {
        type: 'object',
        description: 'OIDC configuration (secrets redacted)',
        properties: {
          enabled: {
            type: 'boolean',
            description: 'Whether OIDC authentication is enabled'
          },
          issuer: {
            type: 'string',
            description: 'OIDC provider issuer URL',
            example: 'https://auth.example.com'
          },
          clientId: { type: 'string', description: 'OAuth client ID' },
          clientSecret: {
            type: 'string',
            description: 'Always empty (redacted for security)'
          },
          clientSecretSet: {
            type: 'boolean',
            description: 'Whether a client secret has been configured'
          },
          redirectUri: {
            type: 'string',
            description:
              'OAuth redirect URI (optional, auto-generated if not set)'
          },
          scope: {
            type: 'string',
            description: 'OAuth scopes to request',
            example: 'openid email profile'
          },
          defaultPermission: {
            $ref: '#/components/schemas/OIDCPermission'
          },
          autoCreateUsers: {
            type: 'boolean',
            description: 'Automatically create users on first OIDC login'
          },
          adminGroups: {
            type: 'array',
            items: { type: 'string' },
            description: 'Groups that grant admin permission',
            example: ['admins', 'sk-admin']
          },
          readwriteGroups: {
            type: 'array',
            items: { type: 'string' },
            description: 'Groups that grant read/write permission',
            example: ['users', 'operators']
          },
          groupsAttribute: {
            type: 'string',
            description: 'ID token claim containing user groups',
            example: 'groups'
          },
          providerName: {
            type: 'string',
            description: 'Display name shown on login button',
            example: 'SSO Login'
          },
          autoLogin: {
            type: 'boolean',
            description:
              'Automatically redirect to OIDC provider when not authenticated'
          },
          envOverrides: {
            type: 'object',
            description: 'Fields that are overridden by environment variables',
            additionalProperties: { type: 'boolean' }
          }
        }
      },
      OIDCConfigRequest: {
        type: 'object',
        description: 'OIDC configuration update request',
        properties: {
          enabled: { type: 'boolean' },
          issuer: {
            type: 'string',
            example: 'https://auth.example.com'
          },
          clientId: { type: 'string' },
          clientSecret: {
            type: 'string',
            description: 'Leave empty to keep existing secret'
          },
          scope: {
            type: 'string',
            example: 'openid email profile'
          },
          defaultPermission: {
            $ref: '#/components/schemas/OIDCPermission'
          },
          autoCreateUsers: { type: 'boolean' },
          adminGroups: {
            oneOf: [
              { type: 'string', description: 'Comma-separated list' },
              { type: 'array', items: { type: 'string' } }
            ]
          },
          readwriteGroups: {
            oneOf: [
              { type: 'string', description: 'Comma-separated list' },
              { type: 'array', items: { type: 'string' } }
            ]
          },
          groupsAttribute: { type: 'string' },
          providerName: { type: 'string' },
          autoLogin: { type: 'boolean' }
        }
      },
      OIDCTestRequest: {
        type: 'object',
        required: ['issuer'],
        properties: {
          issuer: {
            type: 'string',
            description: 'OIDC provider issuer URL to test',
            example: 'https://auth.example.com'
          }
        }
      },
      OIDCTestResponse: {
        type: 'object',
        description: 'OIDC connection test result',
        properties: {
          success: { type: 'boolean' },
          issuer: {
            type: 'string',
            description: 'Issuer from discovery document'
          },
          authorization_endpoint: {
            type: 'string',
            description: 'OAuth authorization endpoint'
          },
          token_endpoint: {
            type: 'string',
            description: 'OAuth token endpoint'
          },
          userinfo_endpoint: {
            type: 'string',
            description: 'OIDC userinfo endpoint'
          },
          jwks_uri: {
            type: 'string',
            description: 'JSON Web Key Set URI'
          }
        }
      }
    },
    responses: {
      '200Ok': {
        description: 'OK',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                state: { type: 'string', enum: ['COMPLETED'] },
                statusCode: { type: 'number', enum: [200] }
              },
              required: ['state', 'statusCode']
            }
          }
        }
      },
      ErrorResponse: {
        description: 'Failed operation',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              description: 'Request error response',
              properties: {
                state: { type: 'string', enum: ['FAILED'] },
                statusCode: { type: 'number', enum: [404] },
                message: { type: 'string' }
              },
              required: ['state', 'statusCode', 'message']
            }
          }
        }
      },
      AccessRequestResponse: {
        description: 'Request status',
        content: {
          'application/json': {
            schema: {
              description: 'Request response',
              type: 'object',
              required: ['state'],
              properties: {
                state: {
                  $ref: '#/components/schemas/RequestState',
                  default: 'PENDING',
                  example: 'PENDING',
                  description: 'Status of request.'
                },
                href: {
                  type: 'string',
                  example:
                    '/signalk/v1/requests/358b5f32-76bf-4b33-8b23-10a330827185',
                  description:
                    'Path where the status of the request can be checked.'
                }
              }
            }
          }
        }
      },
      RequestStatusResponse: {
        description: 'Request status',
        content: {
          'application/json': {
            schema: {
              description: 'Request response',
              type: 'object',
              required: ['state'],
              properties: {
                state: {
                  $ref: '#/components/schemas/RequestState',
                  example: 'COMPLETED',
                  default: 'COMPLETED',
                  description: 'Status of request.'
                },
                statusCode: {
                  type: 'number',
                  example: 200,
                  description: 'Response status code.'
                },
                ip: {
                  type: 'string',
                  example: '192.168.1.77',
                  description: 'IP address of the original access request.'
                },
                accessRequest: {
                  type: 'object',
                  required: ['permission', 'token'],
                  description: 'Access request result.',
                  properties: {
                    permission: {
                      enum: ['DENIED', 'APPROVED'],
                      example: 'APPROVED'
                    },
                    token: {
                      type: 'string',
                      description:
                        'Authentication token to be supplied with future requests.'
                    },
                    expirationTime: {
                      $ref: '#/components/schemas/IsoTime',
                      description: 'Token expiration time.'
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    securitySchemes
  },
  security: defaultSecurity,
  paths: {
    '/access/requests': {
      post: {
        tags: ['access'],
        summary: 'Create a device access request.',
        description:
          'Endpoint to create (device) access requests. The response contains the href to poll for the status of the request.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['clientId', 'description'],
                properties: {
                  clientId: {
                    type: 'string',
                    description: 'Client identifier.',
                    example: '1234-45653-343453'
                  },
                  description: {
                    type: 'string',
                    description: 'Description of device.',
                    example: 'humidity sensor'
                  }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            $ref: '#/components/responses/AccessRequestResponse'
          },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/requests/{id}': {
      parameters: [
        {
          name: 'id',
          in: 'path' as const,
          description: 'request id',
          required: true,
          schema: { type: 'string' }
        }
      ],
      get: {
        tags: ['access'],
        summary: 'Check device access status.',
        description: 'Returns the status of the supplied request id.',
        responses: {
          '200': {
            $ref: '#/components/responses/RequestStatusResponse'
          },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/auth/login': {
      post: {
        tags: ['authentication'],
        summary: 'Authenticate user.',
        description: 'Authenticate to server using username and password.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['username', 'password'],
                properties: {
                  username: {
                    type: 'string',
                    description: 'User to authenticate'
                  },
                  password: {
                    type: 'string',
                    description: 'Password for supplied username.'
                  }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Successful Authentication response.',
            content: {
              'application/json': {
                schema: {
                  description: 'Login success result',
                  type: 'object',
                  required: ['token'],
                  properties: {
                    token: {
                      type: 'string',
                      description:
                        'Authentication token to be supplied with future requests.'
                    },
                    timeToLive: {
                      type: 'number',
                      description: 'Token validity time (seconds).'
                    }
                  }
                }
              }
            }
          },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/auth/logout': {
      put: {
        tags: ['authentication'],
        summary: 'Log out user.',
        description:
          'Log out the user with the token supplied in the request header.',
        responses: {
          '200': { $ref: '#/components/responses/200Ok' },
          default: { $ref: '#/components/responses/ErrorResponse' }
        }
      }
    },
    '/security/oidc': {
      get: {
        tags: ['oidc'],
        summary: 'Get OIDC configuration.',
        description:
          'Returns the current OIDC configuration with secrets redacted. Includes indicators for fields overridden by environment variables.',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: {
          '200': {
            description: 'OIDC configuration',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/OIDCConfigResponse'
                }
              }
            }
          },
          '401': {
            description: 'Unauthorized - admin access required',
            content: {
              'application/json': {
                schema: {
                  type: 'string',
                  example: 'Security config not allowed'
                }
              }
            }
          }
        }
      },
      put: {
        tags: ['oidc'],
        summary: 'Update OIDC configuration.',
        description:
          'Updates the OIDC configuration. Fields set via environment variables cannot be overridden. Leave clientSecret empty to preserve the existing secret.',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/OIDCConfigRequest'
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Configuration saved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: {
                      type: 'string',
                      example: 'OIDC configuration saved'
                    }
                  }
                }
              }
            }
          },
          '400': {
            description: 'Invalid configuration',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: {
                      type: 'string',
                      example: 'Invalid issuer URL'
                    }
                  }
                }
              }
            }
          },
          '401': {
            description: 'Unauthorized - admin access required'
          },
          '500': {
            description: 'Failed to save configuration',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: {
                      type: 'string',
                      example: 'Unable to save OIDC configuration'
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/security/oidc/test': {
      post: {
        tags: ['oidc'],
        summary: 'Test OIDC connection.',
        description:
          "Tests connectivity to an OIDC provider by fetching its discovery document. Returns the provider's endpoints if successful.",
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/OIDCTestRequest'
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Connection successful',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/OIDCTestResponse'
                }
              }
            }
          },
          '400': {
            description: 'Invalid request',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: {
                      type: 'string',
                      example: 'Issuer URL is required'
                    }
                  }
                }
              }
            }
          },
          '401': {
            description: 'Unauthorized - admin access required'
          },
          '502': {
            description: 'Failed to connect to OIDC provider',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: {
                      type: 'string',
                      example: 'Failed to fetch OIDC discovery document'
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
