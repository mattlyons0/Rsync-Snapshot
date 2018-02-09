'use strict';

const Logger = require('../Logger');

class RawLogger extends Logger{
  constructor(generator){
    super('raw', generator);
  }

  stdout(str) {
    let out = [];
    let lines = str.split('\n');
    lines.forEach((line) => {
      out.push(line);
    });

    return out;
  }

  stderr(str){
    let out = [];
    let lines = str.split('\n');
    lines.forEach((line) => {
      out.push(line);
    });

    return out;
  }
}

module.exports = RawLogger;
