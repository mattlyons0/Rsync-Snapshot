'use strict';

const Logger = require('../Logger');

class JsonLogger extends Logger{
  constructor(generator){
    super('json', generator);
  }

  stdout(str, jsonArr) {
    let out = [];

    jsonArr.forEach((json) => {
      out.push(JSON.stringify(json));
    });

    return out;
  }

  stderr(str, jsonArr){
    let out = [];

    jsonArr.forEach((json) => {
      out.push(JSON.stringify(json));
    });

    return out;
  }
}

module.exports = JsonLogger;
