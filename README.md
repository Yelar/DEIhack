# DEI Chrome Extension

A Chrome extension designed to enhance diversity, equity, and inclusion in your browsing experience.

## 🚀 Quick Start

### Prerequisites

- Node.js (v14 or higher)
- Python (v3.8 or higher) for the backend
- Chrome browser (latest version)
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repository-url>
   cd DEIhack
   ```

2. **Frontend Setup (Chrome Extension)**
   ```bash
   cd frontend
   npm install
   npm run build
   ```

   To load the extension in Chrome:
   1. Open Chrome and navigate to `chrome://extensions/`
   2. Enable "Developer mode" in the top right
   3. Click "Load unpacked" and select the `dist` folder

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
     PORT=3000
     NODE_ENV=development
     DB_HOST=localhost
     # ... other variables
     ```

### Running the Application

1. **Start the Backend Server**
   ```bash
   cd backend
   python app.py
   ```
   The server will start at `http://localhost:3000`

2. **Development Mode**
   ```bash
   cd frontend
   npm run dev
   ```

3. **Building for Production**
   ```bash
   cd frontend
   npm run build
   ```

## 🏗️ Project Structure

```
DEIhack/
├── frontend/                # Chrome Extension frontend
│   ├── src/                # Source files
│   ├── public/             # Static assets
│   └── dist/              # Built extension files
├── backend/               # Python backend server
│   ├── app.py            # Main application file
│   ├── requirements.txt  # Python dependencies
│   └── venv/            # Python virtual environment
├── .env                  # Environment variables (not in git)
├── .env.example         # Example environment variables
└── .gitignore          # Git ignore rules
```

## 🔧 Development

### Frontend Development
- The extension is built using modern web technologies
- Use `npm run dev` for development with hot reload
- The `manifest.json` file contains extension configuration
- Built files are in the `dist` directory

### Backend Development
- Flask-based REST API
- Uses Python virtual environment for dependency management
- Configuration via environment variables
- Database models in `models.py`

### Best Practices
1. **Code Style**
   - Follow PEP 8 for Python code
   - Use ESLint for JavaScript/TypeScript
   - Write meaningful commit messages

2. **Security**
   - Never commit `.env` files
   - Keep API keys secure
   - Use HTTPS for API calls

3. **Testing**
   - Write unit tests for new features
   - Test the extension in Chrome's development mode
   - Verify API endpoints with Postman/curl

## 📝 API Documentation

### Base URL
```
http://localhost:3000/api
```

### Available Endpoints
- `GET /api/health` - Health check
- `POST /api/analyze` - Analyze text for DEI improvements
- `GET /api/suggestions` - Get DEI suggestions

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support, please:
1. Check the documentation
2. Open an issue
3. Contact the maintainers

## 🔄 Updates and Maintenance

- Regular updates for Chrome compatibility
- Security patches as needed
- Feature additions based on user feedback

---

Remember to star ⭐ this repository if you find it helpful! 