'use strict';

const excludeList = ['/dev/*', '/proc/*', '/sys/*', '/tmp/*', '/run/*', '/mnt/*', '/media/*', '/var/lib/lxcfs',
  '/lost+found', '*/steam/steamapps', '/var/cache/apt', '/home/*/.thumbnails', '/home/*/.cache',
  '/home/*/.local/share/Trash', '/home/*/.gvfs', '/home/*/.npm', '/swapfile'];

const Rsync = require('rsync');
const argv = require('minimist')(process.argv.slice(2));
const debug = require('debug')('RsyncBackup:index');
const LogGenerator = require('./lib/LogGenerator');
const Incrementer = require('./lib/Incrementer');

let logger; //LogGenerator Instance
let incrementer; //Incrementer instance

let rsync;
let rsyncPid;
let linkDest;
let tempDest;

let backup = async () => {
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

  //Configure Excludes
  if(typeof argv.exclude === 'string')
    rsync.exclude(argv.exclude);
  else if(Array.isArray(argv.exclude)){
    argv.exclude.forEach((excludeFile) => {
      rsync.exclude(excludeFile);
    });
  }

  //Configure Optional Flags
  if(argv.checksum !== undefined)
    rsync.set('checksum');
  if(argv.accurateProgress !== undefined)
    rsync.set('no-inc-recursive'); //Don't incrementally recurse files (Makes progress percentage actually useful)

  //Configure Logger
  logger = new LogGenerator(argv.logFormat);
  try {
    await logger.setOutputFile(argv.logFile, argv.logFileLevel || 'ALL');
  } catch(e){
    console.error(`Error: Log file '${argv.logFile}' is unwritable`, e);
  }
  logger.startPrepare();

  //Set Incremental Backup to Link From
  incrementer = new Incrementer(logger, argv.shell, argv.dst);
  incrementer.setMaxSnapshots(argv.maxSnapshots);
  let prepared = await incrementer.prepareForBackup(); //Prepare for backup. Create incomplete dir and fetch link dest
  if (!prepared) {
    console.error('An error occurred preparing for incremental backup on server');
    process.exit(2);
  }
  linkDest = incrementer.linkDest;
  tempDest = incrementer.tempDest;
  logger.setDestination(tempDest, linkDest);

  let destSplit = argv.dst.split(':');
  if(destSplit.length > 1) //SSH style syntax or local style
    rsync.destination(`${destSplit[0]}:${tempDest}`);
  else
    rsync.destination(tempDest);
  if(linkDest)
    rsync.set('link-dest', linkDest);
  else
    debug('No previous snapshots found, creating first snapshot');

  //Execute Rsync
  debug('Executing command: '+rsync.command());
  rsyncPid = logger.startRsync(rsync);

  //Rename backup to remove .incomplete from name
  logger.addCallback(async () => {
    let finalized = await incrementer.finalizeBackup();
    if(finalized) {
      logger.setFinalDestination(incrementer.finalDest);
      let deleted = await incrementer.deleteOldSnapshots();
      if(deleted)
        logger.stopDelete();
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


//Execute Backup
backup().catch((err) => {
  console.error(err);
});
