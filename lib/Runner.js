'use strict';

const Rsync = require('@mattlyons/rsync');
const pkg = require('../package.json');
const minimist = require('minimist');
const fs = require('fs');
const path = require('path');
const debug = require('debug')('RsyncSnapshot:Runner');
const LogGenerator = require('./LogGenerator');
const Incrementer = require('./Incrementer');

class Runner{
  constructor(argv){
    this.args = minimist(argv.slice(2));

    this.logger = undefined; //LogGenerator Instance
    this.incrementer = undefined; //Incrementer Instance

    this.restore = this.args.restore; //If we are restoring or not
    this.backupStr = this.restore?'Restore':'Backup';

    this.rsync = new Rsync();
    this.rsyncPid = undefined;
    this.linkDest = undefined;
    this.tempDest = undefined;


  }

  async validateFlags(){ //Check if any unknown flags are given and if required flags are specified
    let allowedFlagStr = await new Promise((resolve,reject) => {fs.readFile(path.resolve(__dirname,'../data/flags.txt'), 'utf8', (err,data) => {
      err ? reject(err) : resolve(data);
    })});
    let flagArr = allowedFlagStr.split('\n').filter((s) => {return !s.match(/^((\s*)|(#.*))$/g)}); //Keep any nonempty line that doesn't start with # (denoting a comment)
    let flagMap = new Map(flagArr.map((flag) => [flag, true]));

    Object.keys(this.args).forEach((arg) => {
      if(arg === '_'){
        this.args._.forEach((param) => {
          let err = new Error(`Parameter specified with no associated flag: ${param}`);
          delete err.stack;
          throw err;
        });
      } else if(flagMap.get(arg) !== true) {
        let err = new Error(`Unknown Flag: --${arg}`);
        delete err.stack;
        throw err;
      }
    });

    //Version output
    if(this.args.version){
      let version = `${pkg.name}: v${pkg.version}`;
      console.log(version);
      let err = new Error('');
      err.code = 0;
      throw err;
    }

    //Required Params Check
    if (!this.args.dst) {
      let err = new Error('--dst flag is required');
      err.code = 1;
      throw err;
    }
  }

  configureRsync(){
    //Configure Rsync
    this.rsync.executableShell('/bin/bash')
      .shell(this.args.shell) //Optionally set shell (ex: 'ssh' for remote transfers)
      .flags('aAXHltv') //Archive (recursive, preserve props...), Preserve ACLs, Preserve Extended Props, Preserve Hardlinks, Preserve Symlinks, Preserve Modification Times, Verbose
      .set('numeric-ids') //Use Numeric Group & User IDs
      .set('progress') //Show Current Filename
      .set('info', 'progress2') //Show Total Progress
      .source(this.args.src || '/*');

    //Configure Excludes
    if(typeof this.args.exclude === 'string')
      this.rsync.exclude(this.args.exclude);
    else if(Array.isArray(this.args.exclude)){
      this.args.exclude.forEach((excludeFile) => {
        this.rsync.exclude(excludeFile);
      });
    }

    //Configure ExcludeFile
    if(typeof this.args.excludeFile === 'string'){
      this.rsync.set('exclude-from', path.resolve(this.args.excludeFile));
    } else { //Use default excludeFile
      this.rsync.set('exclude-from', path.join(__dirname,'../','/data/defaultExclude.txt'));
    }

    //Configure Optional Flags
    if(this.args.checksum !== undefined)
      this.rsync.set('checksum');
    if(this.args.accurateProgress !== undefined)
      this.rsync.set('no-inc-recursive'); //Don't incrementally recurse files (Makes progress percentage actually useful)
    if(!this.args.noDelete) {
      this.rsync.set('delete'); //Delete files on server that don't exist on client
      this.rsync.set('delete-excluded') //Delete files that are excluded but may already exist on server
    }
    if(this.args.noDeleteExcludes)
      this.rsync.unset('delete-excluded');
    if(this.args.rsyncPath)
      this.rsync.set('rsync-path', this.args.rsyncPath);
    else
      this.rsync.set('rsync-path', 'sudo rsync');

    //Configure set/unsetRsyncArg
    let set = [];
    let unset = [];
    if(typeof this.args.setRsyncArg === 'string')
      set.push(this.args.setRsyncArg);
    else if(Array.isArray(this.args.setRsyncArg)){
      this.args.setRsyncArg.forEach((setArg) => {
        set.push(setArg)
      });
    }
    if(typeof this.args.unsetRsyncArg === 'string')
      unset.push(this.args.unsetRsyncArg);
    else if(Array.isArray(this.args.unsetRsyncArg)){
      this.args.unsetRsyncArg.forEach((unsetArg) => {
        unset.push(unsetArg)
      });
    }
    set.forEach((set) => {
      let split = set.split('=');
      if(split.length === 1)
        this.rsync.set(split[0]);
      else
        this.rsync.set(split[0], split[1]);
    });
    unset.forEach((unset) => {
      this.rsync.unset(unset);
    })

  }

  async configureLogger() {
    //Configure Logger
    this.logger = new LogGenerator(this.args.logFormat, this.backupStr);
    try {
      await this.logger.setOutputFile(this.args.logFile, this.args.logFileLevel || 'ALL');
    } catch(e){
      throw createError(`Log file '${this.args.logFile}' is unwritable`,e);
    }
    this.logger.logStateChange(`Preparing ${this.backupStr}`);
  }

  async executePrepare() {
    //Set Incremental Backup to Link From
    this.incrementer = new Incrementer(this.logger, this.args.shell, this.args.dst);

    if(this.restore){
      this.rsync.destination(this.args.dst);
      return;
    }

    this.incrementer.setMaxSnapshots(this.args.maxSnapshots);

    try { //Prepare for backup. Create incomplete dir and fetch link dest
      await this.incrementer.prepareForBackup();
    } catch(err){
      throw createError('Failed to prepare server for incremental backup',err);
    }

    this.linkDest = this.incrementer.linkDest;
    this.tempDest = this.incrementer.tempDest;
    this.logger.setDestination(this.tempDest, this.linkDest);

    let destSplit = this.args.dst.split(':');
    if (destSplit.length > 1) //SSH style syntax or local style
      this.rsync.destination(`${destSplit[0]}:${this.tempDest}`);
    else
      this.rsync.destination(this.tempDest);
    if (this.linkDest)
      this.rsync.set('link-dest', this.linkDest);
    else {
      debug('No previous snapshots found, creating first snapshot');
      this.logger.logger.log('stdout')({
        msgType: 'progress',
        status: 'No Previous Snapshots Detected, Creating Full Backup'
      });
    }
  }

  async executePreHooks(){
    //Configure Script Before Backup Hooks
    let runBefore = [];
    if(this.args.runBefore !== undefined){
      runBefore = this.args.runBefore;
      if(!Array.isArray(this.args.runBefore))
        runBefore = [this.args.runBefore];
    }

    if(runBefore.length){
      this.logger.logStateChange(`Executing Pre-${this.backupStr} Hooks`);
      for(let executablePath of runBefore){
        try {
          await this.incrementer.executeScriptHook(executablePath);
        } catch(err){
          throw createError(`Pre-${this.backupStr} Hook: ${executablePath} Failed`, err);
        }
      }
    }
  }

  executeRsync(){
    //Execute Rsync
    debug('Executing command: '+this.rsync.command());
    if(this.args.printCommand)
      console.log(`Executing rsync with command: ${this.rsync.command()}`);

    this.rsyncPid = this.logger.startRsync(this.rsync);
  }

  async configureCallbacks(){
    //Rename backup to remove .incomplete from name
    this.logger.addSuccessCallback(async () => {
      if(this.restore)
        return;

      try {
        await this.incrementer.finalizeBackup();
      } catch(err){
        throw createError('Failed to finalize backup on server',err);
      }

      this.logger.setFinalDestination(this.incrementer.finalDest);

      try {
        await this.incrementer.deleteOldSnapshots();
      } catch(err){
        throw createError('Failed to delete old snapshots on server',err);
      }
    });

    //Configure Script After Backup Hooks
    let runAfter = [];
    if(this.args.runAfter !== undefined){
      runAfter = this.args.runAfter;
      if(!Array.isArray(this.args.runAfter))
        runAfter = [this.args.runAfter];
    }

    if(runAfter.length){
      this.logger.addSuccessCallback(() => {
        this.logger.logStateChange(`Executing Post ${this.backupStr} Hooks`);
      });

      runAfter.forEach((executablePath) => {
        this.logger.addSuccessCallback(async () => {
          try {
            await this.incrementer.executeScriptHook(executablePath);
          } catch(err){
            throw createError(`Post-${this.backupStr} Hook: ${executablePath} Failed`, err);
          }
        });
      });
    }

    //Success Message
    this.logger.addSuccessCallback(() => {
      this.logger.logStateChange(`${this.backupStr} Finalized`)
    });
  }

  killRsync(){
    if(this.rsyncPid)
      this.rsyncPid.kill();
  }
}

module.exports = Runner;

function createError(newMessage, oldError){
  let msg = `${newMessage}: ${oldError.message}`;
  let err = new Error(msg);
  //Attach stack trace with modified first line (if trace exists)
  if(oldError.stack)
    err.stack = msg + oldError.stack.substring(oldError.stack.indexOf(oldError.message) + oldError.message.length+1);
  else
    delete err.stack;

  return err;
}
