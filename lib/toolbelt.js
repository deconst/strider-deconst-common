var util = require('util')
var path = require('path')
var colors = require('colors/safe')

var DeconstDocker = require('./docker').DeconstDocker
var GitHub = require('./github').GitHub
var ContentService = require('./content-service').ContentService
var Presenter = require('./presenter').Presenter

// Force ANSI colors in build output, even if we're running in a Docker container without a TTY.
colors.enabled = true

/*
 * Interactions with the job or build phase contexts.
 */
var Toolbelt = function (config, job, jobContext, phaseContext) {
  this.config = config
  this.job = job
  this.jobContext = jobContext
  this.phaseContext = phaseContext

  this.user = this.job.project.creator
  this.project = this.job.project
  this.isPullRequest = this.job.trigger.type === 'pull-request'
  if (this.isPullRequest) {
    this.pullRequestURL = this.job.trigger.url
  }

  this.models = {
    Project: this.job.project.constructor,
    User: this.user.constructor
  }

  this.docker = null
  this.github = null

  this.contentService = null
  this.stagingContentService = null

  this.presenter = null
  this.stagingPresenter = null
}

exports.Toolbelt = Toolbelt

// Access a path within the current build's workspace directory.
Toolbelt.prototype.workspacePath = function (subpath) {
  return path.join(this.jobContext.dataDir, subpath || '')
}

// Access the name of the workspace container.
Toolbelt.prototype.workspaceContainer = function () {
  return process.env.STRIDER_WORKSPACE_CONTAINER
}

// Access the project owner's GitHub connection configuration, or "null" if the owner isn't
// connected to GitHub.
Toolbelt.prototype.githubAccount = function () {
  for (var i = 0; i < this.user.accounts.length; i++) {
    var account = this.user.accounts[i]
    if (account.provider === 'github') {
      return account
    }
  }
  return null
}

Toolbelt.prototype.connectToDocker = function () {
  this.docker = new DeconstDocker(this)
  return this.docker.error
}

Toolbelt.prototype.connectToGitHub = function () {
  this.github = new GitHub(this)
  return this.github.error
}

Toolbelt.prototype.connectToStagingContentService = function (asAdmin) {
  var keyConfigName = asAdmin ? 'stagingContentServiceAdminAPIKey' : 'stagingContentServiceAPIKey'

  var serviceURL = this.config.stagingContentServiceURL
  var serviceKey = this.config[keyConfigName]
  var rejectUnauthorized = this.config.contentServiceTLSVerify

  var missing = []
  if (!serviceURL) missing.push('stagingContentServiceURL')
  if (!serviceKey) missing.push(keyConfigName)
  if (missing.length > 0) {
    var e = new Error('Unable to connect to the staging content service')
    e.missing = missing
    return e
  }

  this.stagingContentService = new ContentService(this, serviceURL, serviceKey, rejectUnauthorized)
  return null
}

Toolbelt.prototype.connectToContentService = function (asAdmin) {
  var keyConfigName = asAdmin ? 'contentServiceAdminAPIKey' : 'contentServiceAPIKey'

  var serviceURL = this.config.contentServiceURL
  var serviceKey = this.config[keyConfigName]
  var rejectUnauthorized = this.config.contentServiceTLSVerify

  var missing = []
  if (!serviceURL) missing.push('contentServiceURL')
  if (!serviceKey) missing.push(keyConfigName)
  if (missing.length > 0) {
    var e = new Error('Unable to connect to the content service')
    e.missing = missing
    return e
  }

  this.contentService = new ContentService(this, serviceURL, serviceKey, rejectUnauthorized)
  return null
}

Toolbelt.prototype.connectToPresenter = function () {
  var serviceURL = this.config.presenterURL

  if (!serviceURL) {
    var e = new Error('Unable to connect to the presenter')
    e.missing = ['presenterURL']
    return e
  }

  this.presenter = new Presenter(this, serviceURL, true)
  return null
}

Toolbelt.prototype.connectToStagingPresenter = function () {
  var serviceURL = this.config.stagingPresenterURL

  if (!serviceURL) {
    var e = new Error('Unable to connect to the staging presenter')
    e.missing = ['stagingPresenterURL']
    return e
  }

  this.stagingPresenter = new Presenter(this, serviceURL, true)
  return null
}

// Logging messages to the build output.

var makeWriter = function (forceNewline, color, onlyIf) {
  return function () {
    if (onlyIf && !onlyIf.apply(this)) return

    var text = util.format.apply(null, arguments)

    if (forceNewline && text.substr(-1) !== '\n') {
      text += '\n'
    }

    this.phaseContext.out(color ? color(text) : text)
  }
}

/*
 * Emit an informational logging message that will always appear in Strider's build output. Use
 * sparingly.
 */
Toolbelt.prototype.info = makeWriter(true)
Toolbelt.prototype.rawinfo = makeWriter(false)

/*
 * Report a build error to Strider's build output.
 */
Toolbelt.prototype.error = makeWriter(true, colors.red)
Toolbelt.prototype.rawerror = makeWriter(false, colors.red)

/*
 * Write a detailed message about build progress. Will only appear if "verbose" is a truthy setting
 * within the project's configuration.
 */
Toolbelt.prototype.debug = makeWriter(true, colors.gray, function () {
  return this.config.verbose
})
Toolbelt.prototype.rawdebug = makeWriter(false, colors.gray, function () {
  return this.config.verbose
})
