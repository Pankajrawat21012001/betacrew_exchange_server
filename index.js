const net = require('net');
const fs = require('fs');

// Store received packets
const receivedPackets = new Map();
let missedSequences = new Set();
let lastSequenceNumber = -1;

// Connect to the server
const client = new net.Socket();
client.connect(3000, '127.0.0.1', () => {
  console.log('Connected to server');
  client.write(Buffer.from([1, 0])); // Request all packets
});

// Handle incoming data
client.on('data', (data) => {
  while (data.length) {
    const packet = {};
    packet.symbol = data.toString('ascii', 0, 4);
    packet.buysellindicator = data.toString('ascii', 4, 5);
    packet.quantity = data.readInt32BE(5);
    packet.price = data.readInt32BE(9);
    packet.packetSequence = data.readInt32BE(13);

    receivedPackets.set(packet.packetSequence, packet);
    if (packet.packetSequence > lastSequenceNumber) {
      lastSequenceNumber = packet.packetSequence;
    }
    data = data.slice(17);
  }
});

// Handle connection end
client.on('end', () => {
  console.log('Disconnected from server');

  // Check for missing sequences
  for (let i = 1; i < lastSequenceNumber; i++) {
    if (!receivedPackets.has(i)) {
      missedSequences.add(i);
    }
  }

  // Request missed packets if there are any
  if (missedSequences.size > 0) {
    requestMissedPackets();
  } else {
    saveData();
  }
});

// Request missed packets
function requestMissedPackets() {
  const missedPacketsClient = new net.Socket();
  missedPacketsClient.connect(3000, '127.0.0.1', () => {
    console.log('Connected to server to request missed packets');
    missedSequences.forEach((seq) => {
      missedPacketsClient.write(Buffer.from([2, seq]));
      missedSequences.delete(seq);
    });
  });

  missedPacketsClient.on('data', (data) => {
    while (data.length) {
      const packet = {};
      packet.symbol = data.toString('ascii', 0, 4);
      packet.buysellindicator = data.toString('ascii', 4, 5);
      packet.quantity = data.readInt32BE(5);
      packet.price = data.readInt32BE(9);
      packet.packetSequence = data.readInt32BE(13);

      receivedPackets.set(packet.packetSequence, packet);
      data = data.slice(17);
    }

    // Check if there are still missing sequences
    if (missedSequences.size === 0) {
      saveData();
      missedPacketsClient.end();
    }
  });

  missedPacketsClient.on('end', () => {
    console.log('Disconnected from server after requesting missed packets');
  });

  missedPacketsClient.on('error', (err) => {
    console.error('Missed packets client error:', err);
  });
}

// Save the received data to a file
function saveData() {
  const outputData = Array.from(receivedPackets.values());
  fs.writeFileSync('output.json', JSON.stringify(outputData, null, 2));
  console.log('Data saved to output.json');
  client.end();
}

// Handle errors
client.on('error', (err) => {
  console.error('Client error:', err);
});
