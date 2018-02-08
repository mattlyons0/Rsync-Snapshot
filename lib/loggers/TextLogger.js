'use strict';

const Logger = require('../Logger');

class TextLogger extends Logger{
  constructor(generator){
    super('text', generator);
  }

  stdout(str) {
    let out = [];
    let jsonArr = super.stdout(str);

    for(let json of jsonArr){
      let output = '';

      if(json.progress !== undefined){ //Progress Update Message
        output+=`Progress: ${json.progress} Rate: ${json.transferRate} TotalBytes: ${json.bytes}`;
        output+=` FileRemainTime: ${json.fileRemainTime} File: ${json.filename}`;
      } else if(json.speedup !== undefined) { //Summary Message
        output+=`Sent: ${json.sentBytes} Recv: ${json.recvBytes} Total: ${json.totalSize} `;
        output+=`Speed: ${json.avgSpeed} Speedup: ${json.speedup}`;
      } else if(json.warning !== undefined) { //Warning Message
        output+=`Warning: ${json.warning}`
      } else {
        output+=`Unknown JSON Input ${JSON.stringify(json)}`
      }

      out.push(output);
    }

    return out;
  }

  stderr(str){
    let out = [];
    let jsonArr = super.stderr(str);

    for(let json of jsonArr){
      let output = '';

      if(json.error !== undefined){
        output+=`Error: ${json.error}`;
      } else {
        output += `Unknown JSON Input ${JSON.stringify(json)}`;
      }

      out.push(output);
    }

    return out;
  }
}

module.exports = TextLogger;
