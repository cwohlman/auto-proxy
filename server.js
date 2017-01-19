// Options
// TODO: Place options in a config file
var host = "localhost";
var port = 80;

var fs = require('fs');
var url = require('url');
var http = require('http');
var proxy = require('http-proxy').createProxyServer();

proxy.on('error', function (err, req, res) {
  console.log(err);
  res.writeHead(500, {
    'Content-Type': 'text/plain'
  });
  res.end('Proxy Error: ' + err.stack);
});

// Memory
// TODO: Place memory in a persistent store of some kind
var bindings = {
  set: function (domain, data) {
    // TODO: Check for port collisions;
    this._bindings[domain] = data;
    this.reservePorts();
    this.save();
  },
  get: function (domain) {
    return this._bindings[domain] || {};
  },
  load: function () {
    try {
      var raw_bindings = fs.readFileSync(process.env.HOME + '/.autoproxy/bindings.json');
      this._bindings = JSON.parse(raw_bindings);
    } catch (e) {
      console.error("Could not get persisted bindings: " + e.stack);
    }

    this.reservePorts();
  },
  save: function () {
    if (! fs.existsSync(process.env.HOME + '/.autoproxy')) {
      fs.mkdirSync(process.env.HOME + '/.autoproxy/');
    }
    try {
      var raw_bindings = JSON.stringify(this._bindings);
      fs.writeFileSync(process.env.HOME + '/.autoproxy/bindings.json', raw_bindings);
    } catch (e) {
      console.error("Could not persist bindings: " + e.stack);
    }
  },
  reservePorts: function () {
    var self = this;
    for (var name in this._bindings) {
      if (! this._bindings.hasOwnProperty(name)) continue;

      var binding = this._bindings[name];
      if (! binding) return;

      var ports = binding.ports;
      if (ports && ports.forEach) {
        ports.forEach(function (port) {
          var current_name = self._ports[port];
          if (current_name && current_name != name && current_name !== true) {
            console.log("Port collision: ", port, name, current_name);
          }
          self._ports[port] = name;
        });
      }
    }
  },
  getPort: function () {
    var port = 3000;
    while (this._ports[port]) {
      port += 5;

      if (port > 50000) {
        port = null;
        break;
      }
    }
    if (port) {
      // Note, this won't be persisted unless a domain name was specified.
      this._ports[port] = true;
    }
    return port;
  },
  _bindings: {},
  _ports: {},
};
bindings.load();

var server = http.createServer(function (req, res) {
  if (req.headers.host.match(/^localhost$/i)) {
    // Reroute this address to the internal api.
    return handleAPICall(req, res);
  }
  return handleProxyCall(req, res);
});

server.listen(port, host, function (err) {
  err && console.log(err) || console.log('started');
});

function handleAPICall(req, res) {
  var parsed_url = url.parse(req.url);
  var path = parsed_url.pathname;
  var bindings_regex = /^\/domain\//i;
  if (path.match(bindings_regex)) {
    var domain = decodeURIComponent(path.replace(bindings_regex, "")).toLowerCase();

    var method = req.method;
    var binding = bindings.get(domain) || {};

    console.log(method + " " + domain);

    // if (! req.headers.accept.match(/(application|\*)\/(json|\*)/)) {
    //   res.statusCode = 406;
    //   res.statusMessage = "No acceptable content types are available.";
    //   res.setHeader("Accept", "application/json");
    //   res.setHeader("Content-Type", "text/plain");
    //   res.end("The server can only deliver requests using the application/json mime type.");
    // }

    res.setHeader("Accept", "application/json");
    res.setHeader("Content-Type", "application/json");

    if (method == "GET") {
      res.end(JSON.stringify({ success: true, binding: binding, host: domain }));
      return;
    }
    if (method == "PUT") {

      // if (! req.headers["content-type"].match(/(application)\/(json)/)) {
      //   res.statusCode = 406;
      //   res.statusMessage = "No acceptable content types are available.";
      //   res.setHeader("Accept", "application/json");
      //   res.setHeader("Content-Type", "text/plain");
      //   res.end("The server can only deliver requests using the application/json mime type.");
      // }

      var body = '';

      req.on('data', function(chunk){
          body += chunk;
      });

      req.on('end', function(){
          handleResponse();
      });

      function handleResponse() {
        var data;
        try {
          data = JSON.parse(body);
        } catch (e) {
          res.statusCode = 400;
          res.statusMessage = "Could not parse message body";
          res.end(JSON.stringify({ success: false, message: "Could not parse request json." }));
        }
        bindings.set(domain, data);
        res.end(JSON.stringify({ success: true, host: domain, binding: data, message: domain + " was updated." }));
      }
      return;
    }
    if (method == "DELETE") {
      bindings.set(domain, "");
      res.statusCode = 200;
      res.statusMessage = "Removed binding for " + domain + "";
      res.end(JSON.stringify({ success: true, host: domain, binding: binding, message: domain + " was removed." }));
      return;
    }

    // Other methods are not allowed
    res.statusCode = 405;
    res.setHeader("Allow", "GET,PUT,DELETE");

    if (method == "POST") {
      res.end(JSON.stringify({ success: false, message: "Please use the PUT method to create or update bindings.", allowed: ["GET","PUT","DELETE"] }));
    }
    res.end(JSON.stringify({ success: false, message: "Please use one of the supported methods.", allowed: ["GET","PUT","DELETE"] }));
    return;
  }

  var ports_regex = /^\/port\/?/i;
  if (path.match(ports_regex)) {
    var name = decodeURIComponent(path.replace(ports_regex, "")).toLowerCase();

    var method = req.method;
    var binding = name && bindings.get(name) || null;

    console.log(method + " " + name);

    // if (! req.headers.accept.match(/(application|\*)\/(json|\*)/)) {
    //   res.statusCode = 406;
    //   res.statusMessage = "No acceptable content types are available.";
    //   res.setHeader("Accept", "application/json");
    //   res.setHeader("Content-Type", "text/plain");
    //   res.end("The server can only deliver requests using the application/json mime type.");
    //   return;
    // }

    res.setHeader("Accept", "application/json");
    res.setHeader("Content-Type", "application/json");

    if (method == "POST") {
      var assigned_port = bindings.getPort();
      if (!assigned_port) {
        res.statusCode = 503;
        res.statusMessage = "No port was available.";
        res.end(JSON.stringify({ success: false, message: "No port was available to be assigned." }));
        return;
      }
      if (name) {
        binding.ports = binding.ports || [];
        binding.ports.push(assigned_port);
        bindings.set(name, binding);
      }
      res.end(JSON.stringify({ success: true, name: name, binding: binding, port: assigned_port, message: "Port " + assigned_port + (name ? " was assigned to " + name : " was reserved") }));
      return;
    }

    // Other methods are not allowed
    res.statusCode = 405;
    res.setHeader("Allow", "POST");

    res.end(JSON.stringify({ success: false, message: "Please use the POST method to request an unallocated port.", allowed: ["POST"] }));
    return;
  }

  var auto_regex = /^\/auto\//i;
  if (path.match(auto_regex)) {
    var name = decodeURIComponent(path.replace(auto_regex, "")).toLowerCase();

    var method = req.method;
    var binding = name && bindings.get(name) || null;

    console.log(method + " " + name);

    // if (! req.headers.accept.match(/(application|\*)\/(json|\*)/)) {
    //   res.statusCode = 406;
    //   res.statusMessage = "No acceptable content types are available.";
    //   res.setHeader("Accept", "application/json");
    //   res.setHeader("Content-Type", "text/plain");
    //   res.end("The server can only deliver requests using the application/json mime type.");
    //   return;
    // }

    res.setHeader("Accept", "application/json");
    res.setHeader("Content-Type", "application/json");

    // TODO: Allow using the POST/PUT request to specify additional details
    if (method == "GET") {
      if (!name) {
        res.statusCode = 400;
        res.statusMessage = "Request was invalid.";
        res.end(JSON.stringify({ success: false, message: "Please specify a domain."}));
        return;
      }
      var assigned_port = binding.target && binding.target.port;

      if (binding.target && binding.target.host !== "localhost") {
        res.statusCode = 400;
        res.statusMessage = "Reques was invalid";
        res.end(JSON.stringify({ success: false, message: "Auto binding a port only works for domains that are unassigned, or assigned to localhost."}));
        return;
      }

      if (! assigned_port) {
        assigned_port = bindings.getPort();

        binding.target = {
          host: "localhost",
          port: assigned_port,
          protocol: "http", // TODO, allow HTTPS
        };

        binding.ports = binding.ports || [];
        binding.ports.push(assigned_port);
        bindings.set(name, binding);
      }
      if (!assigned_port) {
        res.statusCode = 503;
        res.statusMessage = "No port was available.";
        res.end(JSON.stringify({ success: false, message: "No port was available to be assigned." }));
        return;
      }
      res.end(JSON.stringify({ success: true, name: name, binding: binding, port: assigned_port, message: "Port " + assigned_port + " was assigned to " + name }));
      return;
    }

    // Other methods are not allowed
    res.statusCode = 405;
    res.setHeader("Allow", "GET");

    res.end(JSON.stringify({ success: false, message: "Please use the POST method to request an unallocated port.", allowed: ["GET"] }));
    return;
  }

  res.statusCode = 404;
  res.end("No endpoint was found which handles " + path + "");
};

function handleProxyCall(req, res) {
  var binding = bindings.get(req.headers.host);

  console.log("Proxying " + req.headers.host + " --> " + binding.target);

  if (!binding || !binding.target) {
    console.log("Not Found " + req.headers.host);
    res.statusCode = 404;
    res.statusMessage = "No server was configured to respond to the specified host name.";
    res.end(req.headers.host + " not found.");
    return;
  }

  try {
    return proxy.web(req, res, { target: binding.target, changeOrigin: binding.changeOrigin === false ? false : true });
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain");
    res.end("Proxy Error: " + e.stack);
  }
};
