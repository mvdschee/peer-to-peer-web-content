const clientName = Math.floor(Math.random() * 0xFFFFFF).toString(16);
const webContent = [
    {
        'id':'one',
        'content': 'Hello, World!'
    },
    {
        'id': 'two',
        'content': 'Hello, World!'
    }
];

// Generate random content hash if needed
if (!location.hash) {
    location.hash = Math.floor(Math.random() * 0xFFFFFF).toString(16);
}
const contentHash = location.hash.substring(1);

// TODO: Replace with your own channel ID
const drone = new ScaleDrone('yiS12Ts5RdNhebyM');
// Scaledrone room name needs to be prefixed with 'observable-'
const roomName = 'observable-' + contentHash;
// Scaledrone room used for signaling
let room;

const configuration = {
    iceServers: [{
        url: 'stun:stun.l.google.com:19302'
    }]
};
// RTCPeerConnection
let pc;
// RTCDataChannel
let dataChannel;

document.querySelector('#js-pop-up').innerHTML = 'Content URL is: ' + location.href;
document.querySelector('#js-pop-up').classList.add('show');

// Wait for Scaledrone signalling server to connect
drone.on('open', error => {
    if (error) {
        return console.error(error);
    }
    room = drone.subscribe(roomName);
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
    checkDataChannelState();
    dataChannel.onopen = checkDataChannelState;
    dataChannel.onclose = checkDataChannelState;
    dataChannel.onmessage = event => 
        insertContentToDOM(JSON.parse(event.data), false);
}

function checkDataChannelState() {
    console.log('WebRTC channel state is:', dataChannel.readyState);
    if (dataChannel.readyState === 'open') {
        document.querySelector('#js-pop-up').innerHTML = 'WebRTC data channel is now open';
        sendData();
    }
}

function insertContentToDOM(options, isFromMe) {
   
    if (isFromMe !== true) {
        options.content.forEach(element => {
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

function sendData() {
    const data = {
        name: clientName,
        content: webContent,
    };

    dataChannel.send(JSON.stringify(data));

    insertContentToDOM(data, true);
}


