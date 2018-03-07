'use strict';

const debug = require('debug')('RsyncSnapshot:lib:Incrementer');
const spawn = require('child_process').spawn;
const execFile = require('child_process').execFile;
const path = require('path');
const fs = require('fs');

let mv = 'sudo mv';
let rm = 'sudo rm';

class Incrementer{
  constructor(logger, shell, rsyncDest){
    this.generator = logger;

    this.usingSSH = shell !== undefined;
    this.command = shell;
    this.remoteDirectory = undefined;

    this.linkDest = '';
    this.tempDest = '';
    this.finalDest = '';

    this.snapshotCount = 0;
    this.maxSnapshots = undefined;

    if(shell) { //rsyncDest = username@server.com:/my/path/to/backup
      let dest = rsyncDest.split(':');
      let remoteServer = dest[0];
      this.command+= ` ${remoteServer}`;
      this.remoteDirectory = dest[1];
    } else { //rsyncDest = /my/path/to/backup
      this.remoteDirectory = rsyncDest;
    }

    //Generate temporary folder name
    let date = new Date();
    let year = date.getUTCFullYear();
    let month = this.leadingZero(date.getUTCMonth()+1, 2);
    let day = this.leadingZero(date.getUTCDate(), 2);
    let hour = this.leadingZero(date.getUTCHours(), 2);
    let minute = this.leadingZero(date.getUTCMinutes(), 2);
    let second = this.leadingZero(date.getUTCSeconds(), 2);
    let foldername = `${year}-${month}-${day}.${hour}-${minute}-${second}.incomplete`;

    if(this.remoteDirectory)
      this.tempDest = path.join(this.remoteDirectory,foldername);
  }

  setMaxSnapshots(max){
    let num;
    try{
      num = Number(max);
      if(Number.isSafeInteger(num) && num > 0)
        this.maxSnapshots = num;
      else{
        throw new Error('')
      }
    } catch(e){
      console.error(`Invalid maxSnapshots: ${max}`);
    }
  }

  deleteOldSnapshots(){
    return new Promise((resolve, reject) => {
      let numDelete = this.snapshotCount - this.maxSnapshots;
      if(numDelete <= 0 || !Number.isSafeInteger(numDelete)) {
        resolve(false);
        return;
      }

      let bashCommand = `cd '${this.escapeQuotes(this.remoteDirectory)}';`;
      bashCommand+= `find . -maxdepth 1 -type d | sort | tail -n +2 | head -n ${numDelete} | xargs ${rm} -rf;`; //Delete oldest numDelete snapshots

      this.generator.logger.log('stdout')({msgType: 'progress', status: `Deleting Oldest ${numDelete} snapshots`});

      let hasError = false;
      let errorCallback = (error) => {
        error = error.toString();
        if(!hasError)
          this.generator.logger.log('stderr')('An error occurred connecting to server while deleting old snapshots:');
        this.generator.logger.log('stderr')(error);
        hasError = true;
      };

      let ssh = this.runCommand(bashCommand, errorCallback, errorCallback);

      ssh.on('exit', (code) => {
        resolve(!hasError && !code);
      });
    });
  }

  prepareForBackup(){ //Remove .incomplete folders, create .incomplete folder for this backup, find latest snapshot
    return new Promise(async (resolve, reject) => {
      let posixIncompleteRegex = '^.\\/[[:digit:]]{4}(-[[:digit:]]{2}){2}.(-?[[:digit:]]{2}){3}.incomplete$';

      let bashCommand = `mkdir -p '${this.escapeQuotes(this.tempDest)}';`; //Make Temp Directory Path
      bashCommand+= `cd '${this.escapeQuotes(this.remoteDirectory)}';`;
      bashCommand+= `INCOMPLETE_BACKUPS='';`; //Clear out variable in case it was already set
      bashCommand+= `INCOMPLETE_BACKUPS=$(find . -maxdepth 1 -type d -regextype posix-extended -regex '${posixIncompleteRegex}' | sort -r | tail -n+2);`; //Incomplete backups except what we just created
      //If there are incomplete backups find most recent and move into current backup dir (to preserve progress)
      bashCommand+= `if [ ! -z "$INCOMPLETE_BACKUPS" ]; then ${mv} $(echo "$INCOMPLETE_BACKUPS" | head -1)/* ${this.escapeQuotes(this.tempDest)}; fi;`;
      bashCommand+= `echo "$INCOMPLETE_BACKUPS" | xargs ${rm} -rf;`; //Delete old incomplete backup folders
      bashCommand+= `ls -1 | wc -l;`; //Folders (So we know when we got all info from ls)
      bashCommand+= `ls -1 | sort -r;`; //Print Folders 1 on a line most recent to least recent

      let scriptPath = `/tmp/${path.basename(this.tempDest)}.prepare.sh`;
      let writeErr = await new Promise((resolve, reject) => {
        fs.writeFile(scriptPath, bashCommand, (err) => {
          resolve(err);
        });
      });

      if(writeErr) {
        resolve(writeErr);
        return;
      }

      this.generator.logger.log('stdout')({msgType: 'progress', status: 'Deleting Incomplete Backups'});

      let hasError = false;
      let folderCount = 0;
      let foldersFound = 0;
        let ssh = this.runScript(scriptPath, (error) => {
        error = error.toString();
        if(!hasError)
          this.generator.logger.log('stderr')('An error occurred connecting to server while preparing for backup:');
        this.generator.logger.log('stderr')(error);
        hasError = true;
      }, (output) => { //Output is list of snapshots newest to oldest, pick the newest for linking
        output = output.toString().split('\n');

        for(let line of output){
          if(!line) {
            continue;
          } else if(line.match(/^\d*\s*$/g) && !folderCount){ //Folder Count
            folderCount = Number(line.trim());
          } else if(line.match(/^\d{4}(-\d{2}){2}.(-?\d{2}){3}(?!.incomplete$)/g) && folderCount){ //If folder matches the naming format (and is not incomplete)
            if(!this.linkDest)
              this.linkDest = path.join(this.remoteDirectory, line);

            foldersFound++;
            this.snapshotCount++;
          } else if(folderCount) { //Folder but not snapshot folder
            foldersFound++;
          }

          if(folderCount === foldersFound){
            resolve(true);
            return;
          }
        }
      });

      ssh.on('exit', (code) => {
        resolve(!hasError && !code);
      });
    });
  }

  finalizeBackup(){ //Move backup to folder without .incomplete
    return new Promise((resolve, reject) => {
      this.finalDest = this.tempDest.substring(0,this.tempDest.length-('.incomplete'.length));

      let bashCommand = `cd '${this.escapeQuotes(this.remoteDirectory)}';`;
      bashCommand+= `mv ${this.tempDest} ${this.finalDest}`;

      let hasError = false;
      let errorCallback = (error) => {
        error = error.toString();
        if(!hasError)
          this.generator.logger.log('stderr')('An error occurred connecting to server while finalizing backup:');
        this.generator.logger.log('stderr')(error);
        hasError = true;
      };

      let ssh = this.runCommand(bashCommand, errorCallback, errorCallback);

      ssh.on('exit', (code) => {
        if(!hasError && !code){
          this.snapshotCount++;
          resolve(true);
        } else
          resolve(false);
      });
    });
  }

  executeScriptHook(executablePath){
    return new Promise(async (resolve, reject) => {
      executablePath = path.resolve(executablePath);
      let scriptName = path.basename(executablePath);

      try {
        await new Promise((resolve, reject) => { //Throw exception if can't execute file
          fs.access(executablePath, fs.constants.X_OK, (err) => {
            if(err)
              reject(err);
            else
              resolve();
          });
        });

        this.generator.logger.log('stdout')({msgType: 'progress', status: `${scriptName} Started`});

        let proc = execFile(executablePath);

        proc.stdout.on('data', (data) => {
          let str = data.toString();
          let lines = str.split('\n');
          lines.forEach((line) => {
            this.generator.logger.log('stdout')({msgType: 'progress', status: line});
          });
        });

        proc.stderr.on('data', (data) => {
          let str = data.toString();
          let lines = str.split('\n');
          lines.forEach((line) => {
            this.generator.logger.log('stderr')(line);
          });
        });

        proc.on('exit', (code) => {
          if (code === 0) {
            this.generator.logger.log('stdout')({msgType: 'progress', status: `${scriptName} Exited`});
          } else {
            this.generator.logger.log('stderr')(`${scriptName} exited with code ${code}`)
          }

          resolve(code);
        });
      } catch(err){ //Failed to start process
        delete err.stack;
        this.generator.logger.log('stderr')(err);

        this.generator.logger.log('stderr')(`${scriptName} Failed`);
        resolve(-1);
      }
    });
  }

  leadingZero(digit, length){
    digit = digit+'';
    while(digit.length < length){
      digit = '0'+digit;
    }
    return digit;
  }

  escapeQuotes(str, quotes){ //Escape all unescaped single and double quotes (if quotes is undefined, otherwise escape either ' or " or both)
    if(!str)
      return;
    if(quotes === "'")
      return str.replace(/([^\\])(['])/g, '$1\\$2');
    if(quotes === '"')
      return str.replace(/([^\\])(["])/g, '$1\\$2');
    else
      return str.replace(/([^\\])(["'])/g, '$1\\$2');
  }

  runCommand(bashCommand, errorCallback, outputCallback) { //Run Command (over ssh if networked or bash if local)
    if (this.usingSSH)
      bashCommand = `"${this.escapeQuotes(bashCommand,'"')}"`; //Wrap in quotes to pass to ssh client
    if(this.command)
      bashCommand = this.command + ' ' + bashCommand;

    let proc = spawn('/bin/bash', ['-c', bashCommand]);
    proc.stderr.on('data', errorCallback);
    proc.stdout.on('data', outputCallback);

    return proc;
  }

  runScript(path, errorCallback, outputCallback) { //Run script file (over ssh if networked or bash if local)
    let bashCommand;

    if (this.usingSSH)
      bashCommand = `"bash -s" < ${path}`; //Wrap in quotes to pass to ssh client
    else
      bashCommand = `bash -s < ${path}`;
    if(this.command)
      bashCommand = this.command + ' ' + bashCommand;

    let proc = spawn('/bin/bash', ['-c', bashCommand]);
    proc.stderr.on('data', errorCallback);
    proc.stdout.on('data', outputCallback);
    proc.on('exit', (code) => {
      fs.unlink(path, () => {}); //Delete Script
    });

    return proc;
  }
}

module.exports = Incrementer;
