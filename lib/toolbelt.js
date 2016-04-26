var util = require('util')
var path = require('path')

var DeconstDocker = require('./docker')
var GitHub = require('./github')

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
}

module.exports.Toolbelt = Toolbelt

// Access a path within the current build's workspace directory.
Toolbelt.prototype.workspacePath = function (subpath) {
  return path.join(this.jobContext.dataDir, subpath || '')
}

// Access the root path of the workspace container.
Toolbelt.prototype.workspaceContainerRoot = function () {
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
  if (this.docker) return

  this.docker = new DeconstDocker()
  return this.docker.error
}

Toolbelt.prototype.connectToGitHub = function () {
  if (this.github) return

  this.github = new GitHub(this)
  return this.github.error
}

// Logging messages to the build output.

var makeWriter = function (forceNewline, onlyIf) {
  return function () {
    if (onlyIf && !onlyIf.apply(this)) return

    var text = util.format.apply(null, arguments)

    if (forceNewline && text.substr(-1) !== '\n') {
      text += '\n'
    }

    this.phaseContext.out(text)
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
Toolbelt.prototype.error = makeWriter(true)
Toolbelt.prototype.rawerror = makeWriter(false)

/*
 * Write a detailed message about build progress. Will only appear if "verbose" is a truthy setting
 * within the project's configuration.
 */
Toolbelt.prototype.debug = makeWriter(true, function () {
  return this.config.verbose
})
Toolbelt.prototype.rawdebug = makeWriter(false, function () {
  return this.config.verbose
})
