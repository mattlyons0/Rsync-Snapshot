'use strict';

const fs = require('fs-extra');
const debug = require('debug')('RsyncBackup:lib:Logger');

const OutputParser = require('./OutputParser');

class Logger {
  constructor(format, generator){
    this.format = format;
    this.generator = generator;

    this.outputParser = new OutputParser(generator);
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

  stdoutToJson(str){ //Process Stdout to JSON
    if(typeof str !== 'string') //Handle case when str is already JSON
      return [str];

    return this.outputParser.stdout(str);
  }

  stderrToJson(str){ //Process Stderr to JSON
    if(typeof str !== 'string') //Handle case when str is already JSON
      return [str];

    return this.outputParser.stderr(str);
  }

  callback(error, exitCode){ //Called on process completion
    return this.outputParser.callback(error, exitCode);
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

  stdout(){
    console.error(`Logger '${this.format}' has not implemented stdout!`);
  }

  stderr(){
    console.error(`Logger '${this.format}' has not implemented stderr!`);
  }
}

module.exports = Logger;
