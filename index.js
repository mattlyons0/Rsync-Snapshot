'use strict';
//Executes the logical flow of backups in a procedural fashion (using async/await to format the code nicely)

let Runner = require('./lib/Runner');
let runner = new Runner(process.argv);

let execute = async () => {
  try {
    await runner.validateFlags();
    runner.configureRsync();
    await runner.configureLogger();

    await runner.executePrepare();
    await runner.executePreHooks();

    runner.executeRsync();
    await runner.configureCallbacks();

  } catch(e){
    mainProcessError(e);
  }
};

function quit (code) { //Handle killing rsync process
  let errMsg = code === 0 ? '' : `Process Received Exit Code: ${code}`;
  let err = new Error(errMsg);
  err.code = code;
  delete err.stack;

  mainProcessError(err);
}

async function mainProcessError(err){
  if(err.code !== 0) {
    let logged = false;

    try {
      if(runner.logger) {
        await runner.logger.logger.log('stderr')(err);
        await runner.logger.logStateChange(`${runner.backupStr} Failed`);
        logged = true;
      }
    } catch (newErr) {
      console.error('Error logging with logger:', newErr);
    }

    if(!logged) {
      if(err.stack)
        console.error(err.stack);
      else
        console.error(err.toString());
    }
  }

  runner.killRsync();

  //Exit with specified code or 99
  if(err.code !== undefined)
    process.exit(err.code);
  else
    process.exit(99);
}

//Reasons to exit (gracefully or not)
process.on('SIGINT', quit);
process.on('SIGTERM', quit);
process.on('unhandledRejection', mainProcessError);
process.on('uncaughtException', mainProcessError);

//Execute Backup
execute().catch(mainProcessError);
