
// https://www.videosdk.live/developer-hub/webrtc/webrtc-signaling-server
// Partly from Grok

// @ts-check
const VERSION = "0.0.1";
logInfo(`signaling-server.mjs version ${VERSION} loaded`);

const msStarting = Date.now();
// console.time("startup signaling server");

import { WebSocketServer } from 'ws';
import chalk from 'chalk';
import os from 'os';

const PORT = 3000;
// const HOSTNAME = process.env.HOSTNAME || os.hostname() || 'localhost';
// const HOSTNAME = process.env.HOSTNAME || 'localhost';
const HOSTNAME = 'localhost';

function logInfo(message) { console.log(chalk.bgBlue.white(` ${message} `)); }
function logWarning(message) { console.log(chalk.bgYellow.black(` ${message} `)); }
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

let wss;
try {
  // const wss = new WebSocketServer({ port: PORT });
  wss = new WebSocketServer({ port: PORT });

  wss.on("connection", (ws) => {
    let room;
    function logMessage(typeMsg, message) { console.log(chalk.bgGreen.white(` ws.on got message type "${typeMsg}"`), message); }
    // const ws = event.target;
    logInfo('New client connected'); // , { ws });

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
      const clientId = objMessage.clientId;
      logMessage(typeMessage, txtMessage);
      switch (typeMessage) {
        case "client-init":
          handleFirstMessage();
          break;
        case "candidate":
        case "answer":
          handleCandidateAndAnswerMessage();
          break;
        case "offer":
          // throw new Error("offer message support not implemented yet");
          console.log({ mapRoomClients });
          console.log({ room });
          const setRoom = mapRoomClients.get(room);
          const numClients = setRoom.size;
          if (numClients > 1) {
            logInfo(`sending offer to clieants in room "${room}"`);
            setRoom.forEach((client) => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                try {
                  client.send(JSON.stringify({
                    type: 'offer',
                    // offer: data.offer,
                    offer: objMessage.offer,
                    // from: ws.customData.id
                    from: clientId,
                  }));
                } catch (error) {
                  console.error('Send error:', error.message);
                }
              }
            });
          }
          break;
        default:
          throw Error(`Unrecognized message type: "${typeMessage}"`);
      }
      return;
      function handleFirstMessage() {
        room = objMessage.room;
        logInfo(`Handling first message, room: "${room}"`);
        wmapClientFirstMsg.set(ws, txtMessage);
        wmapClientRoom.set(ws, room);
        if (!mapRoomClients.has(room)) {
          mapRoomClients.set(room, new Set());
        }
        const setRoom = mapRoomClients.get(room);
        const numClients = setRoom.size;
        console.log('Number of clients in room:', numClients);
        setRoom.add(ws);
        console.log({ mapRoomClients });
        return;

        if (!wmapClientFirstMsg.has(ws)) {
          wmapClientFirstMsg.set(ws, txtMessage);
          const jsonMessage = JSON.parse(txtMessage);
          const room = jsonMessage.room;
          wmapClientRoom.set(ws, room);
          if (!mapRoomClients.has(room)) {
            mapRoomClients.set(room, new Set());
          }

          const setRoom = mapRoomClients.get(room);
          const numClients = setRoom.size;
          console.log('Number of clients in room:', numClients);
          setRoom.forEach((client) => {
            const clientFirstMsg = wmapClientFirstMsg.get(client);
            console.log('Client in room:', clientFirstMsg, client.readyState);
            client.send(txtMessage);
          });
          setRoom.add(ws);
          return;
        }
      }
      function handleCandidateAndAnswerMessage() {
      }
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          try {
            client.send(event.data);
          } catch (error) {
            logError("Send error: ", error);
          }
        }
      });
    });

    // ws.on("message", (event) => { throw new Error("on message 2"); });
    ws.on("error", (event) => logError('Client error:', event.message));
    ws.on("close", () => {
      logInfo('Got "close" event ');
      const room = wmapClientRoom.get(ws);
      const showRoom = room || "(Not set)";
      logInfo(`Client disconnected, room: ${showRoom}`);
      wmapClientFirstMsg.delete(ws);
      wmapClientRoom.delete(ws);
      if (room) { mapRoomClients.get(room).delete(ws); }
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
  logWarning('Initiating server shutdown');
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
  logWarning(`Will close server after ${seconds} seconds)`);
  setTimeout(() => {
    logInfo(`Closing server now (already waited ${seconds} seconds)`);
    closeServer();
  }, 1000 * seconds);
}
// _closeServerWithDelay(15);