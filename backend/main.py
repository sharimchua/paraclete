from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import socket
import os

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
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_json({"event": "echo", "data": data})
    except Exception:
        pass # Handle disconnects gracefully

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
    # Check if we should expose the backend to the network
    expose = os.getenv("PARACLETE_EXPOSE", "0") == "1"
    host = "0.0.0.0" if expose else "127.0.0.1"
    
    print(f"Starting Paraclete Backend on {host}:8000 (Local IP: {ip})")
    
    uvicorn.run(app, host=host, port=8000)
