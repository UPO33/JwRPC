const WebSocket = require('ws');
const JwRPC = require('../index');

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