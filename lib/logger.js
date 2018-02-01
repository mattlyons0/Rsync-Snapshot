'use strict';

const debug = require('debug')('RsyncBackup:lib:logger');

let logFormat = '';

function setLogFormat(format) {
  logFormat = format;
}

let successCallbacks = []; //Called if rsync exits with exit code 0 and speedup is printed

function addSuccessCallback(callback){
  successCallbacks.push(callback);
}

function processCallback (error, code) {
  if(code !== 0){ //Some error occurred during process execution
    logError({error: `Backup Failed, rsync exited with code: ${code}`});
  }

  if(error && typeof error === 'object' && Object.keys(error).length)
    logError({error: error});

  if(summary.speedup) {
    logOut(summary, 'summary');
    if(code === 0) {
      for (let callback of successCallbacks) {
        callback();
      }
      successCallbacks = [];
    }
  }
}

let filename = '';
let filenameRead = true;
let summary = {};

function processStdout(output) { //Stdout
  let lines = output.toString().split('\n');
  for(let line of lines) { //Can get multiple lines per buffer
    if (line.match(/^\s*(\d*,?)* *(\d*%) *(\d*.\d*\w*\/s) *(\d*:?)*/g)) { //If line is in format of data update
      filenameRead = true;
      let split = line.trim().split(' ').filter((s) => {return s}); //Split by space and omit empty elements
      let outputJson = {filename: filename};
      let num = Number(split[0].replace(/,/g, ''));
      if (Number.isSafeInteger(num)) {
        outputJson.bytes = num;
      } else {
        outputJson.bytes = 0;
        debug('Unsafe Number: ' + num + ' ' + split[0]);
      }
      outputJson.progress = split[1];
      outputJson.transferRate = split[2];
      outputJson.fileRemainTime = split[3];

      logOut(outputJson, 'update');
    } else {
      if(line) {
        if (line.match(/^\s*sent (\d*,?)* bytes/g)) { //Transfer Summary
          let split = line.trim().split(' ').filter((s) => {return s}); //Split by space and omit empty elems
          summary.sentBytes = Number(split[1].replace(/,/g, ''));
          summary.recvBytes = Number(split[4].replace(/,/g, ''));
          summary.avgSpeed = Number(split[6].replace(/,/g, ''));
        } else if (line.match(/^\s*total size is/g)) { //Speedup Summary
          let split = line.trim().split(' ').filter((s) => {return s}); //Split by space and omit empty elems
          summary.totalSize = Number(split[3].replace(/,/g, ''));
          summary.speedup = Number(split[6].replace(/,/g, ''));
        } else if (line.match(/^\s*(rsync|rsync error):/g)) { //Error Message
          logError({error: line});
        }
        else {
          //If filename has no progress between new filename is probably an error message or warning not a filename
          //Unless it ends in a / then its a folder
          if(!filenameRead && !filename.endsWith('/')) {
            if(filename.toLowerCase().includes('error'))
              logError({error: filename}); //Log as error
            else
              logOut({warning: filename}, 'warning'); //Log as warning
          }

          filename = line;
          filenameRead = false;
        }
      }
    }
  }
}

function processStderr (err) { //Stderr
  logError({error: err.toString()});
}

function logOut(output, messageType){
  let print = '';

  switch(logFormat){
    case 'json':
      print = JSON.stringify(output);
      break;

    case 'text':
      if(messageType === 'update'){
        print+=`Progress: ${output.progress} Rate: ${output.transferRate} TotalBytes: ${output.bytes}`;
        print+=` FileRemainTime: ${output.fileRemainTime} File: ${output.filename}`;
      } else if(messageType === 'summary'){
        print+=`Sent: ${output.sentBytes} Recv: ${output.recvBytes} Total: ${output.totalSize} `;
        print+=`Speed: ${output.avgSpeed} Speedup: ${output.speedup}`;
      } else if(messageType === 'warning'){
        print+=`Warning: ${output.warning}`;
      }
      break;
  }

  if(print)
    console.log(print);
}

function logError(output){
  let print = '';

  switch(logFormat){
    case 'json':
      print = JSON.stringify(output);
      break;

    case 'text':
      print = `Error: ${output.error}`;
  }

  if(print)
    console.error(print);
}

module.exports = {
  callback: processCallback,
  stdout: processStdout,
  stderr: processStderr,

  setFormat: setLogFormat,

  addSuccessCallback: addSuccessCallback,
};
