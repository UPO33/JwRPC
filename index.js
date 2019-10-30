'use strict';

//
const assert = require('assert');

const Errors = {
    InvalidInput : {code:1, message:"invalid input"},
    MethodNotFound : {code:2, message:"method not found"},
    RpcIsPending : {code:3, message:"rpc is pending call"},
    PerRPCRateLimitReached : {code:4, message:"per rpc limit reached"},
    InvalidSocket : {code:5, message:"invalid socket"},
    Timeout : {code:6, message:"timeout"},
    ConnectionClosed : {code:7, message:'connection closed'},
};

//state for each callback (a defined request or notification)
class MethodState{
    constructor(func, rpcInfo){
        this.func = func;//the function that will be called when we receive the request or notification
        this.rpcInfo = rpcInfo;
        this.callCount = 0;//number of times the funtion got called in a period
        this.pendinCall = false; //its being called at th moment?
        this.lastResetTime = 0;
    }
}




/*
hold the basic infomation about a Request or Method.
*/
class MethodInfo{
    /** 
    @param {function(JwRPC, any, function)} callback    - function to be called.
    @param {boolean} bSolo        - if true, only one instance would be in process. this could be useful if you have some concurancy problems.
    @param {number} limitRate     - how many times it could be called in 'limitPeriod' seconds. if exceeds peer receives {Errors.PerRPCRateLimitReached}
    @param {number} limitPeriod   - how long is the period. in seconds
    */
    constructor(callback, bSolo = false, limitRate = 100, limitPeriod=1){
        this.callback = callback;
        this.bSolo = bSolo;
        this.limitRate = limitRate;
        this.limitPeriod = limitPeriod;
    }
}


/*
main connection class.
*/
class JwRPC {
    /**
     * 
     * @param {WebSocket} ws                           - the websocket connection
     * @param {Object.<string, MethodInfo>} methods    - all the methods to be registered.
     */
    constructor(ws, methods){
        this.ws = ws;
        this.idCounter = 0;
        //requests waiting for respond
        this.requests = {};
        //how long we wait for responds to arrive. in seconds
        this.requestTimeout = 30;
        //
        this.overallCallCount = 0;

        //make the new rpc states
        this.rpcStates = {};
        for(let rpcName in methods){
            const rpcItem = methods[rpcName];
            assert(rpcItem);
            this.rpcStates[rpcName] = new MethodState(rpcItem.callback, rpcItem);
        }
        
        this.ws.on('message', (data) => { this.OnMessage(data); });
        this.ws.on('close', (code, reason) => { this.Destroy(Errors.ConnectionClosed); } );

        this.limitRateInterval = setInterval(this.AdjustLimitRate.bind(this), 2000);
    }
    AdjustLimitRate(){
        const curTime = Date.now();

        for(const rpcName in this.rpcStates){
            const rpcState = this.rpcStates[rpcName];
            const elapsed = curTime - rpcState.lastResetTime;
            if(elapsed > (rpcState.rpcInfo.limitPeriod * 1000)){
                //if(rpcState.callCount !== 0)
                //    console.log(`rate limit cleared for ${rpcName}`);
                rpcState.callCount = 0;
                rpcState.lastResetTime = curTime;
            }
        }
    }
    OnMessage(data){
        try{
            let payload = JSON.parse(data);

            if(payload.method !== undefined && payload.params !== undefined){
                this.OnRequestBase(payload);
            }
            else if(payload.result !== undefined || payload.error !== undefined){
                this.OnRespond(payload);
            }
            else {
                this.OnInvalidMessage(Errors.InvalidInput);
            }

        }catch(exc){
            this.OnInvalidMessage(exc);
        }
    }
    OnInvalidMessage(){

    }
    SendMethodNotFound(request){
        this.ws.send(JSON.stringify({
            'id' : request.id,
            'error' :  Errors.MethodNotFound,
        }), (err)=>{

        });
    }
    //this is called when we receive a request or notifification
    OnRequestBase(request){
        const rpcState = this.rpcStates[request.method];
        if(!rpcState){
            this.SendMethodNotFound(request);
            return;
        }
        
        this.OnRequest_CallbakMode(request, rpcState, rpcState.rpcInfo);
    }
    /*
    OnRequest_AsynMode(json, rpc){
        rpc(this, json.params).then((result)=>{
            try{
                let finalData = { 'id' : json.id, 'result': result };
                this.ws.send(JSON.stringify(finalData));
            }catch(exc){}
        }).catch((err)=>{
            let finalData = { 'id' : json.id, 'error': err };
            this.ws.send(JSON.stringify(finalData));
        });
    }*/
    OnRequest_CallbakMode(request, rpcState, rpcInfo){
        const bRequest = request.id !== undefined;

        const failCallback = (error)=>{
            if(!bRequest)return;

            try{
                this.ws.send(JSON.stringify({ 'id' : request.id, error}));
            }catch(exc){
            }
        }
        
        //if(!rpcInfo.bHandshake && !this.confirmed){
        //    return failCallback(gErrors.NotConfirmed);
        //}

        if(rpcInfo.bSolo && rpcState.pendinCall){
            return failCallback(Errors.RpcIsPending);
        }

        if(rpcState.callCount >= rpcInfo.limitRate){
            return failCallback(Errors.PerRPCRateLimitReached);
        }

        rpcState.pendinCall = true;
        rpcState.callCount++;

         if(!bRequest) { //if its notification we send an empty function as callback
            const notifyCallback =  (error, result) => { rpcState.pendinCall = false;  };
            rpcState.func(this, request.params, notifyCallback, rpcState);

         } else { //otherwise its request and callback will send either error or result

            const requestCallback = (error, result)=>{
                rpcState.pendinCall = false;
                //try{
                    let respond = { 'id' : request.id};
                    if(error){
                        respond.error = error;
                    } else {
                        respond.result = result;
                    }
                    this.ws.send(JSON.stringify(respond));
    
                //}catch(exc){
                //    if(this.debugPrint){
                //        console.log('exception at OnRequest_CallbakMode:', exc);
                //    }
                //}
            }

            rpcState.func(this, request.params, requestCallback, rpcState);
        }
    }

    //this is called when we receive a respond
    OnRespond(json){
        let req = this.requests[json.id];
        if(req === undefined){
            //if(this.debugPrint){
            //    console.log(`matching request not found for id:${json.id}`);
            //}
            return;
        }
        
        clearTimeout(req.timeoutHandle);
        delete this.requests[req.id];

        if(json.result !== undefined){ //its successful result?
            req.resolve(json.result);
        }else if(json.error !== undefined){ //its error?
            req.reject(json.error);
        }

    }
    /** 
    send a notification to the peer. notification is one way there is no respond and callback for it.
    @param {string} method 
    @param {any} params
    **/
    Notify(method, params){
        //#TODO do we need try catch here?
        this.ws.send(JSON.stringify({method, params}));
    }
    /** 
    send a request to the peer, the return value is a promise. any error is caught by 'catch'
    @param {string}  method
    @param {any} params
    **/
    Request(method, params){
        return new Promise((resolve, reject) => {
        
            if(!this.ws){
                reject(Errors.InvalidSocket);
                return;
            };
            let finalData = {
                'method' : method,
                'params' : params,
                'id' : this.GenId(),
            };

            //#TODO how to check the connection ?
            this.ws.send(JSON.stringify(finalData), (err)=> {

            });

            let req =  {
                'id' : finalData.id,
                'method' : method,
                'resolve' : resolve,
                'reject' : reject,
                //timeout for request
                'timeoutHandle' : setTimeout(()=> {
                    delete this.requests[finalData.id];
                    reject(Errors.Timeout);
                    
                }, this.requestTimeout * 1000),
            };
            
            this.requests[finalData.id] = req;
            
        });
    }
    GenId(){
        this.idCounter = (this.idCounter + 1) % 0xFFffFFff;
        return this.idCounter.toString(36);
    }
    //destroy this connection. rejects all pending requests
    Destroy(reason){
        
        for(let property in this.requests){
            let req = this.requests[property];
            if(req){
                clearTimeout(req.timeoutHandle);
                req.reject(reason);
            }
        }

        this.requests = {};
        //this.ws = null;
        clearInterval(this.limitRateInterval);
    }


}

JwRPC.MethodInfo = MethodInfo;
JwRPC.MethodState = MethodState;
JwRPC.Errors = Errors;

module.exports = JwRPC;