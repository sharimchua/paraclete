from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import socket

app = FastAPI(title="Paraclete Backend")

# Allow all origins for local development and mobile client access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Paraclete API is running"}

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    await websocket.send_json({"event": "connected", "data": "Handshake successful"})
    while True:
        data = await websocket.receive_text()
        await websocket.send_json({"event": "echo", "data": data})

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

if __name__ == "__main__":
    ip = get_local_ip()
    print(f"Starting Paraclete Backend on {ip}:8000")
    # In production, this can be bound to 0.0.0.0 for mobile access
    uvicorn.run(app, host="0.0.0.0", port=8000)
