var request = require('request');
var host = process.argv[2]; // first argument on the command line

request('http://localhost/auto/' + encodeURIComponent(host), function (error, response, body) {
  if (!error && response.statusCode == 200) {
    // TODO: use process.stdout
    console.log(JSON.parse(body).port) // Show the HTML for the Google homepage.
  } else {
    console.error(error, response, body);
  }
});
