import WebSocket from 'ws';

function testWS(url, name) {
    const ws = new WebSocket(url);
    ws.on('open', () => {
        console.log(`[${name}] Connected!`);
        ws.send(JSON.stringify({ type: 'subscribe', workflowId: 'ml-pipeline' }));
    });
    ws.on('message', (data) => console.log(`[${name}] MSG:`, Buffer.from(data).toString().substring(0, 100)));
    ws.on('error', (err) => console.error(`[${name}] ERR:`, err.message));
    ws.on('close', () => console.log(`[${name}] Closed.`));
}

testWS('ws://localhost:3000/ws', 'meta-bff');
testWS('ws://localhost:3002/ws', 'bpmn-bff');
setTimeout(() => process.exit(0), 4000);
