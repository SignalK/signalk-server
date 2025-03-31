---
title: Developing
children:
  - plugins/server_plugin.md
  - ../whats_new.md
  - ../breaking_changes.md
  - rest-api/open_api.md
  - contributing.md
---

# Notes for Developers

Signal K Server has an extensible architecture that enables developers to add functionality to support new protocols, devices, information sources, etc.

The information in this section aims to provide guidance, not only on how to develop plugins and applications to extend capability, but also how to do so in alignment with the Signal K specification, protocol and server architecture.
By understanding the underlying architecture, the plugins and apps you create will ensure that the additional functionality and data will be discoverable and work in harmony with other solutions.

## Looking Ahead

Signal K Server v2 marks the start of an evolution from the Signal K v1 approach of defining the paths, their hierarchy and the full data model schema, towards an approach centered around modular REST APIs (HTTP endpoints defined as OpenApi specifications).

These APIs enact operations (i.e. activate a route, advance to next point, etc) rather just expose a generic data model with some well known paths.
They are available under the path `/signalk/v2/api` so they can coexist with v1 APIs. There is a connection with the Signal K full data model but, unlike the v1 APIs it is not 1:1, it is abstracted behind the interface.

The reason for adopting this approach is to address the fact that many paths within a Signal K hierarchy are related, a change in the value of one path will require that the value of other paths be updated to ensure that the data model is consistent.
At present this relies on the plugin / application knowing which paths in the hierarchy are related. Additionally there may be other plugins / applications also updating some of the same paths which can cause the data model to become invalid, which then erodes trust in the data which impacts its use in navigation.

The v1 model for using PUT handlers is also very vague and causes confusion. The aim of defining APIs with clear contracts using industry standard OpenApi mechanism is to make APIs discoverable and their use and semantics explicit.

The use of APIs to perform operations addresses these issues providing the following benefits:
1. A standardised interface for all applications / plugins to perform an operation
1. Provides clear ownership of the paths in the Signal K data model
1. Ensures values are being maintained in all of the related paths.
1. Increases trust in the data for use in all scenarios.

### Stream Interface

Currently, when v2 REST APIs emit deltas that contain v2 paths and structure, but they do not end up in the full model. This means that these paths and values are only available via API GET requests.

## Offline Use

When operating on a vessel you should not assume that a connection to Internet services is available.
Therefore, it is important that the WebApps and Plugins you create be _"self contained"_ and provide all the resources they require to operate _(i.e. fonts, stylesheets, images, etc)_. This also minimises data charges even if your module does use data over Internet.

For WebApps and Plugins that do connect to Internet based services to provide data, they should be resilient to changes in the connection status to those services and where necessary display their status.


## Deprecations and Breaking Changes

With the move towards REST APIs and the desire to improve the data model (and also fix some mistakes) it's inevitable that there will be deprecations and breaking changes.

For example, when addressing duplicate Great Circle and Rhumbline course paths, the resultant changes will likley break compatibility with v1.

For details about paths that are flagged for deprecation see [Changes & Deprecations](../breaking_changes.md).
