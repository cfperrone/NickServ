NickServ
========

A NickServ written in Node.js.

Installation
------------
1. Create a copy of the sample configration for editing: `cp sample-config.js config.js`
2. Edit config to include your specific settings (see config definition below).
3. Create the database file: `touch data/db.sql`
4. Run the NickServ: `node nickserv.js`

Configuration Options
---------------------
Option | Description
------ | -----------
server | The IRC server FQDN the NickServ should run on
nick | The nick of the NickServ on the IRC server
nickTimeout | How long until a nickname is expired by inactivity
authTimeout | How long an un-authenticated nickname exists before becoming expired
userName | Login name for the IRC server
realName | IRC realname for the bot
port | IRC server connection port
channels | An array of channels to connect to by defult
