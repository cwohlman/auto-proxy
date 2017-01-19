// Options
// TODO: Place options in a config file
var host = "localhost";
var port = 80;

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
var bindings = { };

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
  var domain = decodeURIComponent(parsed_url.pathname.replace(/^[\\\/]+/, "")).toLowerCase();

  var method = req.method;
  var binding = bindings[domain] || {};

  console.log(method + " " + domain);

  if (! req.headers.accept.match(/(application|\*)\/(json|\*)/)) {
    res.statusCode = 406;
    res.statusMessage = "No acceptable content types are available.";
    res.setHeader("Accept", "application/json");
    res.setHeader("Content-Type", "text/plain");
    res.end("The server can only deliver requests using the application/json mime type.");
  }

  res.setHeader("Accept", "application/json");
  res.setHeader("Content-Type", "application/json");

  if (method == "GET") {
    res.end(JSON.stringify(binding));
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
        res.end("");
      }
      bindings[domain] = data;
      res.end(JSON.stringify({ success: true, updated: domain }));
    }
    return;
  }
  if (method == "DELETE") {
    delete bindings[domain];
    res.statusCode = 200;
    res.statusMessage = "Removed binding for " + domain + "";
    res.end(JSON.stringify({ success: true, removed: domain}));
    return;
  }

  console.log("Not Allowed " + method);

  // Other methods are not allowed
  res.statusCode = 405;
  res.setHeader("Allow", "GET,PUT,DELETE");

  if (method == "POST") {
    res.end("Please use the PUT method to create or update bindings.");
  }
  res.end("");
  return;
};

function handleProxyCall(req, res) {
  var binding = bindings[req.headers.host];

  console.log("Proxying " + req.headers.host);

  if (!binding) {
    console.log("Not Found " + req.headers.host);
    res.statusCode = 404;
    res.statusMessage = "No server was configured to respond to the specified host name.";
    res.end(req.headers.host + " not found.");
    return;
  }

  return proxy.web(req, res, binding);
};
