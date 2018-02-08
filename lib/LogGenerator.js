'use strict';

const fs = require('fs-extra');
const path = require('path');
const debug = require('debug')('RsyncBackup:lib:LogGenerator');

const Logger = require('./Logger');

class LogGenerator {
  constructor(format){
    //Format
    this.loggers = this.getLoggers(); //List of possible loggers keyed by format
    this.logger = this.loggers['text']; //Default to text logger in case format is invalid
    this.setFormat(format);

    //File Logging
    this.outputFile = '';
    this.outputLevel = '';

    //Destination Dirs
    this.tempDir = '';
    this.linkDir = '';
    this.finalDir = '';

    //Callbacks called when Rsync process exits
    this.callbacks = [];
  }

  // Get a map ([format] => instance) of loggers and instantiate map if needed
  getLoggers(){
    if(this.loggers)
      return this.loggers;

    //Otherwise instantiate list of loggers
    let loggers = [];
    try {
      fs.readdirSync(path.resolve('lib/loggers')).forEach((file) => {
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
      if (!path.isAbsolute(file)) //Convert relative path to absolute
        file = path.resolve(file);

        await fs.access(path.dirname(file), fs.constants.W_OK); //Will throw exception if can't write

        this.outputFile = file;
        this.outputLevel = level;
    }
  }

  setDestination(tempDest, linkDest){
    this.tempDir = tempDest;
    this.linkDir = linkDest;
  }

  addCallback(callback){
    this.callbacks.push(callback);
  }

  setFinalDestination(finalDest){
    this.finalDir = finalDest;
    this.logger.lastLine();
  }

  startRsync(rsync){
    this.logger.firstLine();
    return rsync.execute(this.logger.log('callback'), this.logger.log('stdout'), this.logger.log('stderr'));
  }
}

module.exports = LogGenerator;
