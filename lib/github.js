// Perform low-level requests against the GitHub API.

var util = require('util')
var request = require('request')

function GitHub (toolbelt) {
  this.toolbelt = toolbelt
  this.error = null

  var account = toolbelt.githubAccount()
  if (!account) {
    this.error = new Error('Project owner is not connected to GitHub')
    return
  }

  this.api = request.defaults({
    baseUrl: 'https://api.github.com',
    json: true,
    headers: {
      Authorization: 'token ' + account.config.accessToken,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'request strider-deconst-control'
    }
  })
}

exports.GitHub = GitHub

GitHub.prototype.getRepository = function (repoName, callback) {
  var u = util.format('/repos/%s', repoName)

  this.api.get({ url: u }, function (err, resp, body) {
    if (err) return callback(err)

    if (resp.statusCode === 404) {
      var e = new Error('Unable to see GitHub repository')
      e.notFound = true
      return callback(e)
    }

    callback(null, body)
  })
}

GitHub.prototype.postComment = function (repoName, pullRequestNumber, comment, callback) {
  var self = this
  var u = util.format('/repos/%s/issues/%s/comments', repoName, pullRequestNumber)

  this.api.post({
    url: u,
    body: { body: comment }
  }, function (err, resp, body) {
    if (err) return callback(err)

    if (resp.statusCode !== 201) {
      self.toolbelt.error("I couldn't post the comment to GitHub!")
      self.toolbelt.error('The GitHub API responded with status %s:\n%s', resp.statusCode, body)
      return callback(new Error('Unable to post the comment'))
    }

    callback(null)
  })
}
