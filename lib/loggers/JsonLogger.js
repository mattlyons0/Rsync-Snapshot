'use strict';

const Logger = require('../Logger');

class JsonLogger extends Logger{
  constructor(generator){
    super('json', generator);
  }

  stdout(str) {
    let out = [];

    super.stdout(str).forEach((json) => {
      out.push(JSON.stringify(json));
    });

    return out;
  }

  stderr(str){
    let out = [];

    super.stderr(str).forEach((json) => {
      out.push(JSON.stringify(json));
    });

    return out;
  }
}

module.exports = JsonLogger;
