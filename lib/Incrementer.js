'use strict';

const debug = require('debug')('RsyncBackup:lib:Incrementer');
const spawn = require('child_process').spawn;
const path = require('path');

class Incrementer{
  constructor(logger, shell, rsyncDest){
    this.generator = logger;

    this.usingSSH = shell !== undefined;
    this.command = shell;
    this.remoteDirectory = undefined;

    this.linkDest = '';
    this.tempDest = '';
    this.finalDest = '';

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
    this.tempDest = path.join(this.remoteDirectory,foldername);
  }

  prepareForBackup(){ //Remove .incomplete folders, create .incomplete folder for this backup, find latest snapshot
    return new Promise((resolve, reject) => {
      let bashCommand = `mkdir -p '${this.escapeQuotes(this.tempDest)}';`; //Make Temp Dir
      bashCommand+= `cd '${this.escapeQuotes(this.remoteDirectory)}';`;
      bashCommand+= `find . -maxdepth 1 -type d -name '*.incomplete' | xargs rm -rf;`; //Cleanup old incomplete backups
      bashCommand+= `ls -1 | sort -r;`; //Print Snapshots 1 on a line most recent to least recent

      this.generator.logger.log('stdout')({msgType: 'progress', status: 'Deleting Incomplete Backup(s)...'});

      if(this.usingSSH)
        bashCommand = `"${bashCommand}"`; //Wrap in quotes to pass to ssh client
      let ssh = spawn('/bin/bash', ['-c', this.command+' '+bashCommand]); //Create SSH Process

      //Output is list of snapshots newest to oldest, pick the newest for linking
      ssh.stdout.on('data', (output) => {
        output = output.toString().split('\n');
        for(let line of output){
          if(line.match(/^\d{4}(-\d{2}){2}.(-?\d{2}){3}(?!.incomplete$)/g)){ //If folder matches the naming format (and is not incomplete)
            this.linkDest = path.join(this.remoteDirectory, line);
            resolve(true);
            return;
          }
        }
      });
      let hasError = false;
      //Handle any errors
      ssh.stderr.on('data', (error) => {
        error = error.toString();
        this.generator.logger.stderr('An error occurred connecting to server while preparing for backup:');
        this.generator.logger.stderr(error);
        hasError = true;
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

      if(this.usingSSH)
        bashCommand = `"${bashCommand}"`; //Wrap in quotes to pass to ssh client

      let ssh = spawn('/bin/bash', ['-c', this.command+' '+bashCommand]); //Create SSH Process

      let hasError = false;
      //Handle any errors
      ssh.stderr.on('data', (error) => {
        error = error.toString();
        this.generator.logger.stderr('An error occurred connecting to server while finalizing backup:');
        this.generator.logger.stderr(error);
        hasError = true;
      });

      ssh.on('exit', (code) => {
        resolve(!hasError && !code);
      });
    });
  }

  leadingZero(digit, length){
    digit = digit+'';
    while(digit.length < length){
      digit = '0'+digit;
    }
    return digit;
  }

  escapeQuotes(str){
    return str.replace(/([^\\])(["'])/g, '$1\\$2'); //Escape all unescaped single and double quotes
  }
}

module.exports = Incrementer;
