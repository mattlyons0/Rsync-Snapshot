'use strict';

const fs = require('fs');
const path = require('path');
const debug = require('debug')('RsyncSnapshot:lib:LogGenerator');

const Logger = require('./Logger');

class LogGenerator {
  constructor(format, backupStr){
    //Format
    this.loggers = this.getLoggers(); //List of possible loggers keyed by format
    this.logger = this.loggers['text']; //Default to text logGenerator in case format is invalid
    this.setFormat(format);

    //File Logging
    this.outputFile = '';
    this.outputFileLevel = '';

    //Destination Dirs
    this.tempDir = '';
    this.linkDir = '';
    this.finalDir = '';

    //Callbacks called when Rsync process exits
    this.callbacks = [];

    this.backupStr = backupStr;
  }

  // Get a map ([format] => instance) of loggers and instantiate map if needed
  getLoggers(){
    if(this.loggers)
      return this.loggers;

    //Otherwise instantiate list of loggers
    let loggers = [];
    try {
      fs.readdirSync(path.join(__dirname, '/loggers')).forEach((file) => {
        let loggerClass = new require('./loggers/'+file);
        loggers.push(new loggerClass(this));
      });
    } catch(e){
      console.error('Error instantiating loggers. No output will be logged!', e);
      return {};
    }

    let loggerMap = new Map();
    loggers.forEach((logger) => {
      loggerMap[logger.format] = logger;
    });

    return loggerMap;
  }

  setFormat(format) {
    let logger = this.loggers[format];
    if(logger && logger instanceof Logger){
      this.logger = logger;
      return true;
    } else if(format !== undefined){
      console.error(`Invalid Logging Format Set: ${format}`)
    }

    return false;
  }

  async setOutputFile(file, level) { //Will reject if file is not writable
    if (file) {
      file = path.resolve(file);

      //Will throw exception if can't write
      await new Promise((resolve, reject) => {
        fs.access(path.dirname(file), fs.constants.W_OK, (err) => {
          if(err)
            reject(err);
          else
            resolve();
        });
      });

      this.outputFile = file;
      this.outputFileLevel = level;
    }
  }

  setDestination(tempDest, linkDest){
    this.tempDir = tempDest;
    this.linkDir = linkDest;
  }

  addSuccessCallback(callback){
    this.callbacks.push(callback);
  }

  setFinalDestination(finalDest){
    this.finalDir = finalDest;
    this.logger.stateChange(`Backup Complete - ${this.finalDir}`);
  }

  startRsync(rsync){
    let newState = `Starting ${this.backupStr + this.tempDir?' - '+this.tempDir:''}`;
    if(this.linkDir)
      newState+= ` - Increment From ${this.linkDir}`;
    this.logger.stateChange(newState);

    return rsync.execute(this.logger.log('callback'), this.logger.log('stdout'), this.logger.log('stderr'));
  }

  logStateChange(newState){
    this.logger.stateChange(newState);
  }
}

module.exports = LogGenerator;
