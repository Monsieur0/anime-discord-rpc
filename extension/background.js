let ws = null;
let queue = [];
let pingInterval = null;
let lastActivityTime = Date.now();

function connectWS() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    
    ws = new WebSocket("ws://127.0.0.1:3000");
    
    ws.onopen = () => {
        console.log("%c[BG] ✅ ПОДКЛЮЧЕНО К СЕРВЕРУ", "color: green; font-weight: bold;");
        queue.forEach(msg => ws.send(JSON.stringify(msg)));
        queue = [];
        
        if (pingInterval) clearInterval(pingInterval);
        pingInterval = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                if (Date.now() - lastActivityTime > 15000) {
                    ws.close();
                    return;
                }
                ws.send(JSON.stringify({ type: 'PING' }));
            }
        }, 5000);
    };
    
    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'reload') setTimeout(() => chrome.runtime.reload(), 300);
        } catch (e) {}
    };
    
    ws.onclose = () => {
        if (pingInterval) clearInterval(pingInterval);
        ws = null;
    };
    
    ws.onerror = () => { try { ws.close(); } catch (_) {} };
}

chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "animepresence") {
        lastActivityTime = Date.now();
        const payload = { ...message.payload };
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            queue.push(payload);
            connectWS();
        } else {
            ws.send(JSON.stringify(payload));
        }
    }
    return true; 
});