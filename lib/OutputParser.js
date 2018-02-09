'use strict';

const debug = require('debug')('RsyncBackup:lib:OutputParser');

//Parse Rsync Stderr and Stdout to JSON
class OutputParser{
  constructor(generator){
    this.generator = generator;

    this.summary = {}; //Summary to be written when stdout gets data
    this.outputStatus = '';
  }

  stderr(input){
    let output = [];
    let lines = input.split('\n');
    for(let line of lines) {
      if(line)
        output.push({error: line});
    }

    return output;
  }

  stdout(input){
    let output = [];
    let lines = input.split('\n');
    for(let line of lines) {
      if(!line)
        continue;

      let split = this.splitBySpace(line);

      //Check Type of Stdout
      if (line.match(/^\s*(\d*,?)* *(\d*%) *(\d*.\d*\w*\/s) *(\d*:?)*/g)) { //Data Update
        let outputJson = {status: this.outputStatus};
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
      } else if (line.match(/^\s*sent (\d*,?)* bytes/g)) { //Transfer Summary
        this.summary.sentBytes = Number(split[1].replace(/,/g, ''));
        this.summary.recvBytes = Number(split[4].replace(/,/g, ''));
        this.summary.avgSpeed = Number(split[6].replace(/,/g, ''));
      } else if (line.match(/^\s*total size is/g)) { //Speedup Summary
        this.summary.totalSize = Number(split[3].replace(/,/g, ''));
        this.summary.speedup = Number(split[6].replace(/,/g, ''));
      } else if (line.match(/^\s*(rsync|rsync error):/g)) { //Error Message
        this.generator.logger.log('stderr')(line);
      } else if(line.match(/[^\\]"[^"\/]+"/g)) { //Line with unescaped " set is assumed to be a warning
        output.push({warning: this.outputStatus});
      } else { //Otherwise, assumed to be a filename/status
        this.outputStatus = line;
      }
    }

    return output;
  }

  callback(error, exitCode){
    if(exitCode !== 0){ //Some error occurred during process execution
      this.generator.logger.log('stderr')(`Backup Failed, rsync exited with code ${exitCode}`);

      if(error && typeof error === 'object' && Object.keys(error).length)
        this.generator.logger.log('stderr')(error);
    } else {
      if (this.summary.speedup) {
        this.generator.logger.log('stdout')(this.summary);

        for (let callback of this.generator.callbacks)
          callback();
        this.generator.callbacks = [];
      }
    }
  }

  splitBySpace(str){
    return str.trim().split(' ').filter((s) => {return s});
  }
}

module.exports = OutputParser;
