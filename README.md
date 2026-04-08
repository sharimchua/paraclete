# Paraclete

> **Paraclete** is a personal practice OS for 1-1 service providers — coaches, tutors, consultants, and teachers. It is a privacy-first, local-first workstation designed to augment human relationships with intelligent, locally-hosted AI.

---

## 🌟 Vision
Paraclete (from the Greek *parakletos*, "one called alongside to help") acts as the digital infrastructure for practitioners. It handles the administrative heavy lifting—preparing for sessions, capturing notes, cleaning transcriptions, and drafting follow-ups—so you can focus entirely on the human in front of you.

## ✨ Core Features
- **Practice Dashboard & Analytics**: A deterministic overview of your practice. Visualize session frequency via the Note Calendar, track developmental trends, and monitor Reference utilization across your client base.
- **The Note Lifecycle**: A structured workflow derived from clinical and coaching best practices: `Prepare → Capture → Clean → Publish → Archive`.
- **Person & Group Management**: Deep tracking of individuals and cohorts, including session history and personalized knowledge mapping.
- **Reference Library**: Accumulate your intellectual capital. Extract concepts, resources, and patterns from sessions into a reusable knowledge base.
- **Universal Tagging**: A strictly managed global tagging system that connects people, notes, and references through shared vocabulary.
- **Local AI (Gemma 4 MoE)**: 100% private, local inference using `llama.cpp` and CUDA acceleration. Supports automated note cleaning, semantic entity extraction, and multimodal dictation/OCR (Phase 5 Complete).
- **Developer Observability**: Real-time "LLM Forensics" panel to monitor prompts, grammar enforcement, and local vector search deltas.
- **Atomic Portability**: Robust JSON export/import for full ownership of your data.

## 🛠️ Tech Stack
- **Container**: Electron (Desktop focus, Windows primary)
- **Frontend**: React 18, TypeScript, Vanilla CSS (Premium Aesthetic)
- **Backend API**: FastAPI (Python 3.12)
- **Database**: SQLite with SQLAlchemy & Alembic migrations
- **Inference**: `llama-cpp-python` with CUDA support for Gemma 4 MoE
- **Build System**: `electron-vite`

---

## 📁 Project Structure
- `/src`: Electron main, preload, and React renderer source code.
  - `/main`: Main process, including `BackendManager` for Python lifecycle.
  - `/renderer`: React application, components, and assets.
- `/backend`: FastAPI source code, SQLite models, and AI processing.
  - `main.py`: API entry point.
  - `models.py`: SQLAlchemy database models.
  - `schemas.py`: Pydantic validation schemas.
- `/design`: Product Requirements (PRD), Technical Designs (TDD), and Implementation Plans.
- `/scripts`: Setup and utility scripts (PowerShell).

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js** (v20+)
- **Windows** (Primary target)
- **NVIDIA GPU** (Optional but recommended for CUDA-accelerated AI)

### 2. Initial Setup
Clone the repository and install the Node dependencies:
```powershell
npm install
```

### 3. Python Environment Setup
Paraclete manages its own standalone Python environment. You can initialize it manually using the provided script:
```powershell
./scripts/setup_env.ps1 -installPath "$env:APPDATA/paraclete-app/python_env"
```
*Note: This script downloads a portable Python, installs `llama-cpp-python` with CUDA flags, and prepares the model directory.*

### 4. Running in Development
Start the Electron application and the Vite dev server:
```powershell
npm run dev
```
The application will automatically spawn the FastAPI backend as a child process.

---

## 🏗️ Build & Distribution

### Windows Build
To package the application for distribution:
```powershell
npm run build:win
```
This will compile the frontend, bundle the backend files, and generate an installer in the `/dist` directory.

---

## 🛡️ Privacy & Security
Paraclete is built on a **local-first** philosophy. Your notes, client data, and AI processing never leave your machine unless you explicitly choose to export them. There is no cloud sync, no tracking, and no external AI provider logs.

## 📝 License
Proprietary / Internal Development.
