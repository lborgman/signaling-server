
// https://www.videosdk.live/developer-hub/webrtc/webrtc-signaling-server
// Partly from Grok

// @ts-check
const VERSION = "0.0.02";
logInfo(`signaling-server.mjs version ${VERSION} loaded`);

const msStarting = Date.now();
// console.time("startup signaling server");

import { WebSocketServer } from 'ws';
import chalk from 'chalk';
// import os from 'os';

// const pendingOffers = new Map(); // Store offers until peers connect
const PORT = 3000;

// console.log(process);
// console.log(process.env);
// console.log(process.env.HOSTNAME);
// const HOSTNAME = process.env.HOSTNAME || os.hostname() || 'localhost';
const HOSTNAME = process.env.HOSTNAME || 'localhost';
// const HOSTNAME = 'localhost';

let numServerClients = 0;

function logInfo(message) { console.log(chalk.bgBlue.white(` INFO ${message} `)); }
function logImportant(message) { console.log(chalk.bgMagenta.black(` IMPORTANT ${message} `)); }
/**
 * @param {string} where 
 * @param {Error|string} error 
 */
function logError(where, error, ...rest) {
  console.error(error, ...rest);
  const message = error instanceof Error ? error.message : error;
  console.log(chalk.bgRed.yellow(` ${where}: ${message} `));
}


const wmapClientFirstMsg = new WeakMap();
const wmapClientRoom = new WeakMap();
const mapRoomClients = new Map(); // room -> Set of clients
const mapRoomOffers = new Map(); // room -> Set of offers

let wss;
try {
  // const wss = new WebSocketServer({ port: PORT });
  wss = new WebSocketServer({ port: PORT });

  wss.on("connection", (ws) => {
    let room;
    let myId;
    let clientNum;
    function logMessage(typeMsg, txt) {
      console.log(chalk.bgGreen.white(` ws.on got message type "${typeMsg}"`), txt);
    }
    function logClientMessage(typeMsg, clientNum, clientId) {
      // Special colors for first two for debugging
      switch (clientNum) {
        case 1:
          console.log(chalk.bgGreen.black(` ws.on got message type "${typeMsg}", clientNum:${clientNum}, id:${clientId}`));
          break;
        case 2:
          console.log(chalk.bgYellow.black(` ws.on got message type "${typeMsg}", clientNum:${clientNum}, id:${clientId}`));
          break;
        default:
          // const msg = `Unrecognized clientNum: ${clientNum}`;
          // console.error(msg);
          // logError(msg, "");
          console.log(chalk.bgCyan.black(` ws.on got message type "${typeMsg}", num:${clientNum}, id:${clientId}`));
      }
    }
    // const ws = event.target;
    logImportant('New client connected'); // , { ws });

    ws.on("message", (event) => {
      const txtMessage = event.toString("utf8");
      let objMessage;
      try {
        objMessage = JSON.parse(txtMessage);
      } catch (error) {
        logError(`Invalid JSON message: ${txtMessage}`, error, txtMessage);
        ws.close(1000, 'Invalid JSON message');
        return;
      }

      // The text parameter is evailable in the close event as event.reason
      // The number parameter is probable ms delay before closing the connection (not sure, not documented)
      // ws.close(1000, 'TESTING CLOSE'); 
      // ws.terminate does not seem to take a parameter
      // ws.terminate('TESTING TERMINATE (IGNORED)');

      const typeMessage = objMessage.type;
      const clientId = objMessage.myId;
      let showNum = clientNum || numServerClients + 1
      logClientMessage(typeMessage, showNum, myId);
      // logMessage(typeMessage, 
      switch (typeMessage) {
        case "client-init":
          console.log(txtMessage);
          handleFirstMessage();
          /*
          for (const [fromClient, roomOffer] of pendingOffers) {
            // console.log("pendingOffers", { room });
            if (roomOffer.room == room) {
              const jsonFirst = wmapClientFirstMsg.get(fromClient);
              console.log({ jsonFirst });
              const objFirst = JSON.parse(jsonFirst);
              const fromId = objFirst.myId;
              console.log({ fromId });
              const toClient = ws;
              forwardOffer(roomOffer.offer, fromId, toClient);
            }
          }
          */

          break;
        case "candidate":
        case "answer":
          handleCandidateAndAnswerMessage();
          break;
        case "offer":
          // pendingOffers.set(ws, { room, offer: objMessage.offer });
          const weakmapOffers = mapRoomOffers.get(room);
          weakmapOffers.set(ws, objMessage.offer);
          console.log(`Saved offer in room "${room}"`);
          // const numOffers = weakmapOffers.size;
          const setClients = mapRoomClients.get(room);
          const numClients = setClients.size;
          switch (numClients) {
            case 1:
              break;
            case 2:
              logInfo(`sending offer to clieants in room "${room}"`);
              objMessage.isInitiator = true;
              const arrClients = [...setClients];
              for (const i of [0, 1]) {
                const iFrom = i % 2;
                const iTo = (i + 1) % 2;
                console.log(typeof i, { i, iFrom, iTo });
                // continue;
                const wsFrom = arrClients[iFrom];
                const wsTo = arrClients[iTo];
                const offer = weakmapOffers[wsFrom];
                // forwardOffer(offer, wsFrom, wsTo)
                logImportant("forWardOffer2");
                const jsonFromFirst = wmapClientFirstMsg.get(wsFrom);
                const fromFirst = JSON.parse(jsonFromFirst);
                const from = fromFirst.myId;
                const objForwardOffer = {
                  type: 'offer',
                  offer: offer,
                  from,
                  isInitiator: (i == 0),
                };
                try {
                  wsTo.send(JSON.stringify(objForwardOffer));
                } catch (error) {
                  console.error('Send error:', error.message);
                }
              }
              const secClose = 15;
              console.log(`Will close room ${room} in ${secClose} seconds...`);
              setTimeout(() => closeRoom(room), secClose * 1000);
              /*
              setClients.forEach((toClient) => {
                if (toClient !== ws && toClient.readyState === WebSocket.OPEN) {
                  forwardOffer(objMessage.offer, clientId, toClient);
                  objMessage.isInitiator = false;
                }
              });
              */
              break;
            default:
              throw Error(`There were ${numClients} in the room "${room}"`);
          }
          return;
        default:
          throw Error(`Unrecognized message type: "${typeMessage}"`);
      }
      return;
      function handleFirstMessage() {
        clientNum = ++numServerClients;
        room = objMessage.room;
        myId = objMessage.myId;
        logInfo(`Handling first message, room: "${room}, myId: ${myId}", clientNum: ${clientNum}`);
        // console.log("objMessage", objMessage);
        wmapClientFirstMsg.set(ws, txtMessage);
        wmapClientRoom.set(ws, room);
        if (!mapRoomClients.has(room)) { mapRoomClients.set(room, new Set()); }
        if (!mapRoomOffers.has(room)) { mapRoomOffers.set(room, new WeakMap()); }
        const clientsInRoom = getNumRoomClients(room);
        // console.log(`before: Number of clients in room: ${clientsInRoom}`);
        if (clientsInRoom > 1) {
          console.log(`Room "${room} has already 2 clients`);
          ws.close(1000, "Room is full");
        }
        const setRoom = mapRoomClients.get(room);
        setRoom.add(ws);
        // console.log(`after: Number of clients in room: ${getNumRoomClients(room)}`);
      }
      function handleCandidateAndAnswerMessage() {
        const room = wmapClientRoom.get(ws);
        const setRoom = mapRoomClients.get(room);
        const numClients = setRoom.size;
        console.log('handleCandidateAndAnswerMessage: Number of clients in room:', numClients);
        setRoom.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            try {
              client.send(txtMessage);
            } catch (error) {
              console.error('Send error:', error.message);
            }
          }
        });
      }
      /*
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          try {
            client.send(event.data);
          } catch (error) {
            logError("Send error: ", error);
          }
        }
      });
      */
    });

    // ws.on("message", (event) => { throw new Error("on message 2"); });
    ws.on("error", (event) => logError('Client error:', event.message));
    ws.on("close", () => {
      logImportant('Got "close" event ');
      closeClient(ws);
    });
  });

  wss.on("error", (event) => console.error('Server error:', event.message));

  const msEnding = Date.now();
  const msDiff = msEnding - msStarting;
  // console.timeEnd("startup signaling server");
  logInfo(`Signaling server started (${msDiff}ms) on ws://${HOSTNAME}:${PORT}`);
} catch (error) {
  console.error(error);
  logError("Server startup error:", error.message);
}

function closeServer() {
  logImportant('Initiating server shutdown');
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.close(1000, 'Server shutting down');
    }
  });
  wss.close((error) => {
    if (error) {
      logError("Server close error:", error.message);
    } else {
      logInfo("Server closed successfully.");
    }
  });
}
function _closeServerWithDelay(seconds) {
  logImportant(`Will close server after ${seconds} seconds)`);
  setTimeout(() => {
    logInfo(`Closing server now (already waited ${seconds} seconds)`);
    closeServer();
  }, 1000 * seconds);
}
// _closeServerWithDelay(15);

function forwardOffer(offer, fromClientId, toClient) {
  logImportant("forWardOffer from " + fromClientId);
  const objForwardOffer = {
    type: 'offer',
    offer: offer,
    // from: clientId,
    from: fromClientId,
  };
  try {
    toClient.send(JSON.stringify(objForwardOffer));
  } catch (error) {
    console.error('Send error:', error.message);
  }
}

function getNumRoomClients(room) {
  // FIX-ME: setRoom == undefined when room has no clients, why??
  // console.log("getNumRoomClients", { mapRoomClients });
  const setRoom = mapRoomClients.get(room);
  const numRoomClients = setRoom?.size;
  // console.log({ numRoomClients });
  // console.log({ mapRoomClients });
  return numRoomClients;
}

function closeRoom(room) {
  const setRoom = mapRoomClients.get(room);
  const size = getNumRoomClients(room);
  logImportant(`Closing room "${room}, size ${size}`);
  console.log("... changed my mind, not closing room"); return;
  setRoom.forEach(client => {
    closeClient(client);
  });
}
function closeClient(ws) {
  const room = wmapClientRoom.get(ws);
  const showRoom = room || "(Not set)";
  const numInRoom = room ? getNumRoomClients(room) : "(Room not found)";
  logInfo(`Client disconnecting, room: ${showRoom}, num in room: ${numInRoom}`);
  wmapClientFirstMsg.delete(ws);
  wmapClientRoom.delete(ws);
  if (room) { mapRoomClients.get(room).delete(ws); }
  // FIX-ME:
  // pendingOffers.delete(ws);
}
