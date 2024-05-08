# CHANGELOG: RESOURCES-PROVIDER

___Note: Signal K server on which this plugin is installed must implement the `ResourceProvider API`.___

---

## v1.1.2

- **Update**: Change plugin category keyword to `signalk-category-utility`.

## v1.1.0

- **Fix**: Only process files in resource folders (ignore folders).


## v1.0.0

Resource Provider plugin that facilitates the storage and retrieval of resources on the Signal K server filesystem.

By default it is enabled to handle the following Signal K resource types: 
- `routes`
- `waypoints`
- `notes`
- `regions`

Each resource type can individually enabled / disabled via the Plugin Config screen of the Signal K server.

The plugin can also be configured to handle additional `custom` resource types.

All resource types are stored on the local filesystem of the Signal K server with each type within its own folder.

The parent folder under which resources are stored can be configured from within the plugin config screen. The default path is `~/.signalk/resources`.
```
.signalk
    /resources
        /routes
            ...
        /waypoints
            ...
        /notes
            ...
        /regions
            ...
        /my_custom_type
            ...
```

![image](https://user-images.githubusercontent.com/38519157/150449889-5049a624-821c-4f33-ba8b-596b6b643d07.png)

