# DEI Assistant

A Chrome extension designed to enhance diversity, equity, and inclusion in your browsing experience.

## 🚀 Quick Start

### Prerequisites

- Python (v3.8 or higher) for the backend
- Chrome browser (latest version)
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repository-url>
   cd DEIhack
   ```


   To load the extension in Chrome:
   1. Open Chrome and navigate to `chrome://extensions/`
   2. Enable "Developer mode" in the top right
   3. Click "Load unpacked" and select the `dei-voice-assistant` folder
   4. Give the extension required permissions if asked
3. **Backend Setup**
   ```bash
   cd backend
   python -m venv venv
   
   # On Windows
   .\venv\Scripts\activate
   
   # On macOS/Linux
   source venv/bin/activate
   
   pip install -r requirements.txt
   ```

4. **Environment Configuration**
   - Copy `.env.example` to `.env`
   - Update the environment variables with your values:
     ```
      ANTHROPIC_API_KEY=
      OPENAI_API_KEY=
     ```

### Running the Application

1. **Start the Backend Server**
   ```bash
   cd backend
   python app.py
   ```
   or
   ```bash
   cd backend
   python3 app.py
   ```
   The server will start at `http://127.0.0.1:5001`




## 🔧 Development

### Frontend Development
- The extension is built using modern web technologies
- The `manifest.json` file contains extension configuration

### Backend Development
- Flask-based REST API
- Uses Python virtual environment for dependency management
- Configuration via environment variables


## 📝 API Documentation

### Base URL
```
http://127.0.0.1:5001
```


Remember to star ⭐ this repository if you find it helpful! 
