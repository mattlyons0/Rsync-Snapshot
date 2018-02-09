Rsync Backup
============

#### *Currently a Work In Progress* [Feature Status](https://github.com/mattlyons0/Rsync-Backup/issues/1)

A Node.js implementation of incremental full system backups using rsync based on [rsync - Arch Linux Wiki](https://wiki.archlinux.org/index.php/rsync#Snapshot_backup)

See [Do It Yourself Backup System Using Rsync](http://www.sanitarium.net/golug/rsync_backups_2010.html) for a detailed explanation of how incremental backups using rsync work

### Features (See [Feature Status](https://github.com/mattlyons0/Rsync-Backup/issues/1))
- Full System Backup
  - Backup of `/` with attributes
  - Networked backups over the SSH Protocol
  - Transfers file deltas only (No need to transfer entire files, just the changes)
- Incremental History
  - Using Hardlinks incremental history is stored
  - Auto deletion of increments after specified number of days have passed
- Logging
- Script Hooks

### Requirements
- NodeJS v7.6 or later - *async/await is used in this codebase*
- Rsync must be installed on the client and the server
- One machine must have SSH access to the other (if backing up over network) without a password (pubkey) and with complete read access

### Data Consistency & Integrity
Rsync Does **NOT** Ensure Consistency | Rsync **May** Ensure Integrity
- Consistency
  - Rsync can not take snapshots like certain file systems (ZFS, LVM...) this means **if there are changes to files between this script starting and finishing the files could have been copied in any state**
  - Rsync first builds a list of files then transfers only the deltas of each file from the client to the server
  - This means that files created after rsync has built a list of files will not be transfered
  - Because consistency is not ensured, **this backup solution is not sufficient for database backups**
    - It is recommended that database dumps are taken using database specific technology (ex: pg_dump for postgres)
    - The same applies to any write heavy application
- Integrity
  - Rsync **will always ensure transferred files are correctly reconstructed** in memory
  - Rsync will then write the data in memory to the disk
  - If the OS indicates a successful write, rsync will proceed
    - There is no checksum done post write to disk as write correctness to be handled by the OS
  - Rsync determines files to be transferred by default by comparing file size and modification date
    - **Checksums are only generated for transferred files**
    - The criteria to transfer files can be changed to comparing file size only using the `--checksum` flag

### Usage
- Clone this repo `git clone https://github.com/mattlyons0/Rsync-Backup.git`
- Execute the backup
  - Locally `node Rsync-Backup --dst /media/MyBackup`
  - Remotely `node Rsync-Backup --shell ssh --dst username@myserver.com:/media/MyBackup`

#### Parameters
*Note: To wrap strings double quotes must be used. Ex: `--shell "ssh -p 2222"` must be used to specify ssh parameters. Single quotes will not be parsed correctly.*
##### Rsync
- `--src PATH` *Default:* `/*`
  - Source path to backup
- `--dst PATH`
  - Destination folder path for backup
  - If using `--shell ssh` format is `username@server:destinationPath`
  - Folders will be created in this directory for incremental backup history
- `--shell SHELL`
  - Remote shell to use
  - *Note: Remote shell is assumed to be a ssh compatible client if specified*
    - Ex: `ssh` or `"ssh -p 2222"`
- `--exclude PATH` *Can be used multiple times*
  - Default Exclude List
    - `/dev/*` `/proc/*` `/sys/*` `/tmp/*` `/run/*` `/mnt/*` `/media/*` `/var/lib/lxcfs` `/lost+found` `*/steam/steamapps` `/var/cache/apt` `/home/*/.thumbnails` `/home/*/.cache` `/home/*/.local/share/Trash` `/home/*/.gvfs` `/home/*/.npm` `/swapfile`
  - Syntax
    - Include empty folder in destination: `/dev/*`
    - Do not include folder in destination: `/dev`
    - Glob style syntax: `*/steam/steamapps` (Will exclude any file/folder ending with /steam/steamapps)
    - [See Filter Rules](https://linux.die.net/man/1/rsync) for more information
- `--checksum`
  - Change default transfer criteria from comparing modification date and file size to just comparing file size
  - This means the file size being the same is the only requirement needed to generate a checksum and transfer potential file differences
    - Enabling this flag will incur a performance penalty as many more checksums may be generated
- `--accurateProgress`
  - Recurse all directories before transferring any files to generate a more accurate file tree
  - *Note: This will increase memory usage substantially*
##### Logging
- `--logFormat FORMAT` *Default:* `text`
  - Format used to log output
  - Supported formats:
    - `json` - Rsync process output in JSON format
    - `text` - An easy to read rsync process output
    - `raw` - Output directly from rsync process
- `--logFile PATH`
  - Path to file used to write output in `logFormat`
  - If file already exists it will be appended, otherwise it will be created

### Common Warnings/Errors
- `rsync warning: some files vanished before they could be transferred (code 24)`
- `file has vanished`
  - These warnings indicate a file has been deleted between the time rsync started and stopped executing
  - This does not mean the backup has failed, it is an expected warning as rsync does not take system level snapshots and data will not always be consistent
    - See Data Consistency & Integrity section for more information

### Recovery
- Partial Recovery
  - Since the backups are not compressed partial recovery is as easy as using SFTP (Filezilla works great if you want a GUI) and copying files over from the desired dated snapshot
    - *Note: SFTP does not preserve all file attributes, if this is desired it is recommended to write a rsync script to transfer files using rsync parameters found in this script*
      - At some point in the future I could make a flag for restores, if this would be useful to you feel free to open an issue
- Complete Recovery
  - Recovering an entire installation is very similar to partial recovery
  - You will need to boot on a Live CD with access to networking, install rsync and then use it to rsync the files to the desired partition(s) (of course you will have to make the partition(s) first if they don't already exist)
  - Note that you may have to update things like /etc/fstab if disk names have changed or regenerate the bootloader
  - For more details see [Recovering entire systems from backups](http://www.sanitarium.net/golug/rsync_backups_2010.html)

### Additional Resources
  - [Do It Yourself Backup System Using Rsync](http://www.sanitarium.net/golug/rsync_backups_2010.html) - Tons of useful information and what this script is based on
    - [Snapshot Diff Script](http://www.sanitarium.net/unix_stuff/Kevin%27s%20Rsync%20Backups/diff_backup.pl.txt) Script to find differences between two rsync snapshots
    - [Partition Table Backup](http://www.sanitarium.net/unix_stuff/Kevin%27s%20Rsync%20Backups/getinfo.pl.txt) Script to backup the current partition table schema
  - [Rsync Snapshot Backup - Arch Wiki](https://wiki.archlinux.org/index.php/rsync#Snapshot_backup) Arch Linux Wiki Page on Rsync and using snapshots
