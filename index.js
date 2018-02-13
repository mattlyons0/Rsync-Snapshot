'use strict';

const Rsync = require('rsync');
const argv = require('minimist')(process.argv.slice(2));
const path = require('path');
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
    .source(argv.src || '/*');

  //Configure Excludes
  if(typeof argv.exclude === 'string')
    rsync.exclude(argv.exclude);
  else if(Array.isArray(argv.exclude)){
    argv.exclude.forEach((excludeFile) => {
      rsync.exclude(excludeFile);
    });
  }
  //Configure ExcludeFile
  if(typeof argv.excludeFile === 'string'){
    rsync.set('exclude-from', path.resolve(argv.excludeFile));
  } else { //Use default excludeFile
    rsync.set('exclude-from', path.join(__dirname,'/data/defaultExclude.txt'));
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
  logger.logStateChange('Preparing Backup');

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
  else {
    debug('No previous snapshots found, creating first snapshot');
    logger.logger.log('stdout')({msgType: 'progress', status: 'No Previous Snapshots Detected, Creating Full Backup'});
  }

  //Configure Script Before Backup Hooks
  let runBefore = [];
  if(argv.runBefore !== undefined){
    runBefore = argv.runBefore;
    if(!Array.isArray(argv.runBefore))
      runBefore = [argv.runBefore];
  }

  if(runBefore.length){
    logger.logStateChange('Executing Pre Backup Hooks');
    for(let executablePath of runBefore){
      await incrementer.executeScriptHook(executablePath);
    }
  }

  //Execute Rsync
  debug('Executing command: '+rsync.command());
  rsyncPid = logger.startRsync(rsync);

  //Rename backup to remove .incomplete from name
  logger.addSuccessCallback(async () => {
    let finalized = await incrementer.finalizeBackup();
    if(finalized) {
      logger.setFinalDestination(incrementer.finalDest);
      await incrementer.deleteOldSnapshots();
    }
  });

  //Configure Script After Backup Hooks
  let runAfter = [];
  if(argv.runAfter !== undefined){
    runAfter = argv.runAfter;
    if(!Array.isArray(argv.runAfter))
      runAfter = [argv.runAfter];
  }

  if(runAfter.length){
    logger.addSuccessCallback(() => {
      logger.logStateChange('Executing Post Backup Hooks');
    });

    runAfter.forEach((executablePath) => {
      logger.addSuccessCallback(async () => {
        await incrementer.executeScriptHook(executablePath);
      });
    });
  }

  //Success Message
  logger.addSuccessCallback(() => {
    logger.logStateChange('Backup Finalized')
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
backup().catch(mainProcessError);

process.on('unhandledRejection', mainProcessError);
process.on('uncaughtException', mainProcessError);

function mainProcessError(err){
  try {
    if (logger) {
      logger.logger.log('stderr')(err);
    } else {
      throw new Error();
    }
  } catch(newErr){
    console.error(err);
  }
}
