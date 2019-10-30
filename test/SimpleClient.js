const WebSocket = require('ws');
const JwRPC = require('../index');

const ws = new WebSocket('ws://localhost:3434');

ws.on('open', function open() {
    const conn = new JwRPC(ws, {});

    //send a notification to server
    conn.Notify('greet', 'hi');

    //send a request to server.
    conn.Request('divide', [8, 2]).then(function(divideResult){
        console.log({divideResult}); //prints 4
    });
    //send a request to server. 
    conn.Request('divide', [8, 0]).catch(function(divideError){
        console.log({divideError}); //prints error. divide by zero.
    });
    //
    conn.Request('echo', 'hello world').then(function(echoResult){
        console.log({echoResult}); //prints 'hello world'
    });

});



