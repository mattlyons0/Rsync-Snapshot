'use strict';

const excludeList = ['/dev/*', '/proc/*', '/sys/*', '/tmp/*', '/run/*', '/mnt/*', '/media/*', '/var/lib/lxcfs',
  '/lost+found', '*/steam/steamapps', '/var/cache/apt', '/home/*/.thumbnails', '/home/*/.cache',
  '/home/*/.local/share/Trash', '/home/*/.gvfs', '/home/*/.npm', '/swapfile'];

const Rsync = require('rsync');
const argv = require('minimist')(process.argv.slice(2));
const debug = require('debug')('RsyncBackup:index');
const logger = require('./lib/logger');

//Configure Rsync
let rsync = new Rsync()
  .executableShell('/bin/bash')
  .shell(argv.shell) //Optionally set shell (ex: 'ssh' for remote transfers)
  .flags('aAXHltv') //Archive (recursive, preserve props...), Preserve ACLs, Preserve Extended Props, Preserve Hardlinks, Preserve Symlinks, Preserve Modification Times, Verbose
  .set('numeric-ids') //Use Numeric Group & User IDs
  .set('delete') //Delete files on server that don't exist on client
  .set('progress') //Show Current Filename
  .set('info','progress2') //Show Total Progress
  .source(argv.src || '/*')
  .destination(argv.dst);

//Configure Logger
logger.setFormat(argv.logFormat || 'json');

//Execute Rsync
let rsyncPid = rsync.execute(logger.callback, logger.stdout, logger.stderr);

let quit = () => { //Handle killing rsync process
  if(rsyncPid) //Kill Rsync on exit codes
    rsyncPid.kill();
};

process.on('SIGINT', quit);
process.on('SIGTERM', quit);
process.on('exit', quit);
