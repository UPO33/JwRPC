# JwRPC
lightweight bidirectional JSON RPC over Websocket

# WIP don't use it yet

# Features
- Easy To use
- Lightweight, no dependency just a single file
- Bidirectional, both server and clients can send Request and Notification to eachother
- Async and promise based
- Basic rate limiting control


## Table of contents
- [Installing](#installing)
- [Usage examples](#usage-examples)
  - [Simple Server](#simple-server)
  - [Simple Client](#simple-client)
  
- [FAQ](#faq)
  - [How to store data peer connection](#how-to-connect-via-a-proxy)

- [Need Help? Contant Me](#contant-me)


## Installing
````
npm install jwrpc
````

## Usage examples

#### Simple Server

````js
const WebSocket = require('ws');
const JwRPC = require('jwrpc');

const wss = new WebSocket.Server({ port: 3434 });

const serverMethods = {
    'greet'  : new JwRPC.MethodInfo(RPC_greet),
    'echo'   : new JwRPC.MethodInfo(RPC_echo),
    'divide' : new JwRPC.MethodInfo(RPC_divide),
    
};



function RPC_greet(peer, params, callback){
    console.log({params});
    //for notification calling 'callback' is optional
}
function RPC_echo(peer, params, callback){
    console.log({params});
    //send the 'params' back to client
    callback(null, params);
}
function RPC_divide(peer, params, callback){
    console.log({params});
    if(params[1] === 0)
        return callback({code:1, message:'divide by zero'});
    
    callback(null, params[0] / params[1]);
}


wss.on('connection', function (ws) {
    console.log('new connection accepted');
    ws.conn = new JwRPC(ws, serverMethods);

});
````

#### Simple Client
````js
const WebSocket = require('ws');
const JwRPC = require('jwrpc');

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
````



## Need Help? Contant Me
abc0d3r@gmail.com
