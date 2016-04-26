'use strict'

var util = require('util')
var request = require('request')

function ContentService (toolbelt, baseURL, apiKey, rejectUnauthorized) {
  this.toolbelt = toolbelt

  this.api = request.defaults({
    baseUrl: baseURL,
    json: true,
    headers: {
      Authorization: util.format('deconst %s', apiKey),
      'User-Agent': 'request strider-deconst-control'
    },
    agentOptions: { rejectUnauthorized: rejectUnauthorized }
  })
}

exports.ContentService = ContentService

ContentService.prototype.issueAPIKey = function (name, callback) {
  var self = this

  this.api.post({
    url: '/keys',
    qs: { named: name }
  }, function (err, resp, body) {
    if (err) return callback(err)

    if (resp.statusCode !== 200) {
      self.toolbelt.error('Unable to issue a new API key for the staging content service.')
      self.toolbelt.error('Status: ', resp.statusCode)
      self.toolbelt.error('Does the staging API key have admin rights?')

      return callback(new Error('Unable to issue API key'))
    }

    callback(null, body.apikey)
  })
}

ContentService.prototype.revokeAPIKey = function (apiKey, callback) {
  var self = this

  this.api.del({
    url: '/keys/' + encodeURIComponent(apiKey)
  }, function (err, resp, body) {
    if (err) return callback(err)

    if (resp.statusCode !== 204) {
      self.toolbelt.error('Unable to revoke the transient API key from the content service.')
      self.toolbelt.error('Status: %s', resp.statusCode)

      return callback(new Error('Unable to revoke API key'))
    }

    callback(null)
  })
}
