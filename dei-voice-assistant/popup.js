document.addEventListener("DOMContentLoaded", () => {
  const recordBtn = document.getElementById("recordBtn");
  const wave = document.getElementById("wave");
  const status = document.getElementById("status");
  const transcriptEl = document.getElementById("transcript");
  const audioPlayer = document.getElementById("audioPlayer");
  const summaryEl = document.getElementById("summary");

  let mediaRecorder;
  let audioChunks = [];
  let isRecording = false;
  let recognition;
  const backendUrl = "http://127.0.0.1:5001/transcript"; // Adjust if needed
  
  // Socket connection to the backend
  const socket = io("http://127.0.0.1:5001/");
  let isSocketConnected = false;
  
  // Handle socket connection events
  socket.on("connect", () => {
    console.log("Popup connected to server socket");
    isSocketConnected = true;
    updateStatus("Connected to server");
  });
  
  socket.on("connect_error", (error) => {
    console.error("Socket connection error:", error);
    isSocketConnected = false;
    updateStatus("Server connection error");
  });
  
  socket.on("disconnect", () => {
    console.log("Disconnected from server socket");
    isSocketConnected = false;
    updateStatus("Disconnected from server");
  });

  // Listen for stop_audio events from the server
  socket.on("stop_audio", (data) => {
    console.log("Stop audio event received:", data);
    
    // Stop any playing audio in the popup
    const audioPlayer = document.getElementById("audioPlayer");
    if (audioPlayer) {
      audioPlayer.pause();
      audioPlayer.currentTime = 0;
      audioPlayer.style.display = 'none';
    }
    
    updateStatus("Audio playback interrupted");
  });

  // Listen for tool_called events from the server
  socket.on("tool_called", (data) => {
    console.log("Tool called event received:", data);
    
    if (data.tool === "summarize") {
      updateStatus("Extracting page content for summarization...");
      extractPageContent()
        .then(content => {
          if (!content || content.length < 10) {
            updateStatus("Error: Could not extract sufficient content from page");
            return;
          }
          updateStatus(`Extracted ${content.length} characters. Sending to API...`);
          return summarizeContent(content);
        })
        .then(summary => {
          if (summary) {
            // Display the summary in the popup
            if (summaryEl) {
              summaryEl.innerText = summary;
              summaryEl.style.display = "block";
            }
            updateStatus("Summary complete!");
          }
        })
        .catch(error => {
          console.error("Summarization error:", error);
          updateStatus("Error: " + error.message);
        });
    } else if (data.tool === "fill the form") {
      updateStatus("Filling the form...");
      fillForm()
        .then(response => {
          updateStatus("Form filled successfully");
        })
    }
  });
  
  // Listen for welcome message from server
  socket.on("welcome", (data) => {
    console.log("Welcome message received:", data);
    updateStatus("Server connection established");
  });
  
  // Listen for general messages from server
  socket.on("message", (data) => {
    console.log("Message from server:", data);
  });
  
  // Function to send messages to the content script
  function sendMessageToContentScript(message) {
    console.log("Sending message to content script:", message);
    
    // Query for the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        const activeTabId = tabs[0].id;
        
        // Send directly to content script first
        chrome.tabs.sendMessage(activeTabId, message, (response) => {
          if (chrome.runtime.lastError) {
            console.error("Direct message to content script failed:", chrome.runtime.lastError);
            console.log("Attempting to relay through background script...");
            
            // If direct messaging fails, try going through the background script
            chrome.runtime.sendMessage({
              action: message.action,
              data: message.data,
              targetTabId: activeTabId
            }, (backgroundResponse) => {
              if (chrome.runtime.lastError) {
                console.error("Background relay also failed:", chrome.runtime.lastError);
                updateStatus("Connection error. Please refresh the page and try again.");
              } else {
                console.log("Message relayed through background:", backgroundResponse);
              }
            });
          } else {
            console.log("Direct content script response:", response);
          }
        });
      } else {
        console.error("No active tab found");
        updateStatus("Error: No active tab found");
      }
    });
  }
  
  // Listen for messages from the content script or background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Popup received message:", request);
    
    // Handle text-to-speech request from background
    if (request.action === "convertToSpeech" && request.data?.text) {
      console.log("Converting text to speech from page request");
      
      // Indicate that processing has started
      updateStatus("Processing speech request...");
      
      textToSpeech(request.data.text)
        .then(audioBlob => {
          // Auto-play the audio immediately
          playAudio(audioBlob);
          sendResponse({ status: "success", message: "Audio playback started automatically" });
        })
        .catch(error => {
          console.error("Error converting to speech:", error);
          updateStatus("Speech conversion failed: " + error.message);
          sendResponse({ status: "error", message: error.toString() });
        });
      
      // Return true to indicate we'll respond asynchronously
      return true;
    }
    
    // Handle summarizeResult messages
    if (request.action === "summarizeResult") {
      // Display the summary result in the popup
      if (summaryEl) {
        summaryEl.innerText = request.data.summary;
        summaryEl.style.display = "block";
      }
      
      updateStatus("Summary complete!");
    } else if (request.message && request.summary) {
      // Legacy format for summary messages
      if (summaryEl) {
        summaryEl.innerText = request.summary;
        summaryEl.style.display = "block";
      }
      updateStatus(request.message);
    }
    
    // Always return true if you need to send an asynchronous response
    return true;
  });
  
  // Function to update status display
  function updateStatus(message) {
    if (status) {
      status.innerText = message;
    }
  }

  // Function to stop any playing audio on the page
  function stopAudioPlayback() {
    // Stop audio in the popup
    const audioPlayer = document.getElementById("audioPlayer");
    if (audioPlayer) {
      audioPlayer.pause();
      audioPlayer.currentTime = 0;
      audioPlayer.style.display = 'none';
    }
    
    // Tell the backend to stop any active TTS processes
    fetch("http://127.0.0.1:5001/stop_audio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
    .then(response => {
      console.log("Audio stop request sent to backend");
    })
    .catch(error => {
      console.error("Error sending stop audio request:", error);
    });
    
    updateStatus("Audio playback stopped");
  }

  // Start recording audio
  async function startRecording() {
    try {
      // Stop any playing audio first
      stopAudioPlayback();
      
      // Get the audio stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = () => {
        // Create audio blob for playback (optional)
        const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
        const audioURL = URL.createObjectURL(audioBlob);
        audioPlayer.src = audioURL;
        audioPlayer.style.display = "block";
      };

      // Start recording audio
      mediaRecorder.start();

      // Start live transcription concurrently
      if (!("webkitSpeechRecognition" in window)) {
        transcriptEl.innerText =
          "Speech recognition not supported in this browser.";
        return;
      }
      recognition = new webkitSpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      let finalTranscript = "";
      recognition.onresult = (event) => {
        let interimTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        transcriptEl.innerText = `Transcript: ${finalTranscript} ${interimTranscript}`;
      };

      recognition.onerror = (event) => {
        transcriptEl.innerText = `Error: ${event.error}`;
      };

      recognition.onend = () => {
        if (finalTranscript) {
          sendTranscript(finalTranscript);
        }
      };

      recognition.start();

      isRecording = true;
      status.innerText = "Recording...";
      recordBtn.innerText = "Stop";
      recordBtn.classList.add("recording");
      wave.classList.add("active");
    } catch (error) {
      console.error("Error accessing microphone:", error);
      status.innerText =
        "Microphone access denied. Please allow access in browser settings.";
    }
  }

  function stopRecording() {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      isRecording = false;
      recordBtn.innerText = "Rec";
      recordBtn.classList.remove("recording");
      wave.classList.remove("active");
      if (recognition) {
        recognition.stop();
      }
      status.innerText = "Recording stopped";
    }
  }

  async function sendTranscript(transcript) {
    try {
      updateStatus("Processing transcript...");
      
      const response = await fetch(backendUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      
      const data = await response.json();
      console.log("Backend response:", data);

      if (data.selected_tool) {
        updateStatus(`Tool selected: ${data.selected_tool}`);
      }
      
      // Legacy handling for direct summaries
      if (data.summary) {
        if (summaryEl) {
          summaryEl.innerText = data.summary;
          summaryEl.style.display = "block";
        }
      }
    } catch (error) {
      console.error("Error sending transcript:", error);
      updateStatus("Error processing transcript");
    }
  }

  // Test function to manually test the tool selection
  function testTool(toolName) {
    if (!toolName) return;
    
    console.log(`Testing ${toolName} tool...`);
    
    fetch(`http://127.0.0.1:5001/test-socket?tool=${toolName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    })
    .then(response => response.json())
    .then(data => {
      console.log(`Test request sent: ${data.message}`);
    })
    .catch(error => {
      console.error(`Test request failed: ${error}`);
    });
  }

  // Add the test function to the window object for console access
  window.testTool = testTool;

  recordBtn.addEventListener("click", () => {
    if (!isRecording) {
      startRecording();
    } else {
      stopRecording();
    }
  });

  // Function to extract page content directly using executeScript
  function extractPageContent() {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || !tabs[0]) {
          reject(new Error("No active tab found"));
          return;
        }
        
        // Execute script in the active tab to extract text
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          function: () => {
            try {
              // Get the main content of the page, excluding scripts, styles, etc.
              let content = document.body.innerText;
              
              // Clean up the content (remove excessive whitespace)
              content = content.replace(/\s+/g, ' ').trim();
              
              return {
                success: true,
                content: content,
                length: content.length
              };
            } catch (error) {
              return {
                success: false,
                error: error.toString()
              };
            }
          }
        }, (results) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          
          if (!results || !results[0]) {
            reject(new Error("Failed to execute content extraction script"));
            return;
          }
          
          const result = results[0].result;
          if (!result.success) {
            reject(new Error(result.error || "Unknown error extracting content"));
            return;
          }
          
          console.log(`Successfully extracted ${result.length} characters from page`);
          resolve(result.content);
        });
      });
    });
  }

  // Function to send content directly to the summarization API
  function summarizeContent(content) {
    return new Promise((resolve, reject) => {
      // Create an abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      fetch("http://127.0.0.1:5001/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: content }),
        signal: controller.signal
      })
      .then(response => {
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return response.json();
      })
      .then(data => {
        console.log("Summarization API response:", data);
        
        if (!data.summary) {
          throw new Error("API did not return a summary");
        }
        
        // Display summary in popup only (no page injection)
        if (summaryEl) {
          summaryEl.innerText = data.summary;
          summaryEl.style.display = "block";
        }
        
        // Convert summary to speech
        textToSpeech(data.summary)
          .then(audioBlob => {
            console.log("Text-to-speech conversion successful");
            // Play the audio
            playAudio(audioBlob);
          })
          .catch(error => {
            console.error("Text-to-speech error:", error);
            updateStatus("Error converting text to speech");
          });
        
        // Return the summary for popup display
        resolve(data.summary);
      })
      .catch(error => {
        console.error("Error in summarizeContent:", error);
        reject(error);
      });
    });
  }

  // Function to convert text to speech using the backend API
  function textToSpeech(text) {
    return new Promise((resolve, reject) => {
      updateStatus("Converting summary to speech...");
      
      // Create an abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      fetch("http://127.0.0.1:5001/text_to_speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          text: text,
          voice: "alloy" // OpenAI voice option: alloy, echo, fable, onyx, nova, or shimmer
        }),
        signal: controller.signal
      })
      .then(response => {
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // The response should be audio data
        return response.blob();
      })
      .then(audioBlob => {
        console.log("Received audio blob, size:", audioBlob.size);
        updateStatus("Speech ready - playing now");
        
        // Immediately play the audio without requiring user interaction
        resolve(audioBlob);
      })
      .catch(error => {
        console.error("Error in textToSpeech:", error);
        reject(error);
      });
    });
  }

  // Function to play audio from a blob
  function playAudio(audioBlob) {
    // Create audio URL from the blob
    const audioUrl = URL.createObjectURL(audioBlob);
    
    // Get or create audio element
    let audioPlayer = document.getElementById('audioPlayer');
    if (!audioPlayer) {
      audioPlayer = document.createElement('audio');
      audioPlayer.id = 'audioPlayer';
      // Never show controls
      audioPlayer.controls = false;
      audioPlayer.style.display = 'none';
      document.body.appendChild(audioPlayer);
    }
    
    // Add event handling for interruptions
    const handleRecordClick = () => {
      // Clean up URL when recording starts
      URL.revokeObjectURL(audioUrl);
      audioPlayer.removeEventListener('ended', handleEnded);
      audioPlayer.pause();
      audioPlayer.currentTime = 0;
    };
    
    // Add the event listener to the record button
    const recordBtn = document.getElementById('recordBtn');
    if (recordBtn) {
      recordBtn.addEventListener('click', handleRecordClick, { once: true });
    }
    
    // Handle completion
    const handleEnded = () => {
      URL.revokeObjectURL(audioUrl);
      updateStatus("Summary complete");
      // Remove the record button event listener since it's no longer needed
      if (recordBtn) {
        recordBtn.removeEventListener('click', handleRecordClick);
      }
    };
    
    // Set the audio source and play
    audioPlayer.src = audioUrl;
    
    // Show visual feedback that audio is playing without showing controls
    updateStatus("Playing summary audio...");
    
    // Auto-play
    audioPlayer.play()
      .then(() => {
        console.log("Audio playback started automatically");
      })
      .catch(error => {
        console.error("Audio playback error:", error);
        
        // Even if autoplay fails, don't show controls
        updateStatus("Error playing audio: " + error.message);
        
        URL.revokeObjectURL(audioUrl);
        if (recordBtn) {
          recordBtn.removeEventListener('click', handleRecordClick);
        }
      });
    
    // Set up event for when playback ends
    audioPlayer.onended = handleEnded;
  }
});
