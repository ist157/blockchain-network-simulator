#!/usr/bin/env node
require("util").inspect.defaultOptions.depth = null

let serverHost = process.argv[2]
let serverPort = process.argv[3]
let outputFile = `output-seed-${serverHost}-${serverPort}.txt`
// require('fs').openSync(outputFile, 'w') // initialize empty file

let peerList = []
let peerInfoFunc = (a, p) => ({
   host: a,
   port: p
})
let addPeer = (a, p) => peerList.push(peerInfoFunc(a, p))
let removePeer = function(a, p) {
   peerList.forEach( (v, i) => {
      if (v.host == a && v.port == p) peerList.splice(i, 1)
   })
}

let doubleLog = st => { // string
   console.log(st)
   require('fs').appendFileSync(outputFile, st + '\n')
}

let server = require('net').createServer().on('connection', socket => {
      socket.setEncoding('utf8')
      socket.on('data', message => {
         arr = message.split(":")
         if (arr[0] == "Registration") {
            // doubleLog(`registration request received from ${arr[1]},${arr[2]} - ${message}`)
            socket.write(JSON.stringify(peerList) + '\n') // send peer list
            addPeer(arr[1], Number(arr[2]))
         }
         else if (arr[0] == "Dead Node") {
            // doubleLog(`(${arr[3]}) dead node message received - ${message}`)
            removePeer(arr[1], Number(arr[2]))
         }
         console.log(peerList)
      })
   }
)

// event handlers/listeners are in place, begin the process
server.listen(serverPort, serverHost)