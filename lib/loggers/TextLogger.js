'use strict';

const Logger = require('../Logger');
const filesize = require('filesize');

class TextLogger extends Logger{
  constructor(generator){
    super('text', generator);
  }

  stdout(str) {
    let out = [];
    let jsonArr = this.stdoutToJson(str);

    for(let json of jsonArr){
      let output = '';

      if(json.progress !== undefined){ //Progress Update Message
        output+=`Progress: ${json.progress} Rate: ${json.transferRate} TotalBytes: ${filesize(json.bytes, {unix: true})}`;
        output+=` ElapsedTime: ${json.time} Status: ${json.status}`;
      } else if(json.speedup !== undefined) { //Summary Message
        output+=`Sent: ${filesize(json.sentBytes, {unix: true})} Recv: ${filesize(json.recvBytes, {unix: true})} Total: ${filesize(json.totalSize, {unix: true})} `;
        output+=`Speed: ${filesize(json.avgSpeed, {unix: true})}B/s Speedup: ${json.speedup}`;
      } else if(json.msgType === 'warning') { //Warning Message
        output += `Warning: ${json.warning}`
      } else if(json.msgType === 'progress'){ //Misc Progress Update
        output+= json.status;
      } else {
        output+=`Unknown JSON Input ${JSON.stringify(json)}`
      }

      out.push(output);
    }

    return out;
  }

  stderr(str){
    let out = [];
    let jsonArr = this.stderrToJson(str);

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
