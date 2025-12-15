---
title: Custom Renderers for the DataBrowser
---
# Custom Renderers

Signalk's Data Browser provides an easily navigated snapshot of the state of your Signalk system. Some paths like `navigation.gnss.satellitesInView` however are data intensive and difficult to make much sense out of in raw JSON form.

As of Signalk V 2.17.0, you'll notice that the path appears in the Data Browser as an easy to understand graphic:

<img width="751" height="236" alt="Screenshot 2025-12-15 at 1 56 08 PM" src="https://github.com/user-attachments/assets/2514d3f7-9b6a-4f50-a6cf-d5e8868199a4" />

This is a Custom Renderer. The code for it is embedded in the DataBrowser package. See: [ValueRenderer.js](https://github.com/SignalK/signalk-server/blob/master/packages/server-admin-ui/src/views/DataBrowser/ValueRenderers.js).

As of Signalk V 2.19.0, there are additional embedded Custom Renderers for Notifications, Attitude, Direction, Meters and Large Arrays.

Also as V 2.19.0, developers can create their own renderers and associate them with the path for display in the Data Browser or in any React App.

You can add renderers for existing paths, override existing hard-coded renderers, and create novel renderers for any novel paths that your plugin creates.

## Creating a Custom Renderer

A Custom Renderer is any React Component that takes `value`, at a minimum, as an argument and renders that value in HTML.

Say, for example, you wanted to display a value in bold. You'd create a simple BoldRenderer that would look something like:

```
const BoldRenderer = ({ value }) => {
  return <div className="text-primary"><b>value</b></div>;
}
```

There are more interesting examples in the ValueRenderer.js file.

## Making Your Renderer Available at Runtime

- Create a plugin
- Add your Component in a separate file (usually under [plugin dir]/src/component)
- Add webpack includes and scripts to your package.json
- Add keyword "signalk-node-server-addon" to your package.json
- Create a webpack.config.js (see any Plugin with their own configuration component) file that exports the renderer:

```
 plugins: [
    new ModuleFederationPlugin({
      name: "Sample renderer",
      library: { type: "var", name: packageJson.name.replace(/[-@/]/g, "_") },
      filename: "remoteEntry.js",
      exposes: {
        "SampleRenderer": "./src/components/SampleRenderer",
      },
      shared: [{ react: { singleton: false, strictVersion: true } }],
    }),
...
```
- Build your plugin (`npm run build`)

## Use Your Renderer

To use the renderer, users need to assign the `renderer` property to the path's meta.

Example (for a renderer in a federated module):

```
    "context": "vessels.self",
    "updates": [
      {
        "meta": [
          {
            "path": "sample.value",
            "value": {
              "renderer": {
                "module": "renderer-plugin",
                "name": "SampleRenderer",
                "options": {
                  "option-1": "optional-value-1"
                }
              },
...
```


