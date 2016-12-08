"use strict";

const dgram = require('dgram');
const ip = require('ip');
const net = require("net");
const context = require("../core/datamodel/thingContext.js")
const colleages = require("../core/datamodel/knownThings.js");
const lanUtils = require("./lanUtils.js")

var strGreeting;
var meetingsPort; 
var contextServerPort;
var thingContext;
var addresses = [];
var subnet;
var broadcastAddress;
var bufferGreeting;
var hbPort = "9898";

//first called from core
exports.init = function(interPort,greetings,greetingsPort){
    console.log("Lan discovery initialized")
    contextServerPort = interPort;
    meetingsPort = greetingsPort;
    strGreeting = greetings;
    bufferGreeting = new Buffer(strGreeting);
    addresses = lanUtils.getAddresses();
    subnet = ip.subnet(addresses[0].addr, addresses[0].netmask);
    broadcastAddress = subnet.broadcastAddress;
    initMeetingsServer();
    initHeartBeatServer();
    startCheckHeartBeat();
}

exports.sendGreetings = function(){
    var client = dgram.createSocket("udp4");

    client.bind({address: addresses[0].addr});
    client.on("listening", function () {
        client.setBroadcast(true);
        console.log("-----------------");
        console.log("sending greetings bc addr "+broadcastAddress);
        client.send(bufferGreeting, 0, bufferGreeting.length, meetingsPort, broadcastAddress, function(err, bytes) {
            console.log("closing greetings")
        });
    });
}

//private

//server listening for new things
function initMeetingsServer(){
    var server = dgram.createSocket("udp4");
    server.bind(meetingsPort,function(){
        console.log("Greetings Server bound")
    });
    server.on("message",(msg, source) => {
        //dont let to meet yourself
        console.log(`test addr ${source.address}:${source.port}`);
        if(source.address!=addresses[0].addr && msg.toString()===strGreeting){
//        if(msg.toString()===strGreeting){
            console.log(`server got: ${msg} from ${source.address}:${source.port}`);
            sendAndGetContext(source.address);
        }
    });
}
function initHeartBeatServer(){
    var heartBeatServer = net.createServer((socket)=>{
        socket.on('data', function(data) {
            thingContext = context.thingContext.getInstance().getContext();
            socket.write(JSON.stringify(thingContext));
            socket.pipe(socket);
            socket.end();
        });
    });
    heartBeatServer.listen(hbPort,()=>{
        console.log("HeartBeat Server bound");
    });
}

//interchange of contexts
//sends our context to the contextserver of the thing in addr and get its context from the reply
function sendAndGetContext(addr){
    //try to connect  to the context server of the thing we have just meet
    var client = net.connect({port: contextServerPort,host:addr}, () => {
        // 'connect' listener
        console.log('connected to server!');
        //we send our own context
        thingContext = context.thingContext.getInstance().getContext();
        client.write(JSON.stringify(thingContext));
    });
    client.on('data', (data) => {
        console.log("Thing received in LAN client");
        console.log(JSON.parse(data));
        console.log("----------------------------");
        //we receive its context
        colleages.list.getInstance().saveOrUpdateThing(JSON.parse(data));
        client.end();
    });
    client.on('end', () => {
        console.log('disconnected from server');
    });
}

//heartbeat
function startCheckHeartBeat(){
    setInterval(function(){
        var list =colleages.list.getInstance().getAll()
        for(var pos in list){
            console.log("start heartbeat "+list[pos])
            sendHeartBeat(list[pos])
            console.log("end heartbeat")
        }
    },10000)
}

var sendHeartBeat = function(destinationContext){
    //send to its heartbeat server
    var client = net.connect({port: hbPort,host:destinationContext.addr}, () => {
        // 'connect' listener
        console.log('connected to server!');
        //we send our own context
        thingContext = context.thingContext.getInstance().getContext();
        client.write("Are u alive??");
    });
    client.on('data', (data) => {
        console.log(JSON.parse(data));
        console.log("----------------------------");
        //we receive its context
        colleages.list.getInstance().saveOrUpdateThing(JSON.parse(data));
        client.end();
    });
    client.on('end', () => {
        console.log('disconnected from server');
        client.close()
        client.destroy()
    });
    client.on("error",()=>{
        console.log("Error on heartbeat");
        colleages.list.getInstance().delete(destinationContext.id)
    });
}
