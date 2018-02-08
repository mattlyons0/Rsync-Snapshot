'use strict';

const excludeList = ['/dev/*', '/proc/*', '/sys/*', '/tmp/*', '/run/*', '/mnt/*', '/media/*', '/var/lib/lxcfs',
  '/lost+found', '*/steam/steamapps', '/var/cache/apt', '/home/*/.thumbnails', '/home/*/.cache',
  '/home/*/.local/share/Trash', '/home/*/.gvfs', '/home/*/.npm', '/swapfile'];

const Rsync = require('rsync');
const argv = require('minimist')(process.argv.slice(2));
const debug = require('debug')('RsyncBackup:index');
const logger = require('./lib/logger');
const incrementer = require('./lib/incrementer');

let rsync;
let rsyncPid;
let linkDest;
let tempDest;

let init = async () => {
  //Required Params Check
  if (!argv.dst) {
    console.error('No arguments specified');
    console.error('--dst is required');
    process.exit(1);
  }

  //Configure Rsync
  rsync = new Rsync()
    .executableShell('/bin/bash')
    .shell(argv.shell) //Optionally set shell (ex: 'ssh' for remote transfers)
    .flags('aAXHltv') //Archive (recursive, preserve props...), Preserve ACLs, Preserve Extended Props, Preserve Hardlinks, Preserve Symlinks, Preserve Modification Times, Verbose
    .set('numeric-ids') //Use Numeric Group & User IDs
    .set('delete') //Delete files on server that don't exist on client
    .set('delete-excluded') //Delete files that are excluded but may already exist on server
    .set('progress') //Show Current Filename
    .set('info', 'progress2') //Show Total Progress
    .exclude(excludeList)
    .source(argv.src || '/*');

  //Set Incremental Backup to Link From
  incrementer.shell(argv.shell, argv.dst);
  let prepared = await incrementer.prepare(); //Prepare for backup. Create incomplete dir and fetch link dest
  if (!prepared) {
    console.error('An error occurred preparing for incremental backup on server');
    process.exit(2);
  }
  linkDest = incrementer.getLinkDest();
  tempDest = incrementer.getTempDest();

  let destSplit = argv.dst.split(':');
  if(destSplit.length > 1) //SSH style syntax or local style
    rsync.destination(`${destSplit[0]}:${tempDest}`);
  else
    rsync.destination(tempDest);
  if(linkDest)
    rsync.set('link-dest', linkDest);
  else
    console.log('No previous snapshots found, creating first snapshot.');

  //Configure Logger
  logger.setFormat(argv.logFormat || 'json');
  let success = await logger.setFilepath(argv.logFile);
  if(!success){
    console.error('Unable to write to logFile');
    process.exit(3);
  }
  logger.setDestinations(tempDest, linkDest);

  //Execute Rsync
  rsyncPid = rsync.execute(logger.callback, logger.stdout, logger.stderr);

  //Mark Incremental Backup as Complete
  logger.addSuccessCallback(async () => {
    let finalized = await incrementer.finalize();
    if(finalized) {
      logger.finalized(incrementer.getFinalDest());
    }
  });
};

function quit () { //Handle killing rsync process
  if(rsyncPid) //Kill Rsync on exit codes
    rsyncPid.kill();
}

process.on('SIGINT', quit);
process.on('SIGTERM', quit);
process.on('exit', quit);

try {
  init();
} catch(e){
  console.error(e);
}
