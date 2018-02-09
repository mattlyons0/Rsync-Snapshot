'use strict';

const Logger = require('../Logger');

class JsonLogger extends Logger{
  constructor(generator){
    super('json', generator);
  }

  stdout(str) {
    let out = [];

    this.stdoutToJson(str).forEach((json) => {
      out.push(JSON.stringify(json));
    });

    return out;
  }

  stderr(str){
    let out = [];

    this.stderrToJson(str).forEach((json) => {
      out.push(JSON.stringify(json));
    });

    return out;
  }
}

module.exports = JsonLogger;
