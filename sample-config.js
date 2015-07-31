module.exports.config = {
    server: '',
    nick: 'NickServ',

    // NickServ-specific Options
    nickTimeout: 90, // number of days of inactivity until a nick expires
    authTimeout: 24, // number of hours until a pending nick is thrown out

    // IRC Module Options
    userName: 'NickServ',
    realName: 'A nickname control bot',
    port: 6667,

    /* For SSL connections
    secure: true,
    selfSigned: false,
    certExpired: false,
    */

    channels: [
        '#engineering',
    ],
}
