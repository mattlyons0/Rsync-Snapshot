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
  - Over the Network
    - Checksums are used to verify data sent to server is correct as the file is being transfered
  - Filesystem
    - **There is no checksum after a file has been written to the disk (by default)**
    - If the kernel indicates the data was written rsync will assume this is the case
  - A checksum can be computed after writing to the disk with the `-c` option to ensure file integrity after writing to the disk

### Usage
- Clone this repo `git clone https://github.com/mattlyons0/Rsync-Backup.git`
- Execute the backup
  - Locally `node Rsync-Backup --dst /media/MyBackup`
  - Remotely `node Rsync-Backup --shell ssh --dst username@myserver.com:/media/MyBackup`

#### Parameters
*Note: To wrap strings double quotes must be used. Ex: `--shell "ssh -p 2222"` must be used to specify ssh parameters. Single quotes will not be parsed correctly.*
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
- `--logFormat FORMAT` *Default:* `json`
  - Format used to log output
  - Supported formats: `json` `text`

#### Recovery
- Partial Recovery
  - Since the backups are not compressed partial recovery is as easy as using SFTP (Filezilla works great if you want a GUI) and copying files over from the desired dated snapshot
    - *Note: SFTP does not preserve all file attributes, if this is desired it is recommended to write a rsync script to transfer files using rsync parameters found in this script*
      - At some point in the future I could make a flag for restores, if this would be useful to you feel free to open an issue
- Complete Recovery
  - Recovering an entire installation is very similar to partial recovery
  - You will need to boot on a Live CD with access to networking, install rsync and then use it to rsync the files to the desired partition(s) (of course you will have to make the partition(s) first if they don't already exist)
  - Note that you may have to update things like /etc/fstab if disk names have changed or regenerate the bootloader
  - For more details see [Recovering entire systems from backups](http://www.sanitarium.net/golug/rsync_backups_2010.html)
