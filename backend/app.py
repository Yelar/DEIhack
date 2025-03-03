from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import anthropic
from consts import prompt
import os
import io
import time
import dotenv
from langchain.tools import tool
from langchain_anthropic import ChatAnthropic
from langchain.agents import create_tool_calling_agent, AgentExecutor
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from flask_socketio import SocketIO, send
import json
import openai

dotenv.load_dotenv()

app = Flask(__name__)
# Configure CORS to allow requests from any origin
CORS(app, resources={r"/*": {"origins": "*"}})

# Initialize SocketIO with proper CORS handling
socketio = SocketIO(app, 
                   cors_allowed_origins="*", 
                   logger=True, 
                   engineio_logger=True)

# Debug flag to show all events
DEBUG = True

# Initialize OpenAI client
openai_client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Cache for storing generated audio to avoid redundant API calls
tts_cache = {}

# Add global variable to track TTS tasks
tts_active = False

# Define available tools
AVAILABLE_TOOLS = [
    {
        "name": "summarize",
        "description": "Summarize the given text content"
    },
    {
        "name": "find",
        "description": "Find specific information within the text"
    },
    {
        "name": "extract_entities",
        "description": "Extract named entities from the text"
    },
    {
        "name": "analyze_sentiment",
        "description": "Analyze the sentiment of the text"
    },
    {
        "name": "translate",
        "description": "Translate the text to another language"
    }
]
# Additional Socket.io event handlers
@socketio.on("connect")
def handle_connect():
    print("Client connected to Socket.io server")
    # Send a welcome message to confirm connection
    socketio.emit('welcome', {'message': 'Connected to DEI Voice Assistant backend'})

@socketio.on("disconnect")
def handle_disconnect():
    print("Client disconnected from Socket.io server")

@socketio.on("message") 
def handle_message(msg):
    print(f"Received Socket.io message: {msg}")
    # Echo the message back as confirmation
    socketio.emit('message', f"Server received: {msg}")

# Setup logging function
def log_debug(message):
    if DEBUG:
        print(f"[DEBUG] {message}")

# Define the multiplication tool
@tool
def multiply(a: float, b: float) -> float:
    """Multiply two numbers together."""
    print(f"Multiplying {a} and {b}")
    return a * b

# Set up LangChain agent
def setup_agent():
    # Retrieve the API key and validate it
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY environment variable is not set.")

    # Initialize the LLM
    llm = ChatAnthropic(
        model="claude-3-5-sonnet-20241022",
        anthropic_api_key=api_key,
        temperature=0
    )
    
    # Define tools
    tools = [multiply]
    
    # Create prompt
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are a helpful assistant that can use tools to solve math problems."),
        ("human", "{input}"),
        MessagesPlaceholder(variable_name="agent_scratchpad"),
    ])
    
    # Create agent
    agent = create_tool_calling_agent(llm, tools, prompt)
    
    # Create agent executor
    return AgentExecutor(agent=agent, tools=tools, verbose=True)

# Initialize the agent executor
agent_executor = setup_agent()

@app.route('/calculate', methods=['POST'])
def calculate():
    data = request.get_json()
    user_input = data.get('query')
    
    if not user_input:
        return jsonify({'error': 'No query provided'}), 400
    
    try:
        result = agent_executor.invoke({"input": user_input})
        return jsonify({
            'result': result['output'],
            'success': True
        }), 200
    except Exception as e:
        print(f"Error: {str(e)}")
        return jsonify({
            'error': str(e),
            'success': False
        }), 500

def execute_tool(tool_name, transcript_text):
    """
    Execute the selected tool on the transcript text.
    
    Args:
        tool_name (str): The name of the tool to execute
        transcript_text (str): The transcript text to process
        
    Returns:
        dict: The result of the tool execution
    """
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    
    if tool_name == "summarize":
        # Emit socket message for summarize tool
        log_debug(f"Emitting 'tool_called' socket event for summarize tool")
        socketio.emit('tool_called', {'tool': 'summarize', 'message': 'Summarize tool called'})
        print("Summarize tool called AYOOOO")
        
        # Just return a confirmation that the socket event was emitted
        # The actual summarization will happen on the frontend
        result = {
            "status": "initiated", 
            "message": "Summarize tool called. Frontend will extract page content and request summarization."
        }
        
    elif tool_name == "find":
        # Handle finding specific information
        response = client.messages.create(
            model="claude-3-5-sonnet-20241022", 
            max_tokens=1000,
            temperature=0.0,
            messages=[
                {"role": "user", "content": f"Extract the most important facts and key information from this transcript: \n\n{transcript_text}"}
            ]
        )
        result = {"key_information": response.content[0].text}
        
    elif tool_name == "extract_entities":
        # Handle entity extraction
        response = client.messages.create(
            model="claude-3-5-sonnet-20241022", 
            max_tokens=1000,
            temperature=0.0,
            messages=[
                {"role": "user", "content": f"Extract named entities (people, organizations, locations, dates) from this transcript and return them as a JSON object with these categories as keys and arrays of entities as values. ONLY respond with the JSON object, no other text or explanations: \n\n{transcript_text}"}
            ]
        )
        
        # Try to parse the JSON response
        try:
            entities_json = response.content[0].text.strip()
            result = {"entities": json.loads(entities_json)}
        except json.JSONDecodeError:
            # If parsing fails, return the raw text
            result = {"entities": response.content[0].text, "parsing_error": True}
        
    elif tool_name == "analyze_sentiment":
        # Handle sentiment analysis
        response = client.messages.create(
            model="claude-3-5-sonnet-20241022", 
            max_tokens=1000,
            temperature=0.0,
            messages=[
                {"role": "user", "content": f"Analyze the sentiment of this transcript. Return a JSON object with 'sentiment' (positive, negative, or neutral), 'confidence' (0-1), and 'explanation' keys. ONLY respond with the JSON object, no other text or explanations: \n\n{transcript_text}"}
            ]
        )
        
        # Try to parse the JSON response
        try:
            sentiment_json = response.content[0].text.strip()
            result = {"sentiment_analysis": json.loads(sentiment_json)}
        except json.JSONDecodeError:
            # If parsing fails, return the raw text
            result = {"sentiment_analysis": response.content[0].text, "parsing_error": True}
        
    elif tool_name == "translate":
        # Handle translation (default to English to Spanish)
        response = client.messages.create(
            model="claude-3-5-sonnet-20241022", 
            max_tokens=1000,
            temperature=0.0,
            messages=[
                {"role": "user", "content": f"Translate the following transcript to Spanish: \n\n{transcript_text}"}
            ]
        )
        result = {"translation": response.content[0].text}
        
    else:
        # Handle unknown tool
        result = {"error": f"Unknown tool: {tool_name}"}
    
    return result

@app.route('/transcript', methods=['POST'])
def transcript():
    data = request.get_json()
    transcript_text = data.get('transcript')
    
    if not transcript_text:
        return jsonify({'error': 'No transcript provided'}), 400
    
    log_debug(f"Received transcript request with {len(transcript_text)} characters")
    
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

    # Create the tool selection prompt
    agent_prompt = """
    Based on the transcript below, select the most appropriate tool to process this content.
    Your response must be a valid JSON object with a single 'tool' field containing the name of the selected tool.
    
    Available tools:
    """
    
    # Add tool descriptions to the prompt
    for tool in AVAILABLE_TOOLS:
        agent_prompt += f"\n- {tool['name']}: {tool['description']}"
    
    agent_prompt += f"\n\nTranscript: {transcript_text}\n\nYou must respond with ONLY a valid JSON object like this: {{\"tool\": \"tool_name\"}}. Do not include any other text, explanations, or markdown formatting."

    # Call Claude to select a tool
    log_debug("Sending request to Claude for tool selection")
    response = client.messages.create(
        model="claude-3-5-sonnet-20241022", 
        max_tokens=500,
        temperature=0.0,
        messages=[
            {"role": "user", "content": agent_prompt}
        ]
    )

    # Extract the JSON response
    tool_selection_json = response.content[0].text.strip()
    log_debug(f"Raw Claude response: {tool_selection_json}")
    
    try:
        # Parse the JSON response
        tool_data = json.loads(tool_selection_json)
        selected_tool = tool_data.get("tool")
        log_debug(f"Selected tool: {selected_tool}")
        
        if not selected_tool:
            return jsonify({'error': 'No tool was selected by the agent'}), 500
            
        # Execute the selected tool
        log_debug(f"Executing tool: {selected_tool}")
        tool_result = execute_tool(selected_tool, transcript_text)
        
        return jsonify({
            'message': 'Transcript processed successfully!',
            'selected_tool': selected_tool,
            'result': tool_result
        }), 200
        
    except json.JSONDecodeError as e:
        log_debug(f"JSON decode error: {e}")
        log_debug(f"Raw response: {tool_selection_json}")
        return jsonify({'error': f'Failed to parse tool selection response: {tool_selection_json}'}), 500
    except Exception as e:
        log_debug(f"Error executing tool: {e}")
        return jsonify({'error': f'Error executing tool: {str(e)}'}), 500

@app.route("/summarize", methods=['POST'])
def summarize():
    data = request.get_json()
    text_content = data.get('text')
    
    if not text_content:
        return jsonify({'error': 'No text content provided'}), 400
    
    try:
        # Use Claude to summarize the text content
        client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        
        response = client.messages.create(
            model="claude-3-5-sonnet-20241022", 
            max_tokens=1000,
            temperature=0.0,
            messages=[
                {"role": "user", "content": f"Provide a concise summary of the following text content. Focus on the main points and key information:\n\n{text_content}"}
            ]
        )
        
        summary = response.content[0].text
        
        return jsonify({
            'message': 'Text content summarized successfully!',
            'summary': summary
        }), 200
    except Exception as e:
        print(f"Error during summarization: {str(e)}")
        return jsonify({
            'error': f'Error during summarization: {str(e)}',
            'success': False
        }), 500

@app.route('/execute-tool', methods=['POST'])
def execute_tool_route():
    """
    Endpoint that allows directly executing a specific tool on transcript text.
    Requires a JSON payload with 'tool' and 'transcript' fields.
    """
    data = request.get_json()
    tool_name = data.get('tool')
    transcript_text = data.get('transcript')
    
    if not tool_name:
        return jsonify({'error': 'No tool specified'}), 400
        
    if not transcript_text:
        return jsonify({'error': 'No transcript provided'}), 400
    
    try:
        # Execute the selected tool
        log_debug(f"Directly executing tool: {tool_name}")
        tool_result = execute_tool(tool_name, transcript_text)
        
        return jsonify({
            'message': f'Successfully executed tool: {tool_name}',
            'result': tool_result
        }), 200
        
    except Exception as e:
        log_debug(f"Error executing tool directly: {e}")
        return jsonify({'error': f'Error executing tool: {str(e)}'}), 500

@app.route('/list-tools', methods=['GET'])
def list_tools():
    """
    Endpoint that returns the list of available tools.
    """
    return jsonify({
        'tools': AVAILABLE_TOOLS
    }), 200

# Test endpoint to manually emit socket events
@app.route('/test-socket', methods=['POST'])
def test_socket():
    """
    Endpoint to manually test socket.io emission
    """
    tool = request.args.get('tool', 'summarize')
    log_debug(f"Manually emitting tool_called event for tool: {tool}")
    
    socketio.emit('tool_called', {'tool': tool, 'message': f'{tool} tool called'})
    
    return jsonify({
        'message': f'Emitted tool_called event for {tool}'
    }), 200

@app.route('/debug-console', methods=['GET'])
def debug_console():
    """
    Debug console to check server status and trigger test events.
    """
    # Basic HTML for the debug console
    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>DEI Voice Assistant Debug Console</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            h1 { color: #333; }
            .section { background: #f5f5f5; padding: 15px; margin-bottom: 20px; border-radius: 5px; }
            button { background: #4285f4; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; margin: 5px; }
            button:hover { background: #356ac3; }
            #logs { background: #2b2b2b; color: #eee; padding: 10px; border-radius: 5px; height: 200px; overflow-y: auto; }
            .success { color: #4CAF50; }
            .error { color: #F44336; }
            .info { color: #2196F3; }
        </style>
    </head>
    <body>
        <h1>DEI Voice Assistant Debug Console</h1>
        
        <div class="section">
            <h2>Server Status</h2>
            <p>API Server: <span class="success">Running</span></p>
            <p>Socket.IO: <span class="success">Running</span></p>
            <button onclick="testApi()">Test API Connection</button>
        </div>
        
        <div class="section">
            <h2>Socket.IO Testing</h2>
            <p>Connection Status: <span id="socketStatus" class="error">Not Connected</span></p>
            <button onclick="connectSocket()">Connect to Socket</button>
            <button onclick="disconnectSocket()">Disconnect Socket</button>
        </div>
        
        <div class="section">
            <h2>Tool Testing</h2>
            <button onclick="testTool('summarize')">Test Summarize</button>
            <button onclick="testTool('find')">Test Find</button>
            <button onclick="testTool('extract_entities')">Test Entity Extraction</button>
            <button onclick="testTool('analyze_sentiment')">Test Sentiment Analysis</button>
            <button onclick="testTool('translate')">Test Translate</button>
        </div>
        
        <div class="section">
            <h2>Logs</h2>
            <div id="logs"></div>
        </div>
        
        <script src="https://cdn.socket.io/4.6.0/socket.io.min.js"></script>
        <script>
            let socket;
            const logs = document.getElementById('logs');
            const socketStatus = document.getElementById('socketStatus');
            
            function log(message, type = 'info') {
                const entry = document.createElement('div');
                entry.className = type;
                entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
                logs.appendChild(entry);
                logs.scrollTop = logs.scrollHeight;
            }
            
            function testApi() {
                log('Testing API connection...');
                fetch('/list-tools')
                    .then(response => response.json())
                    .then(data => {
                        log(`API connection successful. Found ${data.tools.length} tools.`, 'success');
                    })
                    .catch(error => {
                        log(`API connection failed: ${error}`, 'error');
                    });
            }
            
            function connectSocket() {
                log('Connecting to Socket.IO server...');
                try {
                    socket = io();
                    
                    socket.on('connect', () => {
                        socketStatus.textContent = 'Connected';
                        socketStatus.className = 'success';
                        log('Socket.IO connected successfully', 'success');
                    });
                    
                    socket.on('disconnect', () => {
                        socketStatus.textContent = 'Disconnected';
                        socketStatus.className = 'error';
                        log('Socket.IO disconnected', 'error');
                    });
                    
                    socket.on('welcome', (data) => {
                        log(`Received welcome message: ${data.message}`, 'success');
                    });
                    
                    socket.on('message', (data) => {
                        log(`Received message: ${data}`, 'info');
                    });
                    
                    socket.on('tool_called', (data) => {
                        log(`Tool called event: ${JSON.stringify(data)}`, 'success');
                    });
                    
                    socket.on('connect_error', (error) => {
                        log(`Socket connection error: ${error}`, 'error');
                    });
                } catch (error) {
                    log(`Error initializing socket: ${error}`, 'error');
                }
            }
            
            function disconnectSocket() {
                if (socket) {
                    socket.disconnect();
                    log('Manually disconnected from Socket.IO', 'info');
                } else {
                    log('No active socket connection to disconnect', 'error');
                }
            }
            
            function testTool(tool) {
                log(`Testing ${tool} tool...`);
                fetch(`/test-socket?tool=${tool}`, { method: 'POST' })
                    .then(response => response.json())
                    .then(data => {
                        log(`Test request sent: ${data.message}`, 'success');
                    })
                    .catch(error => {
                        log(`Test request failed: ${error}`, 'error');
                    });
            }
            
            // Automatically test API on load
            window.onload = function() {
                testApi();
            };
        </script>
    </body>
    </html>
    """
    
    return html

@app.route('/stop_audio', methods=['POST'])
def stop_audio():
    """
    Endpoint to stop any active text-to-speech processes
    
    This endpoint is called when a recording starts to ensure TTS doesn't
    interfere with speech recording.
    
    Returns a JSON response indicating success
    """
    global tts_active
    
    log_debug("Stop audio request received")
    
    # Set the flag to indicate TTS should be stopped
    tts_active = False
    
    # Send a socket event to notify clients that audio should stop
    socketio.emit('stop_audio', {
        'message': 'Audio playback interrupted by recording'
    })
    
    return jsonify({
        "success": True,
        "message": "Audio playback stopped"
    })

@app.route('/text_to_speech', methods=['POST'])
def text_to_speech():
    """
    Endpoint to convert text to speech using OpenAI's API
    
    Expected JSON payload:
    {
        "text": "Text to convert to speech",
        "voice": "alloy"  # Optional: can be alloy, echo, fable, onyx, nova, or shimmer
    }
    
    Returns audio file in MP3 format
    """
    global tts_active
    
    try:
        # Set the active flag to indicate TTS is in progress
        tts_active = True
        
        # Get request data
        data = request.json
        
        if not data or 'text' not in data:
            return jsonify({"error": "Missing required 'text' field"}), 400
        
        text = data['text']
        log_debug(f"Text-to-speech request received with {len(text)} characters")
        
        # If audio was stopped before processing, return early
        if not tts_active:
            log_debug("TTS request cancelled due to interruption")
            return jsonify({
                "success": False,
                "error": "TTS request cancelled due to user interruption"
            }), 200
            
        # Limit text length to avoid excessive API usage
        if len(text) > 4096:
            text = text[:4096]
            log_debug(f"Text truncated to 4096 characters")
            
        # Optional voice parameter (defaults to 'alloy')
        voice = data.get('voice', 'alloy')
        
        # Valid voice options for OpenAI
        valid_voices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']
        if voice not in valid_voices:
            voice = 'alloy'
        
        # Generate a cache key from the text and voice
        cache_key = f"{voice}:{text}"
        
        # Check if we already have this audio in cache
        if cache_key in tts_cache:
            log_debug(f"Using cached audio for TTS request")
            audio_data = tts_cache[cache_key]['data']
            
            # Reset the active flag before returning
            tts_active = False
            
            # Return the cached audio
            return send_file(
                io.BytesIO(audio_data),
                mimetype="audio/mpeg",
                as_attachment=True,
                download_name=f"tts_{int(time.time())}.mp3"
            )
        
        # If not in cache, call OpenAI API
        log_debug(f"Generating new speech with OpenAI API using voice: {voice}")
        
        # Check if OpenAI API key is available
        if not os.getenv("OPENAI_API_KEY"):
            tts_active = False
            return jsonify({"error": "OpenAI API key not configured"}), 500
        
        # Verify TTS hasn't been interrupted
        if not tts_active:
            log_debug("TTS request cancelled during API preparation")
            return jsonify({
                "success": False,
                "error": "TTS request cancelled due to user interruption"
            }), 200
        
        try:
            response = openai_client.audio.speech.create(
                model="tts-1",
                voice=voice,
                input=text
            )
            
            # Check for interruption after API call
            if not tts_active:
                log_debug("TTS request cancelled after API call")
                return jsonify({
                    "success": False,
                    "error": "TTS request cancelled due to user interruption"
                }), 200
            
            # Get the audio content
            audio_data = response.content
            
            # Store in cache (with simple expiration)
            tts_cache[cache_key] = {
                'data': audio_data,
                'timestamp': time.time()
            }
            
            # Clear old cache entries (older than 1 hour)
            current_time = time.time()
            keys_to_remove = [k for k, v in tts_cache.items() 
                            if current_time - v['timestamp'] > 3600]
            for k in keys_to_remove:
                del tts_cache[k]
            
            log_debug(f"Text-to-speech conversion successful, returning audio file")
            
            # Reset the active flag before returning
            tts_active = False
            
            # Return the audio
            return send_file(
                io.BytesIO(audio_data),
                mimetype="audio/mpeg",
                as_attachment=True,
                download_name=f"tts_{int(time.time())}.mp3"
            )
            
        except Exception as e:
            log_debug(f"OpenAI API error: {str(e)}")
            tts_active = False
            return jsonify({"error": f"OpenAI API error: {str(e)}"}), 500
        
    except Exception as e:
        log_debug(f"Error in text_to_speech: {str(e)}")
        tts_active = False
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("Starting DEI Voice Assistant backend server...")
    print(f"Debug mode: {'ON' if DEBUG else 'OFF'}")
    # Use socketio.run instead of app.run
    socketio.run(app, debug=True, host='0.0.0.0', port=5001, allow_unsafe_werkzeug=True)
