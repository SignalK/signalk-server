# Notes for Developers

Signal K server has an extensible architecture that enables developers to add functionality to support new protocols, devices, information sources, etc.

The information in this section aims to provide guidance, not only on how to develop plugins and applications to extend capability, but also how to do so in alignment with the Signal K server architecture. 
By understanding the underlying architecture, the plugins and apps you create will ensure that the additional functionality and data will be discoverable and work in harmony with other solutions.

## Looking Ahead

Signal K server v2 marks the start of an evolution from the Signal K v1 approach of defining the paths, their hierarchy and the full data model schema, towards an approach centered around REST APIs (HTTP endpoints defined as OpenApi specifications).

These APIs enact operations (i.e. activate a route, advance to next point, etc) rather just expose a generic data model with some well known paths. 
They are available under the path `/signalk/v2/api` so they can coexist with v1 APIs. There is a connection with the Signal K full data model but, unlike the v1 APIs it is not 1:1, it is abstracted behind the interface.

The reason for adopting this approach is to address the fact that many paths within a Signal K hierarchy are related, a change in the value of one path will require that the value of other paths be updated to ensure that the data model is consistent. 
At present this relies on the plugin / application knowing which paths in the hierarchy are related. Additionally there may be other plugins / applications also updating some of the same paths which can cause the data model to become invalid, which then erodes trust in the data which impacts its use in navigation.

The use of APIs to perform operations addresses these issues providing the following benefits:
1. A standardised interface for all applications / plugins to perform an operation
1. Provides clear ownership of the paths in the Signal K data model
1. Ensures values are being maintained in all of the related paths.
1. Increases trust in the data for use in all scenarios.

### Stream Interface

Currently, when v2 REST APIs emit deltas that contain v2 paths and structure, they do not end up in the full model. This means that these paths and values are only available via API GET requests.

## Deprecations and Breaking Changes

With the move towards REST APIs and the desire to improve the data model (and also fix some mistakes) it's inevitable that there will be deprecations and breaking changes.

For example, when addressing duplicate Great Circle and Rhumbline course paths, the resultant changes will likley break compatibility with v1.

For details about paths that are candidates for deprecation see [REST APIs](./rest-api/open_api.md).

