# Paraclete Technical Design Document (v1.0 - Local-First Architecture)

## 1. Overview
This document outlines the technical architecture for Paraclete, overriding the cloud-based stack proposed in the original PRD. The application is designed as a privacy-first, local-first Electron desktop application, primarily targeting Windows. It manages a self-contained Python environment to handle backend services, SQLite persistence, and local LLM inference natively.

## 2. Architecture & Tech Stack

### 2.1 Core Components
- **Desktop Container:** Electron (Windows primary target).
- **Frontend / Client:** React (bundled within Electron and servable as a web client).
- **Backend API:** Python (FastAPI) running as a standalone environment managed by the application.
- **Database:** SQLite with Alembic for smooth schema migrations.
- **LLM Inference:** `llama.cpp` integration within the Python backend.

### 2.2 System Topology
The application will consist of an Electron main process that orchestrates a background Python API server.
- **Electron Main Process:** Manages application lifecycle, window management, and spawns/terminates the Python background process.
- **Python API Server:** Exposes a local HTTP/WebSocket API via FastAPI. Handles all business logic, database CRUD, prompt construction, and model execution.
- **Electron Renderer Process:** The primary UI wrapper running the React app natively.
- **Local Network Web Client:** The backend will optionally serve the React frontend on a local network interface to allow mobile or tablet clients on the same Wi-Fi to access the app for remote capture (Dictation/OCR). This network access is **opt-in** via a UI toggle. Once enabled, the UI will explicitly display the bound local IP address alongside a **QR code** that can be scanned by a phone to immediately open the mobile-optimized interface.

### 2.3 First-Run Experience & Python Environment
To bypass user environmental Python setups while maintaining flexibility:
- On initial startup, the Electron application will seamlessly manage the setup of its required runtime. It will programmatically invoke a Python installer, configure a dedicated virtual environment, install necessary dependencies via `pip`, and execute any required compilations (e.g., CUDA embeddings for `llama-cpp-python`).
- During this first-run sequence (which includes downloading model weights), the Electron UI will display an explicit, transparent progress screen detailing exactly what setup stage is occurring, so the user has full operational visibility.

## 3. Data & Persistence

### 3.1 Database & Migrations
- **Engine:** SQLite. Chosen for absolute privacy, zero-configuration setup, and single-file serverless storage. 
- **Migrations:** Alembic (with SQLAlchemy) will manage schema changes natively, allowing agile shifts during prototyping.
- **Serialization & Modification:** We will implement an explicit **JSON export/import** mechanism. This allows the entire local database (schema definitions and raw data) to be serialized into a JSON format. This fulfills two needs: it can be externally managed, reviewed, and tweaked for re-importing; and the raw JSON can be seamlessly fed into an external LLM for analysis and inference workflows. The physical SQLite file also remains accessible for direct schema tweaks via tools like DB Browser if needed.

## 4. Local AI & Model Serving

### 4.1 Inference Engine & Model Distribution
- **Engine:** Native `llama.cpp` integration (served directly from the Python backend).
- **Primary Model:** Gemma 4 (MoE variant) in GGUF format.
- **Weight Management:** The multi-gigabyte model weights will not be shipped tightly coupled with the installer. Instead, the first-run setup sequence will download the weights externally and cache them in the application's local data directory.

### 4.2 Hardware Target
- **Target Specs:** RTX 3090, 24 GB VRAM, 96 GB System RAM.
- **Optimization:** Given 24 GB of VRAM, the application is optimized for heavy GPU offloading. The `llama.cpp` bindings will be compiled with CUDA support to maximize performance and throughput on the RTX 3090 development machine. Future tweaks will allow for down-scaling to lower VRAM environments.

## 5. Observability & Debugging

Given the prototype nature and heavy reliance on local LLMs, introspection is a first-class UI feature.

### 5.1 Verbose Logging & Syntax Highlighting
- **Contextual Debug UI:** The Electron app will feature dedicated debugging panels (or "Developer Mode") that expose the internal state of the application.
- **Log Formatting:** Logs will be easily readable, context-aware, and feature full syntax highlighting for SQL queries, JSON payloads, and API requests.

### 5.2 Model Transparency & Thinking Space
- **Input Translation Breakdown:** The UI will expose the exact transformation pipeline from user input into the final prompt fed to the model.
- **Thinking Tags:** For models that utilize reasoning/thinking tokens (like MoE models or Chain-of-Thought setups), the intermediate "thinking" steps (e.g., `<think>...</think>`) will be explicitly parsed, mapped, and exposed in the UI for full transparency on how the model derived its answers.
