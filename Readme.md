Node Auto Proxy
====

Access your development projects via local domain names instead of port numbers.
Auto-assign ports to each of your development projects, without collisions.

Getting started
====

1. Direct traffic to localhost. I suggest that you use dnsmasq (`brew install dnsmasq`) or a similar tool to redirect all requests to a given top-level domain to localhost don't use .dev, use one of the reserved TLDs like `.localhost` or `.test` (see here: https://passingcuriosity.com/2013/dnsmasq-dev-osx/, and here https://iyware.com/dont-use-dev-for-development/). Alternatively you can manually edit your hosts file or use folders of localhost (untested). In the future I may offer auto-editing of the hosts file but I'm not yet sure that's a good idea (it would certainly reduce the configuration burden).
2. Run the server `sudo node server.js` (note you need sudo to bind to port 80).
3. Get a port number for your app using the auto tool `PORT=$(node auto.js myapp.localhost)`. Alternatively you can just paste the source of auto.js into your start script.
4. Run your app using the assigned port number e.g. `PORT=$(node auto.js myapp.localhost) node index.js` or `meteor -p $PORT`

Easier use of the auto tool:
---

If you like you can npm link this package and use the auto.js tool via `auto-proxy-get-port` from the command line.
