'use strict';

const debug = require('debug')('RsyncBackup:lib:incrementer');
const spawn = require('child_process').spawn;
const path = require('path');

let usingSSH = undefined;
let command = '';
let remoteDirectory = undefined;

let linkDest, tempDest, finalDest;

function initShell(shell, rsyncDest){
  if(shell) { //rsyncDest = username@server.com:/my/path/to/backup
    usingSSH = true;
    command = shell;

    let dest = rsyncDest.split(':');
    let remoteServer = dest[0];
    command+= ` ${remoteServer}`;
    remoteDirectory = dest[1];
  } else { //rsyncDest = /my/path/to/backup
    usingSSH = false;
    remoteDirectory = rsyncDest;
  }

  //Generate temporary folder name
  let date = new Date();
  let year = date.getUTCFullYear();
  let month = leadingZero(date.getUTCMonth()+1, 2);
  let day = leadingZero(date.getUTCDate(), 2);
  let hour = leadingZero(date.getUTCHours(), 2);
  let minute = leadingZero(date.getUTCMinutes(), 2);
  let second = leadingZero(date.getUTCSeconds(), 2);
  let foldername = `${year}-${month}-${day}.${hour}-${minute}-${second}.incomplete`;
  tempDest = path.join(remoteDirectory,foldername);
}

function prepareForBackup(){ //Remove .incomplete folders, create .incomplete folder for this backup, find latest snapshot
  return new Promise((resolve, reject) => {
    let bashCommand = `mkdir -p '${escapeQuotes(tempDest)}';`; //Make Temp Dir
    bashCommand+= `cd '${escapeQuotes(remoteDirectory)}';`;
    bashCommand+= `find . -maxdepth 1 -type d -name '*.incomplete' | xargs rm -rf;`; //Cleanup old incomplete backups
    bashCommand+= `ls -1 | sort -r;`; //Print Snapshots 1 on a line most recent to least recent

    if(usingSSH)
      bashCommand = `"${bashCommand}"`; //Wrap in quotes to pass to ssh client

    let ssh = spawn('/bin/bash', ['-c', command+' '+bashCommand]); //Create SSH Process

    //Output is list of snapshots newest to oldest, pick the newest for linking
    ssh.stdout.on('data', (output) => {
      output = output.toString().split('\n');
      for(let line of output){
        if(line.match(/^\d{4}(-\d{2}){2}.(-?\d{2}){3}(?!.incomplete$)/g)){ //If folder matches the naming format (and is not incomplete)
          linkDest = path.join(remoteDirectory, line);
          resolve(true);
          return;
        }
      }
    });
    let hasError = false;
    //Handle any errors
    ssh.stderr.on('data', (error) => {
      error = error.toString();
      console.error('An error occurred connecting to server while preparing for backup:');
      console.error(error);
      hasError = true;
    });

    ssh.on('exit', (code) => {
      resolve(!hasError && !code);
    });
  });
}

function finalizeBackup(){ //Move backup to folder without .incomplete
  return new Promise((resolve, reject) => {
    finalDest = tempDest.substring(0,tempDest.length-('.incomplete'.length));

    let bashCommand = `cd '${escapeQuotes(remoteDirectory)}';`;
    bashCommand+= `mv ${tempDest} ${finalDest}`;

    if(usingSSH)
      bashCommand = `"${bashCommand}"`; //Wrap in quotes to pass to ssh client

    let ssh = spawn('/bin/bash', ['-c', command+' '+bashCommand]); //Create SSH Process

    let hasError = false;
    //Handle any errors
    ssh.stderr.on('data', (error) => {
      error = error.toString();
      console.error('An error occurred connecting to server while preparing for backup:');
      console.error(error);
      hasError = true;
    });

    ssh.on('exit', (code) => {
      resolve(!hasError && !code);
    });
  });
}


function leadingZero(digit, length){
  digit = digit+'';
  while(digit.length < length){
    digit = '0'+digit;
  }
  return digit;
}

function escapeQuotes(str){
  return str.replace(/([^\\])(["'])/g, '$1\\$2'); //Escape all unescaped single and double quotes
}

module.exports = {
  shell: initShell,
  prepare: prepareForBackup,
  finalize: finalizeBackup,
  getLinkDest: () => { return linkDest },
  getTempDest: () => { return tempDest },
  getFinalDest: () => { return finalDest },
};
