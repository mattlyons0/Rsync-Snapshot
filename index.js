'use strict';

const excludeList = ['/dev/*', '/proc/*', '/sys/*', '/tmp/*', '/run/*', '/mnt/*', '/media/*', '/var/lib/lxcfs',
  '/lost+found', '*/steam/steamapps', '/var/cache/apt', '/home/*/.thumbnails', '/home/*/.cache',
  '/home/*/.local/share/Trash', '/home/*/.gvfs', '/home/*/.npm', '/swapfile'];

const Rsync = require('rsync');
const argv = require('minimist')(process.argv.slice(2));
const debug = require('debug')('RsyncBackup:index');

let rsync = new Rsync()
  .executableShell('/bin/bash')
  .shell(argv.shell) //Optionally set shell (ex: 'ssh' for remote transfers)
  .flags('aAXHltv') //Archive (recursive, preserve props...), Preserve ACLs, Preserve Extended Props, Preserve Hardlinks, Preserve Symlinks, Preserve Modification Times, Verbose
  .set('numeric-ids') //Use Numeric Group & User IDs
  .set('delete') //Delete files on server that don't exist on client
  .set('progress') //Show Filenames
  .set('info','progress2') //Show Total Progress
  .source(argv.src || '/*')
  .destination(argv.dst);

let filename = '';
let summary = {};
let rsyncPid = rsync.execute((error, code, cmd) => {
  debug('Execution Complete with code: '+code);
  if(error)
    console.error(error);
  if(summary.speedup)
    console.log(JSON.stringify(summary));
}, (output) => { //Stdout
  let lines = output.toString().split('\n');
  for(let outputStr of lines) { //Can get multiple lines per buffer
    if (outputStr.match(/^\r *(\d*,?)* *\d*% *\d*.\d*\w*\/s *(\d*:?)*/g)) { //If output is in format of data update
      let split = outputStr.trim().split(' ').filter((s) => {return s}); //Split by space and omit empty elems
      let outputJson = {filename: filename};
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
      console.log(JSON.stringify(outputJson));
    } else {
      if(outputStr) {
        if (outputStr.match(/^ *sent (\d*,?)* bytes/g)) { //Xfer Summary
          let split = outputStr.trim().split(' ').filter((s) => {return s}); //Split by space and omit empty elems
          summary.sentBytes = Number(split[1].replace(/,/g, ''));
          summary.recvBytes = Number(split[4].replace(/,/g, ''));
          summary.avgSpeed = Number(split[6].replace(/,/g, ''));
        }
        else if (outputStr.match(/^ *total size is/g)) { //Speedup Summary
          let split = outputStr.trim().split(' ').filter((s) => {return s}); //Split by space and omit empty elems
          summary.totalSize = Number(split[3].replace(/,/g, ''));
          summary.speedup = Number(split[6].replace(/,/g, ''));
        }
        else {
          filename = outputStr;
        }
      }
    }
  }
}, (err) => { //Stderr
  console.error(err.toString());
});

let quit = () => {
  if(rsyncPid) //Kill Rsync on exit codes
    rsyncPid.kill();
};

process.on('SIGINT', quit);
process.on('SIGTERM', quit);
process.on('exit', quit);
