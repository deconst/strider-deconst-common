'use strict'

var request = require('request')

function Presenter (toolbelt, baseURL, rejectUnauthorized) {
  this.toolbelt = toolbelt

  this.api = request.defaults({
    baseUrl: baseURL,
    json: true,
    headers: { 'User-Agent': 'request strider-deconst-control' },
    agentOptions: { rejectUnauthorized: rejectUnauthorized }
  })
}

exports.Presenter = Presenter

Presenter.prototype.whereis = function (contentID, callback) {
  var self = this
  var u = '/_api/whereis/' + encodeURIComponent(contentID)

  this.api.get(u, function (err, resp, body) {
    if (err) return callback(err)

    if (resp.statusCode !== 200) {
      self.toolbelt.error('Unsuccessful %s response returned from the presenter API.', resp.statusCode)
      return callback(new Error('Unable to map content IDs'))
    }

    callback(null, body.mappings)
  })
}
