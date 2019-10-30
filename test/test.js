'use strict';

const JwRPC = require('../index');
const WebSocket = require('ws');
const promts = require('prompts');
const assert = require('assert');

const argv = require('yargs')
.option('server', {})
.option('url', {default:"ws://localhost:3333"})
.option('port', {default:3333}).argv;

const gErrors = {
    LoginFailed : {code:100, message:"login failed"},
    Failed : {code:1001, message:"failed"},
};


function MakeMethod(method, bSolo = false, limitRate = 1000, limitPeriod = 1){
    return new JwRPC.MethodInfo(function(peer, params, callback){
       console.log(`-------------${method.name}---------------`);
       console.log(params);
       method(peer, params, callback);
    }, bSolo, limitRate, limitPeriod);
}
function RPC_ServerLogin(peer, params, callback){
    setTimeout(function(){
        if(params.username === 'upo33')
            return callback(null, {'id':'asdasd'});

        return callback(gErrors.LoginFailed);
    });
}


function RPC_SharedEcho(peer, params, callback){
    callback(null, params);
}
function RPC_SharedNotiHi(peer, params, callback){
    assert(params === 'hi');
}
function RPC_SharedTimeout(peer, params, callback){
}
function RPC_SharedFail(peer, params, callback){
    callback(gErrors.Failed);
}
function RPC_SharedSoloTest(peer, params, callback){
    setTimeout(function(){
        callback(null, {});
    }, 10 * 1000);
}
function PC_SharedRate1Sec(peer, params, callback){
    callback(null, {});
}

const gSharedRPC = {
    'SoloTest' : MakeMethod(RPC_SharedSoloTest, true),
    'Timeout' : MakeMethod(RPC_SharedTimeout),
    'Fail' : MakeMethod(RPC_SharedFail),
    'Echo' : MakeMethod(RPC_SharedEcho),
    'NotiHi' : MakeMethod(RPC_SharedNotiHi),
    'Rate1Sec' : MakeMethod(PC_SharedRate1Sec, false, 1, 1),
};
let gServerRPCs = {
    'Login' : MakeMethod(RPC_ServerLogin, true, 20, 1),
};

let gClientRPCs = {
    
};

gClientRPCs = Object.assign(gClientRPCs, gSharedRPC);
gServerRPCs = Object.assign(gServerRPCs, gSharedRPC);

function SharedAfterConnect(conn){
    conn.Request('Fail', []).then(function(result){
        assert(false);
    }).catch(function(error){
        assert(error.code == gErrors.Failed.code);
    });

    for(let i = 0; i < 3; i++){
        conn.Request('Timeout', []).then(function(result){
            assert(false);
        }).catch(function(error){
            assert(error.code === JwRPC.Errors.Timeout.code);
        });
    }

    conn.Request('SoloTest', []).then(function(result){
        assert(true);
    }).catch(function(error){
        assert(false);
    });
    
    conn.Request('SoloTest', []).then(function(result){
        assert(false);
    }).catch(function(error){
        assert(error.code === JwRPC.Errors.RpcIsPending.code);
    });

    //reate -----------------
    conn.Request('Rate1Sec', []).then(function(result){
    }).catch(function(error){
        assert(false);
    });
    conn.Request('Rate1Sec', []).then(function(result){
        assert(false);
    }).catch(function(error){
        assert(error.code === JwRPC.Errors.PerRPCRateLimitReached.code);
    });
    setTimeout(function(){
        conn.Request('Rate1Sec', []).then(function(result){
        }).catch(function(error){
            console.log({error});
            assert(false);
        }); 
    }, 3000);

    //method not found -------------
    conn.Request('xxxxxxx', []).then(function(result){
    }).catch(function(error){
        assert(error.code === JwRPC.Errors.MethodNotFound.code);
    });
}


function ClientAfterConnect(conn){
    SharedAfterConnect(conn);

    conn.Notify('Hi', 'hi');
    conn.Request('Echo', {'message':'hello'}).then(function(result){
        assert(result.message === 'hello');
    }).catch(function(error){
        assert(error);
    });

}
function ServerAfterConnect(conn){
    SharedAfterConnect(conn);

    conn.Notify('NotiHi', 'hi');
    conn.Request('Echo', {'message':'hello'}).then(function(result){
        assert(result.message === 'hello');

    }).catch(function(error){
        assert(error);
    });
}
function RunClients(){
    const ws = new WebSocket(argv.url);
    ws.on('open', function(){
        console.log('connected.');
        ws.conn = new JwRPC(ws, gClientRPCs);
        try{
            ClientAfterConnect(ws.conn);
        }catch(exc){
            throw exc;
        }
        
    });

    
}
function RunServer(){
    const wss = new WebSocket.Server({ port: argv.port });
    wss.on('connection', function(ws){
        console.log('received new connection');

        ws.conn = new JwRPC(ws, gServerRPCs);
        try{
            ServerAfterConnect(ws.conn);
        }catch(exc){
            throw exc;
        }
        

        ws.on('message', function(message){
            console.log('message:', message);
            //this.conn.OnMessage(message);
        });
        ws.on('close', function(code, reason)
        {
            console.log('closed');
            //this.conn.KillAll();
        });

    });
    wss.on('listening', function(){
        console.log('listening');
    });
}
function Main(){
    console.log('--------------------------------------');

    if(argv.server){
        RunServer();
    }else{
        RunClients();
    }

    setInterval(function(){
        console.log('tick');
    }, 3000);
}
Main();