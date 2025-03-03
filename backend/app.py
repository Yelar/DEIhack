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
import re

dotenv.load_dotenv()

app = Flask(__name__)
# Configure CORS to allow requests from any origin
CORS(app, resources={r"/*": {"origins": "*"}})

# Initialize SocketIO with proper CORS handling
socketio = SocketIO(app, 
                   cors_allowed_origins="*", 
                   logger=True, 
                   engineio_logger=True,
                   async_mode='threading')

# Debug flag to show all events
DEBUG = True

# Initialize OpenAI client
openai.api_key = os.getenv("OPENAI_API_KEY")
# openai_client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

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
        "name": "fill the form",
        "description": "fill the form with the basic user information"
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
    elif tool_name == "fill the form":
        log_debug(f"Emitting 'tool_called' socket event for fill the form tool")
        socketio.emit('tool_called', {'tool': 'fill the form', 'message': 'Fill the form tool called'})
        print("Fill tool called AYOOOO")
        
        # Just return a confirmation that the socket event was emitted
        # The actual summarization will happen on the frontend
        result = {
            "status": "initiated", 
            "message": "Fill the form tool called. Frontend will extract page content and request filling the form."
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
            # For OpenAI v1.0.0+
            client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
            response = client.audio.speech.create(
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

@app.route('/explain', methods=['POST'])
def explain():
    """
    Endpoint to explain selected text or image content using Claude
    This endpoint accepts either text content or a base64-encoded image
    and returns a simplified explanation.
    """
    try:
        if DEBUG:
            app.logger.info(f"Received request to /explain endpoint")
        
        # Check if we have a valid JSON body
        if not request.is_json:
            app.logger.error("Request to /explain did not contain JSON data")
            return jsonify({
                'status': 'error',
                'message': 'Request must contain JSON data'
            }), 400
            
        data = request.json
        
        if DEBUG:
            text_present = 'text' in data
            image_present = 'image_data' in data
            app.logger.info(f"/explain request contains text: {text_present}, image: {image_present}")
        
        # Check if we have either text or image data
        if not (data.get('text') or data.get('image_data')):
            app.logger.error("Request to /explain missing both text and image_data")
            return jsonify({
                'status': 'error',
                'message': 'Either text or image data is required'
            }), 400
            
        client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        
        messages = []
        
        # Handle text explanation
        if data.get('text'):
            if DEBUG:
                app.logger.info(f"Processing text explanation request of length {len(data['text'])}")
                
            messages = [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": f"Please explain the following text in simple, straightforward language. Use short sentences, avoid jargon, and focus on making the content accessible to everyone including neurodivergent individuals and non-native speakers. Keep the explanation very brief and to the point (2-3 short paragraphs maximum):\n\n{data['text']}"
                        }
                    ]
                }
            ]
        
        # Handle image explanation
        elif data.get('image_data'):
            # The image data is expected to be base64 encoded
            image_data = data['image_data']
            
            if DEBUG:
                app.logger.info(f"Processing image explanation request, data length: {len(image_data)}")
            
            # Determine image format from data URL
            media_type = "image/png"  # Default
            
            # Remove the data URL prefix if present (e.g., "data:image/png;base64,")
            if ',' in image_data:
                prefix = image_data.split(',', 1)[0]
                image_data = image_data.split(',', 1)[1]
                
                # Extract media type from prefix if possible
                if 'image/jpeg' in prefix:
                    media_type = 'image/jpeg'
                elif 'image/jpg' in prefix:
                    media_type = 'image/jpeg'
                elif 'image/png' in prefix:
                    media_type = 'image/png'
                elif 'image/webp' in prefix:
                    media_type = 'image/webp'
                    
                if DEBUG:
                    app.logger.info(f"Detected image media type: {media_type}")
            
            try:
                messages = [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": "Please explain what you see in this image in simple, straightforward language. Use short sentences, avoid jargon, and focus on making the description accessible to everyone including neurodivergent individuals and non-native speakers. Keep the explanation very brief (2-3 short paragraphs maximum)."
                            },
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": media_type,
                                    "data": image_data
                                }
                            }
                        ]
                    }
                ]
            except Exception as e:
                app.logger.error(f"Error preparing image message: {str(e)}")
                return jsonify({
                    'status': 'error',
                    'message': f'Error processing image data: {str(e)}'
                }), 400
        
        if DEBUG:
            app.logger.info("Sending request to Claude API")
            
        # Get response from Claude
        try:
            response = client.messages.create(
                model="claude-3-opus-20240229",
                max_tokens=1000,
                messages=messages
            )
            
            explanation = response.content[0].text
            
            if DEBUG:
                app.logger.info(f"Received explanation from Claude, length: {len(explanation)}")
                
            return jsonify({
                'status': 'success',
                'explanation': explanation
            })
            
        except Exception as e:
            app.logger.error(f"Error from Claude API: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': f'Claude API error: {str(e)}'
            }), 500
        
    except Exception as e:
        app.logger.error(f"Error in explain endpoint: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/fill-form', methods=['POST'])
def fill_form():
    """
    Process a form and user data to automatically fill form fields.
    
    The endpoint expects:
    - form_data: Array of form elements with their details
    - user_data: String containing user knowledge base information
    
    Returns form answers to fill the form.
    """
    if DEBUG:
        app.logger.info("Processing form fill request")
    
    try:
        data = request.json
        
        if not data:
            return jsonify({
                'status': 'error',
                'message': 'No data provided'
            }), 400
        
        form_data = data.get('form_data', [])
        user_data = data.get('user_data', '')
        print("Form data is here: ", form_data)
        print("User data is here: ", user_data)
        if not form_data:
            return jsonify({
                'status': 'error',
                'message': 'No form data provided'
            }), 400
        
        if DEBUG:
            app.logger.info(f"Received {len(form_data)} form elements to fill")
        
        # Step 1: Structure the form data using OpenAI
        structured_form = structure_form_data(form_data)
        
        if not structured_form:
            return jsonify({
                'status': 'error',
                'message': 'Failed to structure form data'
            }), 500
        
        # Step 2: Use Claude to generate answers based on the user data
        form_answers = generate_form_answers(structured_form, user_data)
        
        if not form_answers:
            return jsonify({
                'status': 'error',
                'message': 'Failed to generate form answers'
            }), 500
        
        return jsonify({
            'status': 'success',
            'form_answers': form_answers
        })
        
    except Exception as e:
        app.logger.error(f"Error in form fill: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'Error processing form: {str(e)}'
        }), 500

def structure_form_data(form_data):
    """
    Use Claude to structure the form data into a standardized format.
    
    Returns a list of structured questions with possible answers and IDs.
    """
    try:
        if DEBUG:
            app.logger.info(f"Structuring {len(form_data)} form elements with Claude")
            app.logger.info(f"Form data preview: {json.dumps(form_data[:2])}")
        
        # Prepare the prompt
        prompt = """Structure the following form elements into a standard format. 
For each element, provide the question, possible answers, and the html_id.

IMPORTANT INSTRUCTIONS:
1. Make sure to create an entry for EVERY form element provided, don't skip any.
2. If no possible values are provided, use common sense to suggest appropriate values.
3. For text fields, suggest appropriate formats or examples.
4. If the label is unclear, try to determine the likely question based on context.
5. Use the ID or name as the html_id, keeping it exactly as provided.
6. For elements with the same label, use the position and surrounding context to differentiate them.

Form elements to structure:
"""
        
        # Add form elements details with better formatting
        for i, element in enumerate(form_data):
            prompt += f"\n--- ELEMENT {i+1} ---\n"
            prompt += f"Type: {element.get('type', 'text')}\n"
            prompt += f"Label: {element.get('label', 'Unlabeled field')}\n"
            prompt += f"ID: {element.get('id', '')}\n"
            prompt += f"Name: {element.get('name', '')}\n"
            prompt += f"Position: {element.get('position', i)}\n"
            
            # Include path and context if available
            if element.get('positionPath'):
                prompt += f"Position path: {element.get('positionPath')}\n"
            
            if element.get('surroundingContext'):
                prompt += f"Surrounding context: {element.get('surroundingContext')}\n"
            
            if element.get('possibleValues') and len(element.get('possibleValues')) > 0:
                prompt += "Possible values:\n"
                for value in element.get('possibleValues'):
                    prompt += f"- {value.get('text', '')} (value: {value.get('value', '')})\n"
        
        # Define the expected output format with more explicit instructions
        prompt += "\n--- OUTPUT FORMAT ---\n"
        prompt += "Respond with a JSON array of objects (one for each form element), each with the following structure:\n"
        prompt += """
{
  "question": "The question or field label (make this user-friendly and clear)",
  "possible_answers": ["array", "of", "possible", "answers", "or", "appropriate", "formats"],
  "html_id": "The exact HTML ID or name to identify the field (use id, or if empty, use name)"
}

Make sure to:
1. Parse ALL form elements
2. Return an array with one entry per element
3. Use exactly this JSON structure
4. Include only the JSON array in your response, no other text
5. For duplicate fields (same label), create a unique question by adding context or numbering
"""
        
        # Logging the full prompt for debugging
        if DEBUG:
            app.logger.info(f"Generated prompt: {prompt}")
        
        # Call Claude API to structure the form
        client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        
        # Fix: use system as a top-level parameter
        response = client.messages.create(
            model="claude-3-sonnet-20240229",
            max_tokens=1500,
            temperature=0.2,  # Lower temperature for more deterministic output
            system="You are a helpful assistant that structures form data into a standard format. You always follow instructions exactly and return properly formatted JSON arrays.",
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ],
        )
        
        # Extract the structured form data
        structured_text = response.content[0].text.strip()
        
        # Clean the response to extract just the JSON part
        json_match = re.search(r'\[.*\]', structured_text, re.DOTALL)
        if json_match:
            structured_text = json_match.group(0)
        
        if DEBUG:
            app.logger.info(f"Claude response: {structured_text[:200]}...")
        
        # Parse the JSON response
        try:
            structured_data = json.loads(structured_text)
            
            # Additional validation
            if isinstance(structured_data, list):
                if DEBUG:
                    app.logger.info(f"Successfully parsed {len(structured_data)} form elements")
                return structured_data
            elif isinstance(structured_data, dict) and 'form_structure' in structured_data:
                if DEBUG:
                    app.logger.info(f"Successfully parsed {len(structured_data['form_structure'])} form elements")
                return structured_data['form_structure']
            else:
                app.logger.error(f"Unexpected structure in Claude response: {structured_data}")
                return []
                
        except json.JSONDecodeError as e:
            app.logger.error(f"Failed to parse Claude JSON response: {e}")
            app.logger.error(f"Raw response: {structured_text}")
            return []
            
    except Exception as e:
        app.logger.error(f"Error structuring form data: {str(e)}")
        return []

def generate_form_answers(structured_form, user_data):
    """
    Use Claude to generate answers for the form fields based on the user's knowledge base data.
    
    Returns a list of answers for the form fields.
    """
    try:
        if DEBUG:
            app.logger.info(f"Generating answers for {len(structured_form)} form fields")
            app.logger.info(f"User data length: {len(user_data)}")
            
        # Prepare the prompt
        prompt = """Based on the user's personal information, generate appropriate answers for the following form fields.
If the user data doesn't contain relevant information for a field, make a reasonable guess based on the context.

USER'S PERSONAL INFORMATION:
"""
        prompt += user_data if user_data else "No personal information provided."
        
        prompt += "\n\nFORM FIELDS TO FILL:\n"
        
        # Add form fields
        for i, field in enumerate(structured_form):
            prompt += f"\n--- FIELD {i+1} ---\n"
            prompt += f"Question: {field.get('question', 'Unlabeled field')}\n"
            
            if field.get('possible_answers') and len(field.get('possible_answers')) > 0:
                prompt += "Possible answers:\n"
                for answer in field.get('possible_answers'):
                    prompt += f"- {answer}\n"
            
            prompt += f"HTML ID: {field.get('html_id', '')}\n"
        
        # Define the expected output format
        prompt += """\n--- OUTPUT INSTRUCTIONS ---
Return a JSON array with answers for each field, following this structure:
[
  {
    "html_id": "The HTML ID of the field (from the input)",
    "answer": "The appropriate answer based on user data"
  },
  ...
]

IMPORTANT:
1. If a field has possible answers, choose the most appropriate one from the list.
2. For text fields, provide a valid response based on user data or make a reasonable guess.
3. Make sure to provide an answer for EVERY field, don't skip any.
4. If you're unsure about a field, make your best guess based on the context.
5. Keep your answers realistic and appropriate.
6. Return only the JSON array, no additional text.
"""
        
        if DEBUG:
            app.logger.info(f"Generate answers prompt length: {len(prompt)}")
        
        # Call Claude API to generate answers
        client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        
        # Fix: use system as a top-level parameter
        response = client.messages.create(
            model="claude-3-sonnet-20240229",
            max_tokens=1500,
            temperature=0.2,  # Lower temperature for more deterministic output
            system="You are a helpful assistant that fills in forms based on user data. You are accurate, concise, and follow instructions precisely.",
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ],
        )
        
        # Extract the generated answers
        answer_text = response.content[0].text.strip()
        
        # Clean the response to extract just the JSON part
        json_match = re.search(r'\[.*\]', answer_text, re.DOTALL)
        if json_match:
            answer_text = json_match.group(0)
            
        if DEBUG:
            app.logger.info(f"Claude answer response: {answer_text[:200]}...")
        
        # Parse the JSON response
        try:
            answers_data = json.loads(answer_text)
            
            if isinstance(answers_data, list):
                if DEBUG:
                    app.logger.info(f"Successfully generated {len(answers_data)} answers")
                return answers_data
            else:
                app.logger.error(f"Unexpected structure in Claude answer response: {answers_data}")
                return []
                
        except json.JSONDecodeError as e:
            app.logger.error(f"Failed to parse Claude JSON answer response: {e}")
            app.logger.error(f"Raw answer response: {answer_text}")
            return []
            
    except Exception as e:
        app.logger.error(f"Error generating form answers: {str(e)}")
        return []

@app.route('/navigation-chrome', methods=['POST'])
def navigation_chrome():
    """
    Endpoint to process HTML content and transcript to generate navigation commands.
    
    Expected JSON payload:
    {
        "html_content": "HTML content of the page",
        "transcript": "User's voice transcript"
    }
    
    Returns:
    {
        "status": "success" | "error",
        "commands": [
            {
                "type": "click" | "scroll" | "focus" | "navigate",
                "target": "selector or description",
                "confidence": float,
                "explanation": "Why this action was chosen"
            }
        ],
        "message": "Optional error or success message"
    }
    """
    try:
        if DEBUG:
            app.logger.info("Received request to /navigation-chrome endpoint")
        
        if not request.is_json:
            return jsonify({
                'status': 'error',
                'message': 'Request must contain JSON data'
            }), 400
            
        data = request.json
        html_content = data.get('html_content')
        transcript = data.get('transcript')
        
        if not html_content or not transcript:
            return jsonify({
                'status': 'error',
                'message': 'Both html_content and transcript are required'
            }), 400
            
        if DEBUG:
            app.logger.info(f"Processing navigation request with transcript: {transcript}")
            
        client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        
        # Prepare the prompt for Claude
        prompt = f"""
        Based on the HTML content and user's voice transcript below, determine the appropriate navigation commands.
        Focus on identifying clickable elements, form inputs, or areas that match the user's intent.
        
        Return ONLY a JSON array of commands, where each command has:
        - "type": "click" | "scroll" | "focus" | "navigate"
        - "target": CSS selector or descriptive target
        - "confidence": 0.0 to 1.0 indicating confidence in the command
        - "explanation": Brief explanation of why this action was chosen
        
        HTML Content:
        {html_content}
        
        User Transcript:
        {transcript}
        
        Respond ONLY with the JSON array. No other text or explanation.
        """
        
        try:
            response = client.messages.create(
                model="claude-3-opus-20240229",
                max_tokens=1000,
                temperature=0.0,
                messages=[
                    {"role": "user", "content": prompt}
                ]
            )
            
            # Parse the response as JSON
            try:
                commands = json.loads(response.content[0].text)
                
                if DEBUG:
                    app.logger.info(f"Generated navigation commands: {commands}")
                    
                return jsonify({
                    'status': 'success',
                    'commands': commands
                })
                
            except json.JSONDecodeError as e:
                app.logger.error(f"Error parsing Claude response as JSON: {str(e)}")
                return jsonify({
                    'status': 'error',
                    'message': 'Failed to parse navigation commands',
                    'raw_response': response.content[0].text
                }), 500
                
        except Exception as e:
            app.logger.error(f"Error from Claude API: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': f'Claude API error: {str(e)}'
            }), 500
            
    except Exception as e:
        app.logger.error(f"Error in navigation-chrome endpoint: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

if __name__ == '__main__':
    print("Starting DEI Voice Assistant backend server...")
    print(f"Debug mode: {'ON' if DEBUG else 'OFF'}")
    # Use socketio.run instead of app.run
    socketio.run(app, debug=True, host='0.0.0.0', port=5001, allow_unsafe_werkzeug=True)
