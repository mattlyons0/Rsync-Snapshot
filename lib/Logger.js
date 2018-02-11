'use strict';

const fs = require('fs');
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
    let jsonFn = undefined;
    switch(type){
      case 'stdout':
        fn = this.generator.logger.stdout;
        jsonFn = this.stdoutToJson;
        break;
      case 'stderr':
        fn = this.generator.logger.stderr;
        jsonFn = this.stderrToJson;
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
      //Data can be a Buffer, string, JSON or Error(only if stderr)
      let json = undefined;
      //Convert data to string if it is a buffer
      if(Buffer.isBuffer(data))
        data = data.toString();
      //Convert data to JSON if possible
      if(typeof data === 'string' && jsonFn){
        json = jsonFn.bind(this)(data);
      }

      let print;
      //Bind Logger Context and transform to logger type
      if(type === 'callback')
        print = fn.bind(this.generator.logger)(data, exitCode);
      else
        print = fn.bind(this.generator.logger)(data, json);

      if(!Array.isArray(print))
        print = [print];
      for(let [index, line] of print.entries()) {
        if(line) {
          if(!json || this.shouldLogFile(json[index]))
            this.fileAppend(line);

          console[consoleType](line);
        }
      }
    }
  }

  shouldLogFile(json){ //Determine if output should be written to log file based on generator.outputFileLevel
    let level = this.generator.outputFileLevel;
    if(!level)
      return true;

    switch(level.toUpperCase()){
      case 'ALL':
        return true;
      case 'WARN':
        return json.msgType === 'warning' || json.msgType === 'error' || json.msgType === 'summary';
      case 'ERROR':
        return json.msgType === 'error' || json.msgType === 'summary';
      default:
        console.error(`Unknown logFileLevel: ${level}`);
        return true;
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

  prepare(){
    return this.fileAppend(`\n- Preparing Backup -\n`);
  }

  firstLine(){
    let line = `- Starting Backup - ${this.generator.tempDir}`;
    if(this.generator.linkDir)
      line+= ` - Increment From ${this.generator.linkDir}`;

    return this.fileAppend(`\n${line}\n`);
  }

  lastLine(){
    return this.fileAppend(`\n- Backup Complete - ${this.generator.finalDir}`);
  }

  async fileAppend(data){
    if(this.generator.outputFile){
      try {
        await new Promise((resolve, reject) => {
          fs.appendFile(this.generator.outputFile, `\n${data}`, (err) => {
            if(err)
              reject(err);
            else
              resolve();
          });
        });
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
