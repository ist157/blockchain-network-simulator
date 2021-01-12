#!/usr/bin/env node
require("util").inspect.defaultOptions.depth = null

let doubleLog = (f, st) => { // string
   console.log(st)
   require('fs').appendFileSync(f, st + '\n')
}
let EventEmitter = require('events')
class EventEmitterWithLog extends EventEmitter {
   emitWithLog(eventName, ...args) { // https://nodejs.org/api/events.html#events_emitter_emit_eventname_args
      console.log(`global event "${eventName}" fired`)
      return super.emit(eventName, ...args)
   }
}
let globalEmitter = new EventEmitterWithLog()

let sleep = async t => new Promise(resolve => setTimeout(resolve, t*1000))

// let hash = s => require('crypto').createHash('md5').update(s, 'utf8').digest('hex')
// let messageList = new Set()
// let alive = true
// let livenessList
let sha3 = s => require('crypto').createHash('sha3-512').update(s, 'utf8').digest('hex').slice(-4)

// blockchain
let blockchain = [] // position, parent, block, children
let Block = (parent, header) => ({
   position: (parent >= 0) ? blockchain[parent].position + 1 : 0,
   parent: parent,
   header: header,
   children: []
})
let lastBlockIndex = -1 // last block in the longest chain
let pushBlock = (parent, header) => {
   // console.log(parent, header)
   let checksum = header.slice(0,4)
   if ((parent == -1 && checksum == "9e1c") || (sha3(blockchain[parent].header) == checksum)) {
      if (parent >= 0) blockchain[parent].children.push(blockchain.length)
      blockchain.push(Block(parent, header))
      let index = blockchain.length - 1
      if (lastBlockIndex == -1 || blockchain[index].position > blockchain[lastBlockIndex].position) lastBlockIndex = index
      doubleLog(chainFile, `${index},${blockchain[index].position},${blockchain[index].header},${blockchain[index].parent}`)
      console.log(blockchain)
   }
}

let queue = []
let synchronized = false

let serverHost = process.argv[2]
let serverPort = process.argv[3]
let interarrival = parseInt(process.argv[4])
let hashPower = parseFloat(process.argv[5])
let flooded = parseInt(process.argv[6]) // 0 or 1
// let outputFile = `output-peer-${serverHost}-${serverPort}.txt`
// require('fs').openSync(outputFile, 'w') // initialize empty file
let genFile = `logs/gen-${interarrival}-${serverHost}-${serverPort}.txt`
require('fs').openSync(genFile, 'w')
let chainFile = `logs/chain-${interarrival}-${serverHost}-${serverPort}.txt`
require('fs').openSync(chainFile, 'w')

//////// initialize the server
let server = require('net').createServer().on('connection', socket => {
   socket.setEncoding('utf8')

   socket.on('data', message => {
      // if (alive) {
         // arr = message.split(':')
         // if (arr[0] == 'Liveness Request') {
         //    doubleLog(`(${arr[1]}) liveness request received - ${message}`) // only the server ports are chosen by us and are significant
         //    livenessReplyMessage = `Liveness Reply:${arr[1]}:${arr[2]}:${serverHost}`
         //    doubleLog(`(${arr[1]}) liveness reply sent - ${livenessReplyMessage}`)
         //    socket.write(livenessReplyMessage)
         // }
         
         // else if (!(messageList.has(hash(message)))) { // gossip
         //    messageList.add(hash(message))
         //    doubleLog(`(${arr[0]}) gossip message received - ${message}`)
         //    globalEmitter.emit('new gossip message received', message)
         // }
      // }

      if (message == "sync request") { // request for blockchain received, send longest chain
         let longestChain = []
         // console.log(blockchain)
         let i = lastBlockIndex
         for (var p = ((blockchain.length) ? blockchain[lastBlockIndex].position : -1); p >= 0; p--) {
            let entry = blockchain[i]
            // console.log(entry)
            longestChain.unshift(entry)
            i = entry.parent
         }
         let syncMsg = 'sync response'
         longestChain.forEach(entry => {
            syncMsg += `\n${entry.position}:${entry.header}`
         })
         // console.log(syncMsg)
         socket.write(syncMsg)
      }
      else { // block received through server socket
         queue.push(message)
         if (queue.length == 1) globalEmitter.emit("queue not empty anymore")
      }
      
   })

   globalEmitter.on('ready to transmit block', message => {
      socket.write(message)
      console.log('fired')
   })
})
globalEmitter.on('begin', () => server.listen(serverPort, serverHost))
server.on('listening', () => globalEmitter.emitWithLog('server ready')) // just converting other objects' events to globalEmitter's events to make the job easy

////////// randomizer for picking up seeds and peers
let getRandom = (arr, n) => {
   len = arr.length
   taken = new Array(len)
   n = Math.min(n, arr.length)
   var result = new Array(n)
   while (n--) {
      let x = Math.floor(Math.random() * len)
      result[n] = arr[x in taken ? taken[x] : x];
      taken[x] = --len in taken ? taken[len] : len;
   }
   return result;
}

////////// get the seed details from the config
let fullSeedList = require('fs').readFileSync('config.csv', 'utf8')
   .trim()
   .split('\n')
   .map(x => x.split(','))
   .map(function(x) {
      return {
         host: x[0],
         port: x[1]
      }
   })
let seedList = getRandom(fullSeedList, Math.floor(fullSeedList.length/2)+1)

////////// seed connections
let fullPeerList = []
let receivedItemsFromSeeds = 0
let seedSocketList = []
let removeDuplicates = l => {
   let map = {}
   let newArray = []
   l.forEach(x => {
      if (!map[JSON.stringify(x)]) {
         map[JSON.stringify(x)] = true
         newArray.push(x)
      }
   })
   return newArray
}
let peerList = []
globalEmitter.on('received from all seeds', () => {
   peerList = getRandom(removeDuplicates(fullPeerList), 4)
   globalEmitter.emitWithLog('peerList filled')
})
globalEmitter.on('server ready', () => {
   seedList.forEach( (seedInfo, i) => {
      let clientSocket = require('net').connect(seedInfo.port, seedInfo.host)
      seedSocketList[i] = clientSocket
      clientSocket.setEncoding('utf8')
      clientSocket.on('connect', function() {
         clientSocket.write(`Registration:${serverHost}:${serverPort}`)
      })
      clientSocket.on('data', message => {
         fullPeerList = fullPeerList.concat(JSON.parse(message))
         receivedItemsFromSeeds++
         if (receivedItemsFromSeeds == seedList.length) globalEmitter.emitWithLog('received from all seeds')
      })
   })
})

let randomVar = require('random').exponential()()

if (!flooded) {
   // block generator
   let generator = async () => {
      let recentLength = blockchain.length
      let sleepTime = interarrival * (randomVar / hashPower)
      console.log(`sleeping for ${sleepTime} seconds`)
      await sleep(sleepTime)
      // while (queue.length) await sleep(1)
      if (recentLength == blockchain.length) {
         let message = ((blockchain.length) ? sha3(blockchain[lastBlockIndex].header) : "9e1c") + '0000' + Math.floor(Date.now()/1000)
         let l = lastBlockIndex
         // console.log(l, message)
         pushBlock(l, message)
         globalEmitter.emit('ready to transmit block', message)
         doubleLog(genFile, `${blockchain[lastBlockIndex].position},${message.slice(8)}`)
      }
      // else return
      // generator()
   }
   globalEmitter.on('synchronized', generator)
   globalEmitter.on('ready to transmit block', generator)
}

// queue handler
let queue_handler = async () => {
   loop1:
   while (queue.length) {
      let message = queue.shift()
      if (Math.abs(Math.floor(Date.now()/1000) - parseInt(message.slice(8))) < 60*60) {
         for (var i = 0; i < blockchain.length; i++) {
            if (sha3(blockchain[i].header) == message.slice(0,4)) {
               for (var j = 0; j < blockchain[i].children.length; j++) {
                  if (blockchain[blockchain[i].children[j]].header == message) continue loop1
               }
               pushBlock(i, message)
               globalEmitter.emit('ready to transmit block', message)
               randomVar = require('random').exponential()()
               break
            }
         }
      }
   }
}
globalEmitter.on("queue not empty anymore", queue_handler)

//////// peer connections
globalEmitter.on('peerList filled', () => {
   // livenessList = new Array(peerList.length).fill(0)
   if (!peerList.length) {
      synchronized = true
      globalEmitter.emit('synchronized')
      console.log('synchronized')
      randomVar = 0.1
      console.log(blockchain)
   }
   else {
      peerList.forEach( (peerInfo, i) => {
         let clientSocket = require('net').connect(peerInfo.port, peerInfo.host)
         clientSocket.setEncoding('utf8')
   
         // clientSocket.on('connect', async () => { // liveness request
         //    while (true && alive) {
         //       let timestamp = Math.floor(Date.now()/1000)
         //       if (livenessList[i] < -3) {
         //          seedSocketList.forEach( (socket, i) => { // dead node
         //             let deadNodeMessage = `Dead Node:${peerInfo.host}:${peerInfo.port}:${timestamp}:${serverHost}`
         //             socket.write(deadNodeMessage)
         //             doubleLog(`(${timestamp}) dead node message sent to ${seedList[i].host},${seedList[i].port} - ${deadNodeMessage}`)
         //             clientSocket.end()
         //          })
         //          break
         //       }
         //       livenessRequestMessage = `Liveness Request:${timestamp}:${serverHost}`
         //       clientSocket.write(livenessRequestMessage)
         //       livenessList[i] -= 1
         //       doubleLog(`(${timestamp}) liveness request sent to ${peerInfo.host},${peerInfo.port} - ${livenessRequestMessage} (${livenessList})`)
         //       await sleep(13)
         //    }
         // })
   
         // clientSocket.on('connect', async () => { // generate gossip message
         //    let messageID = 0
         //    while (messageID++ < 10 && alive) {
         //       let timestamp = Math.floor(Date.now()/1000)
         //       gossipMessage = `${timestamp}:${serverHost}:message_${messageID}`
         //       doubleLog(`(${timestamp}) gossip message sent to ${peerInfo.host},${peerInfo.port} - ${gossipMessage}`)
         //       clientSocket.write(gossipMessage)
         //       await sleep(5)
         //    }
         // })
         clientSocket.on('connect', async () => { // request for blocks
            clientSocket.write("sync request")
         })
         // clientSocket.on('data', message => { // liveness reply
         //    if (alive) {
         //       arr = message.split(':')
         //       if (arr[0] == "Liveness Reply") {
         //          livenessList[i] += 1
         //          console.log(`(${arr[1]}) liveness reply received from ${peerInfo.host},${peerInfo.port} - ${livenessRequestMessage} (${livenessList})`)
         //       }
         //    }
         // })
   
         clientSocket.on('data', message => {
            // console.log(message)
            if (!synchronized && message.includes("sync response")) {
               arr = message.split('\n')
               for (var i = 1; i < arr.length; i++) {
                  syncMsg = arr[i].split(':')
                  pushBlock(syncMsg[0]-1, syncMsg[1]) // 0: sync response
               }
               synchronized = true
               globalEmitter.emit('synchronized')
               console.log('synchronized')
               console.log(blockchain)
            }
            else if (synchronized && !message.includes("sync response")) {
               queue.push(message)
               if (queue.length == 1) globalEmitter.emit("queue not empty anymore")
            }
         })
   
         // globalEmitter.on('new gossip message received', gossipMessage => { // relay gossip message
         //    if (alive) {
         //       doubleLog(`(${arr[0]}) gossip message relayed to ${peerInfo.host},${peerInfo.port} - ${gossipMessage}`)
         //       clientSocket.write(gossipMessage)
         //    }
         // })
         globalEmitter.on('ready to transmit block', message => {
            clientSocket.write(message)
         })
      })
   }
})

// // adversary
// if (adversary) {
//    let targets = require('fs').readFileSync('targets.csv', 'utf8')
//       .trim()
//       .split('\n')
//       .map(x => x.split(','))
//       .map(function(x) {
//          return {
//             host: x[0],
//             port: x[1]
//          }
//       })
//    targets.forEach(peerInfo => {
//       let clientSocket = require('net').connect(peerInfo.port, peerInfo.host)
//       clientSocket.setEncoding('utf8')
   
//       clientSocket.on('connect', async () => { // spam with invalid blocks
//          while (true) {
//             clientSocket.write("000000000")
//             // await sleep(0.001)
//          }
//       })
//    })
// }

// ctrl+c handler
// process.once('SIGINT', () => {
//    alive = false
//    console.log('interrupt - the node is now dead')
//    process.on('SIGINT', () => process.exit())
// })

////// after all the listeners are in place, begin the actual process
globalEmitter.emit('begin')