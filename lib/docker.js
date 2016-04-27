/*
 * High-level routines used to interact with Docker containers.
 */

var util = require('util')
var path = require('path')
var stream = require('stream')
var async = require('async')
var Docker = require('dockerode')

function DeconstDocker (toolbelt) {
  this.toolbelt = toolbelt
  Docker.call(this)
}

util.inherits(DeconstDocker, Docker)

module.exports.DeconstDocker = DeconstDocker

/*
 * Pull the latest version of a container's image from a registry. Create a container with the
 * specified options and start it. Pass the container's output transparently to the Strider build
 * output. Wait for the container to complete, remove it, then invoke the callback with its exit
 * status.
 *
 * Errors encountered pulling the container from its registry will be logged but nonfatal. Other
 * errors will invoke the callback immediately.
 */
DeconstDocker.prototype.runContainer = function (options, callback) {
  var self = this

  var container = null
  var status = null

  var stdoutLogMethod = options.stdoutLogMethod || options.logmethod || 'rawinfo'
  var stderrLogMethod = options.stderrLogMethod || options.logmethod || 'rawerror'
  delete options.stderrLogMethod
  delete options.stdoutLogMethod
  delete options.logmethod

  if (options.workspaceRoot) {
    if (!options.HostConfig) options.HostConfig = {}
    if (!options.Env) options.Env = []

    if (self.toolbelt.workspaceContainer()) {
      // Mount the workspace volume from a data volume container using --volumes-from.
      // options.workspaceRoot is a path within the workspace volume.
      options.HostConfig.VolumesFrom = [self.toolbelt.workspaceContainer()]
      options.Env.push('CONTROL_ROOT=' + options.workspaceRoot)
      options.Env.push('NPM_CONFIG_CACHE=' + path.join(options.workspaceRoot, '.npmcache'))
      options.Env.push('TMPDIR=' + path.join(options.workspaceRoot, '.tmp'))
    } else {
      // Mount the workspace volume from the local filesystem, instead.
      // options.workspaceRoot is a path on the local filesystem.
      if (!options.Mounts) options.Mounts = []

      var volumeRoot = options.workspaceRoot
      var containerPath = '/var/control-repo'

      var bind = volumeRoot + ':' + containerPath

      options.Mounts = [{
        Source: volumeRoot,
        Destination: containerPath,
        Mode: 'rw',
        RW: true
      }]
      options.HostConfig.Binds = [bind]
    }

    delete options.workspaceRoot
  }

  var pullContainer = function (cb) {
    self.toolbelt.debug('Pulling latest image for container %s.', options.Image)

    self.pull(options.Image, function (err, stream) {
      if (err) {
        self.toolbelt.error('Unable to pull image: %s.', err.message)
        return cb(null)
      }

      var onProgress = function (e) {
        // This is noisy. Do nothing.
      }

      var onFinished = function (err, output) {
        if (err) {
          self.toolbelt.error('Unable to pull image: %s', err.message)
          return cb(null)
        }

        self.toolbelt.debug('Container image %s pulled.', options.Image)
        cb(null)
      }

      self.modem.followProgress(stream, onFinished, onProgress)
    })
  }

  var createContainer = function (cb) {
    self.toolbelt.debug('Creating container %s.', options.Image)

    self.createContainer(options, function (err, c) {
      if (err) return cb(err)
      self.toolbelt.debug('Container %s created with id %s.', options.Image, c.id)
      container = c
      cb(null)
    })
  }

  var startContainer = function (cb) {
    self.toolbelt.debug('Starting container %s.', container.id)

    container.start(cb)
  }

  var containerLogs = function (cb) {
    self.toolbelt.debug('Reporting logs from container %s.', container.id)

    var outStream = new stream.PassThrough()
    outStream.on('data', function (chunk) {
      self.toolbelt[stdoutLogMethod](chunk.toString('utf-8'))
    })

    var errStream = new stream.PassThrough()
    errStream.on('data', function (chunk) {
      self.toolbelt[stderrLogMethod](chunk.toString('utf-8'))
    })

    container.logs({
      follow: true,
      stdout: true,
      stderr: true
    }, function (err, stream) {
      if (err) return cb(err)
      container.modem.demuxStream(stream, outStream, errStream)
      cb(null)
    })
  }

  var waitForCompletion = function (cb) {
    self.toolbelt.debug('Waiting for container %s to complete.', container.id)

    container.wait(function (err, result) {
      if (err) {
        self.toolbelt.error('Unable to wait for container: %s', err.message)
      }

      status = result.StatusCode
      cb(null)
    })
  }

  var removeContainer = function (cb) {
    self.toolbelt.debug('Removing completed container %s.', container.id)

    container.remove({}, cb)
  }

  async.series([
    pullContainer,
    createContainer,
    startContainer,
    containerLogs,
    waitForCompletion,
    removeContainer
  ], function (err) {
    if (err) return callback(err)
    self.toolbelt.debug('Container %s completed with exit status %s.', container.id, status)

    callback(null, { status: status })
  })
}
