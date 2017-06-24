/*
 * Copyright 2017 Scott Bender <scott@scottbender.net>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/

const debug = require("debug")("signalk:interfaces:appstore");
const _ = require("lodash");
const fs = require("fs");
const agent = require("superagent-promise")(require("superagent"), Promise);
const compareVersions = require("compare-versions");
const path = require("path");
const installModule = require("../modules").installModule;

module.exports = function(app) {
  var availablePlugins = [];
  var pluginInstalling = undefined;
  var pluginsInstalled = {};
  var pluginInstallQueue = [];

  return {
    start: function() {
      app.get("/appstore/output/:id/:version", (req, res, next) => {
        var html = fs.readFileSync(__dirname + "/appstore.html", {
          encoding: "utf8"
        });
        var insertionIndex = html.indexOf("</div>");
        var sliceToInsertion = html.slice(0, insertionIndex);
        var sliceToEnd = html.slice(insertionIndex);
        var result = sliceToInsertion;

        result += "<h2>Errors installing " + req.params.id + "</h2>";
        result += "<pre>";
        result += pluginsInstalled[req.params.id].output;
        result += "</pre>";
        result +=
          '<a href="/appstore/install/' +
          req.params.id +
          "/" +
          req.params.version +
          '"><button type="button" class="btn">Retry</button></a> ';
        result += sliceToEnd;
        res.send(result);
      });

      app.get("/appstore/install/:name/:version", (req, res, next) => {
        var name = req.params.name;
        var version = req.params.version;
        if (availablePlugins.indexOf(name) == -1) {
          res.send("Unknown Plugin " + name);
        } else {
          if (pluginInstalling) {
            pluginInstallQueue.push({ name: name, version: version });
          } else {
            installPlugin(name, version);
          }
          res.redirect("/appstore");
        }
      });

      app.get("/appstore/", (req, res, next) => {
        var html = fs.readFileSync(__dirname + "/appstore.html", {
          encoding: "utf8"
        });
        var insertionIndex = html.indexOf("</div>");
        var sliceToInsertion = html.slice(0, insertionIndex);
        var sliceToEnd = html.slice(insertionIndex);
        var result = sliceToInsertion;
        agent(
          "GET",
          "http://registry.npmjs.org/-/v1/search?text=keywords:signalk-node-server-plugin"
        )
          .end()
          .then(function(response) {
            var plugins = JSON.parse(response.text);

            availablePlugins = [];

            if (Object.keys(pluginsInstalled).length) {
              result +=
                '<p class="text-warning">Server restart is required to pickup new or updated plugins or web apps.</p>\n';
            }

            result += "<h3>Plugins</h3>\n";
            result += makePluginTable(plugins, getPlugin);

            agent(
              "GET",
              "http://registry.npmjs.org/-/v1/search?text=keywords:signalk-webapp"
            )
              .end()
              .then(function(response) {
                var webapps = JSON.parse(response.text);

                result += "<h3>Web Apps</h3>\n";
                result += makePluginTable(webapps, getWebApp);

                if (pluginInstalling) {
                  result +=
                    "<script>setTimeout(function(){ window.location.reload(1);}, 2000)</script>";
                }

                result += sliceToEnd;
                res.send(result);
              })
              .catch(error => {
                console.log("got an error2: " + error);
                console.log(error.stack);
                res.status(500);
                res.send("<pre>" + error.stack + "</pre>");
              });
          })
          .catch(error => {
            console.log("got an error: " + error);
            console.log(error.stack);
            res.status(500);
            res.send("<pre>" + error.stack + "</pre>");
          });
      });
    },
    stop: function() {}
  };

  function getPlugin(id) {
    var filtered = app.plugins.filter(plugin => {
      return plugin.packageName == id;
    });
    return filtered.length > 0 ? filtered[0] : undefined;
  }

  function getWebApp(id) {
    var filtered = app.webapps.filter(webapp => {
      return webapp.name == id;
    });
    return filtered.length > 0 ? filtered[0] : undefined;
  }

  function makePluginTable(plugins, existing) {
    var result = '<table class="table table-bordered">\n';
    result +=
      "<tr><th>Install</th><th>Update</th><th>Name</th><th>Description</th><th>Author</th><th>Link</th></tr>\n";

    result += plugins["objects"].reduce(function(result, pluginInfo) {
      var name = pluginInfo.package.name;
      var version = pluginInfo.package.version;

      availablePlugins.push(name);

      var plugin = existing(name);

      var isLink = false;
      if (plugin) {
        var stat = fs.lstatSync(
          path.join(__dirname, "../../node_modules/" + name)
        );
        var isLink = stat.isSymbolicLink();
      }

      result += "<tr>";
      result += "<td>";
      if (pluginsInstalled[name]) {
        if (pluginInstalling && pluginInstalling.name == name) {
          result +=
            '<p class="text-primary">Installing ' +
            pluginInstalling.version +
            "..." +
            "</p>";
        } else if (pluginsInstalled[name].code == 0) {
          result +=
            '<p class="text-success"> Installed ' +
            pluginsInstalled[name].version +
            "</p>";
        } else {
          result +=
            '<a href="/appstore/output/' +
            name +
            "/" +
            pluginsInstalled[name].version +
            '"><button type="button" class="btn-danger">Error</button></a> ';
        }
      } else if (pluginInstallQueue.find(p => p.name == name)) {
        result += '<p class="text-primary">Waiting...' + "</p>";
      } else if (!plugin) {
        result +=
          '<a href="/appstore/install/' +
          name +
          "/" +
          version +
          '"><button type="button" class="btn">Install ' +
          version +
          "</button></a> ";
      } else {
        result += plugin.version + " Installed";
        if (isLink) {
          result += '<p class="text-danger">(Linked)' + "</p>";
        }
      }

      result += "</td><td>";
      if (!pluginsInstalled[name]) {
        if (plugin) {
          var compared = compareVersions(version, plugin.version);
          if (compared > 0) {
            if (!isLink) {
              result +=
                '<a href="/appstore/install/' +
                name +
                "/" +
                version +
                '"><button type="button" class="btn">Update to ' +
                version +
                "</button></a> ";
            }
          } else if (compared < 0) {
            result += "Newer Installed";
          } else {
            result += "Latest Installed";
          }
        } else {
          result += "Not Installed";
        }
      }
      result += "</td>";
      result += "<td><b>" + name + "</b></td> ";
      result += "<td>" + pluginInfo.package.description + "</td> ";
      result += "<td>" + pluginInfo.package.author.name + "</td> ";

      result += "<td>";
      var npm = _.get(pluginInfo.package, "links.npm");
      if (npm) {
        result += '<a href="' + npm + '">npm</a>';
      }
      result += "</td> ";
      result += "</tr>\n";
      return result;
    }, "");
    result += "</table>\n";
    return result;
  }

  function installPlugin(module, version) {
    pluginInstalling = {
      name: module,
      output: [],
      version: version
    };
    pluginsInstalled[module] = pluginInstalling;

    installModule(
      module,
      version,
      output => {
        pluginsInstalled[module].output.push(output);
        console.log(`stdout: ${output}`);
      },
      output => {
        pluginsInstalled[module].output.push(output);
        console.error(`stderr: ${output}`);
      },
      code => {
        debug("close: " + module);
        pluginsInstalled[module]["code"] = code;
        pluginInstalling = undefined;
        console.log(`child process exited with code ${code}`);

        if (pluginInstallQueue.length) {
          var next = pluginInstallQueue.splice(0, 1)[0];
          installPlugin(next.name, next.version);
        }
      }
    );
  }
};
