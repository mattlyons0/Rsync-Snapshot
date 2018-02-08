'use strict';

const fs = require('fs-extra');
const debug = require('debug')('RsyncBackup:lib:Logger');

class Logger {
  constructor(format, generator){
    this.format = format;
    this.generator = generator;

    this.summary = {}; //Summary to be written when stdout gets data
    this.outputFilenameUsed = true; //Used for determining when messages are warnings/errors
    this.outputFilename = '';
  }

  //Helper function to wrap stdout, stderr and callback so their
  // return values are printed and written to file based on flags
  log(type){
    //Map Function to wrap
    let consoleType = 'log';
    let fn = undefined;
    switch(type){
      case 'stdout':
        fn = this.generator.logger.stdout;
        break;
      case 'stderr':
        fn = this.generator.logger.stderr;
        consoleType = 'error';
        break;
      case 'callback':
        fn = this.generator.logger.callback;
        break;
      default:
        console.error('Unknown message type logged: '+type);
        return;
    }

    return (data, exitCode) => { //ExitCode only used by callback
      //Convert data to string if it is a buffer
      let print = fn.bind(this.generator.logger)(Buffer.isBuffer(data)?data.toString():data, exitCode); //Bind Logger Context

      if(!Array.isArray(print))
        print = [print];
      for(let line of print) {
        if(line) {
          this.fileAppend(line);
          console[consoleType](line);
        }
      }
    }
  }

  stdout(str){ //Process Stdout
    if(typeof str !== 'string') //Handle case when summary calls with JSON
      return [str];

    let output = [];
    let lines = str.split('\n');
    for(let line of lines) { //Can get multiple lines per buffer
      if(!line)
        continue;

      if (line.match(/^\s*(\d*,?)* *(\d*%) *(\d*.\d*\w*\/s) *(\d*:?)*/g)) { //If line is in format of data update
        this.outputFilenameUsed = true;
        let split = line.trim().split(' ').filter((s) => {return s}); //Split by space and omit empty elements
        let outputJson = {filename: this.outputFilename};
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
        output.push(outputJson);
      } else {
        if (line.match(/^\s*sent (\d*,?)* bytes/g)) { //Transfer Summary
          let split = line.trim().split(' ').filter((s) => {return s}); //Split by space and omit empty elems
          this.summary.sentBytes = Number(split[1].replace(/,/g, ''));
          this.summary.recvBytes = Number(split[4].replace(/,/g, ''));
          this.summary.avgSpeed = Number(split[6].replace(/,/g, ''));
        } else if (line.match(/^\s*total size is/g)) { //Speedup Summary
          let split = line.trim().split(' ').filter((s) => {return s}); //Split by space and omit empty elems
          this.summary.totalSize = Number(split[3].replace(/,/g, ''));
          this.summary.speedup = Number(split[6].replace(/,/g, ''));
        } else if (line.match(/^\s*(rsync|rsync error):/g)) { //Error Message
          this.log('stderr')({error: line});
        } else {
          //If filename has no progress between new filename is probably an error message or warning not a filename
          //Unless it ends in a / then its a folder
          if(!this.outputFilenameUsed && !this.outputFilename.endsWith('/')) {
            if(this.outputFilename.toLowerCase().includes('error'))
              log('stderr')({error: this.outputFilename}); //Log as error
            else
              output.push({warning: this.outputFilename}); //Log as warning
          }

          this.outputFilename = line;
          this.outputFilenameUsed = false;
        }
      }
    }

    return output;
  }

  stderr(str){ //Process Stderr
    if(typeof str !== 'string') //Handle case when summary calls with JSON
      return [str];

    let output = [];
    let lines = str.split('\n');
    for(let line of lines) {
      output.push({error: line});
    }

    return output;
  }

  callback(error, exitCode){ //Called on process completion
    if(exitCode !== 0){ //Some error occurred during process execution
      this.log('stderr')({error: `Backup Failed, rsync exited with code ${exitCode}`});

      if(error && typeof error === 'object' && Object.keys(error).length)
        this.log('stderr')({error: error});
    } else {
      if (this.summary.speedup) {
        this.log('stdout')(this.summary);

        for (let callback of this.generator.callbacks)
          callback();
        this.generator.callbacks = [];
      }
    }
  }

  firstLine(){
    let line = `- Starting Backup - ${this.generator.tempDir}`;
    if(this.generator.linkDir)
      line+= ` - Increment From ${this.generator.linkDir}`;

    return this.fileAppend(`\n${line}\n`);
  }

  lastLine(){
    return this.fileAppend(`\n- Backup Complete - ${this.generator.finalDir}\n`);
  }

  async fileAppend(data){
    if(this.generator.outputFile){
      try {
        await fs.appendFile(this.generator.outputFile, `\n${data}`);
      } catch(e){
        console.error('Error writing to output file', e);
      }
    }
  }
}

module.exports = Logger;
