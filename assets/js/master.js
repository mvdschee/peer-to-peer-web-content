// set Strict mode for JS
'use strict';

// set global variables
// Number used for roomName
let roomNumber = Math.floor(Math.random() * 999999).toString();
// values for building webContent array
let start = 0;
let end = 20;
// RTCPeerConnection
let pc;
// RTCDataChannel
let dataChannel;
// Scaledrone room name needs to be prefixed with 'observable-'
let roomName;
// Scaledrone room used for signaling
let room;
// Input field for changing roomNumber
const createInput = document.querySelector('#js-create-input');
// Clientname to verify data is send from other user
const clientName = Math.floor(Math.random() * 0xFFFFFF).toString(16);
// Array with content
const webContent = [];
// TODO: Replace with your own channel ID
const drone = new ScaleDrone('dHMBoLzubeBfdBQp');
// Config for ICE framework with STUN servers
const configuration = {
    iceServers: [{
        urls: 'stun:stun.l.google.com:19302'
    }]
};

// Automagic set roomNumber in inputfield
createInput.value = roomNumber;

console.log('your client name is:', clientName);

// Fill array with content
for (var i = start; i < end + 1; i++) {
    webContent.push({
        'id': i,
        'content': 'Hello, World!',
        'clientname': clientName
    });
}

// wait for onclick event to set roomName for signalling session
let setRoomName = new Promise((resolve, reject) => {
    document.querySelector('#js-join').onclick = () => {
        if ( createInput.value != '') {
            location.hash = createInput.value;
            roomName = 'observable-' + createInput.value;
            document.querySelector('#js-pop-up').innerHTML = 'Room name: ' + createInput.value;
        } else {
            location.hash = roomNumber;
            roomName = 'observable-' + roomNumber;
            createInput.value = roomNumber;
            document.querySelector('#js-pop-up').innerHTML = 'Room name: ' + roomNumber;
        }
        document.querySelector('#js-pop-up').classList.add('show');
        document.querySelector('#js-create').classList.add('hide');
        resolve(roomName);
    };
});

// onclick copy room name for session
document.querySelector('#js-pop-up').onclick = () => {
    let innerContent = document.querySelector('#js-pop-up').innerHTML;
    createInput.select();
    document.execCommand("copy");
    document.querySelector('#js-pop-up').innerHTML = 'Copied room name!';
    setTimeout(() => {
        document.querySelector('#js-pop-up').innerHTML = innerContent;
    }, 1000);
}

// Wait for Scaledrone signalling server to connect
drone.on('open', error => {
    if (error) {
        return console.error(error);
    }
    // Waits for promise te resolve and accept roomName
    setRoomName.then(
        result => { 
            room = drone.subscribe(result);
            room.on('open', error => {
                if (error) {
                    return console.error(error);
                }
                console.log('Connected to signaling server');
            });
            // We're connected to the room and received an array of 'members'
            // connected to the room (including us). Signaling server is ready.
            room.on('members', members => {
                if (members.length >= 3) {
                    return alert('The room is full');
                }
                // If we are the second user to connect to the room we will be creating the offer
                const isOfferer = members.length === 2;
                startWebRTC(isOfferer);
            });
        },
        reject => console.log(reject)
    ).catch(
        error => console.error(error)
    );
});

// Send signaling data via Scaledrone
function sendSignalingMessage(message) {
    drone.publish({
        room: roomName,
        message
    });
}

function startWebRTC(isOfferer) {
    console.log('Starting WebRTC in as', isOfferer ? 'offerer' : 'waiter');
    pc = new RTCPeerConnection(configuration);

    // 'onicecandidate' notifies us whenever an ICE agent needs to deliver a
    // message to the other peer through the signaling server
    pc.onicecandidate = event => {
        
        if (event.candidate) {
            console.log('candidate', event.candidate);
            sendSignalingMessage({ 'candidate': event.candidate });
        }
    };


    if (isOfferer) {
        // If user is offerer let them create a negotiation offer and set up the data channel
        pc.onnegotiationneeded = () => {
            pc.createOffer(localDescCreated, error => console.error(error));
        }
        dataChannel = pc.createDataChannel('chat');
        setupDataChannel();
    } else {
        // If user is not the offerer let wait for a data channel
        pc.ondatachannel = event => {
            dataChannel = event.channel;
            setupDataChannel();
        }
    }

    startListentingToSignals();
}

function startListentingToSignals() {
    // Listen to signaling data from Scaledrone
    room.on('data', (message, client) => {
        // Message was sent by us
        if (client.id === drone.clientId) {
            return;
        }
        if (message.sdp) {
            // This is called after receiving an offer or answer from another peer
            pc.setRemoteDescription(new RTCSessionDescription(message.sdp), () => {
                console.log('pc.remoteDescription.type', pc.remoteDescription.type);
                // When receiving an offer lets answer it
                if (pc.remoteDescription.type === 'offer') {
                    console.log('Answering offer');
                    pc.createAnswer(localDescCreated, error => console.error(error));
                }
            }, error => console.error(error));
        } else if (message.candidate) {
            // Add the new ICE candidate to our connections remote description
            pc.addIceCandidate(new RTCIceCandidate(message.candidate));
        }
    });
}

function localDescCreated(desc) {
    pc.setLocalDescription(
        desc,
        () => sendSignalingMessage({ 'sdp': pc.localDescription }),
        error => console.error(error)
    );
}

// Hook up data channel event handlers
function setupDataChannel() {
    dataChannel.onopen = checkDataChannelState;
    dataChannel.onclose = checkDataChannelState;
    dataChannel.onmessage = event => 
        insertContentToDOM(JSON.parse(event.data), false);
}

function checkDataChannelState() {
    console.log('WebRTC channel state is:', dataChannel.readyState);
    if (dataChannel.readyState === 'open') {
        document.querySelector('#js-pop-up').innerHTML = 'WebRTC data channel is now open';
        dataChannel.send(JSON.stringify(webContent));
    }
}

function insertContentToDOM(options, isFromMe) {
    document.querySelector('#js-create').style.display = "none";
    console.log(options);
    
    if (isFromMe !== true) {
        options.forEach(element => {
            const template = document.querySelector('template[data-template="article"]');
            template.content.querySelector('.article-text').innerText = element.content;
            const clone = document.importNode(template.content, true);
            const articleEl = clone.querySelector('.article'); 
            articleEl.classList.add(element.id);
            const contentEl = document.querySelector('.content');
            contentEl.appendChild(clone);
        });
    }
}
