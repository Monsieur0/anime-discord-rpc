let ws = null;
let queue = [];
let pingInterval = null;
let reconnectTimer = null;

function connectWS() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    
    if (reconnectTimer) clearTimeout(reconnectTimer);

    ws = new WebSocket("ws://127.0.0.1:3000");
    
    ws.onopen = () => {
        console.log("%c[BG] ✅ ПОДКЛЮЧЕНО К СЕРВЕРУ", "color: green; font-weight: bold;");
        queue.forEach(msg => ws.send(JSON.stringify(msg)));
        queue = [];
        
        if (pingInterval) clearInterval(pingInterval);
        pingInterval = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'PING' }));
            }
        }, 20000);
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
        console.log("[BG] ❌ Нет связи с сервером. Пробую снова через 3 сек...");
        reconnectTimer = setTimeout(connectWS, 3000);
    };
    
    ws.onerror = () => { try { ws.close(); } catch (_) {} };
}

connectWS();

chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "animepresence") {
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