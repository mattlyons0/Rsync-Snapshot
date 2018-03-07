'use strict';

const Logger = require('../Logger');

class RawLogger extends Logger{
  constructor(generator){
    super('raw', generator);
  }

  stdout(str, jsonArr) {
    let out = [];
    if(!str){
      let done = false;
      jsonArr.forEach((json) => {
        if(json.msgType === 'progress'){
          str = json.status;
        } else if(json.msgType === 'summary') {
          done = true;
        } else {
          console.error(`Unknown Output: ${str} ${json}`);
          done = true;
        }
      });
      if(done)
        return;
    }

    let lines = str.split('\n');
    lines.forEach((line) => {
      out.push(line);
    });

    return out;
  }

  stderr(str, jsonArr){
    let out = [];
    if(!str){
      let done = false;
      jsonArr.forEach((json) => {
        if (json.error !== undefined) {
          str = json.error;
        } else if (json.msgType === 'warning'){
          str = json.warning;
        } else {
          console.error(`Unknown Output: ${str} ${json}`);
          done = true;
        }
      });
      if(done)
        return;
    }

    let lines = str.split('\n');
    lines.forEach((line) => {
      out.push(line);
    });

    return out;
  }
}

module.exports = RawLogger;
