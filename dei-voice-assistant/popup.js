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
    console.log("Message received in popup:", request);
    
    // Handle different message types
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

  async function startRecording() {
    try {
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
  window.testTool = function(toolName) {
    fetch(`http://127.0.0.1:5001/test-socket?tool=${toolName}`, {
      method: "POST"
    })
    .then(response => response.json())
    .then(data => {
      console.log("Test tool response:", data);
      updateStatus(`Test tool request sent: ${toolName}`);
    })
    .catch(error => {
      console.error("Error testing tool:", error);
      updateStatus("Error testing tool");
    });
  };

  recordBtn.addEventListener("click", async () => {
    if (isRecording) {
      stopRecording();
    } else {
      await startRecording();
    }
  });
  
  // Add test buttons if in development mode
  if (true) { // Change to a config variable if needed
    const testPanel = document.createElement('div');
    testPanel.className = 'test-panel';
    testPanel.innerHTML = `
      <h3>Test Tools</h3>
      <div class="test-buttons">
        <button onclick="testTool('summarize')">Test Summarize</button>
        <button onclick="testTool('find')">Test Find</button>
        <button onclick="testTool('extract_entities')">Test Entities</button>
      </div>
    `;
    document.body.appendChild(testPanel);
  }

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
        
        // Inject the summary into the page for display
        injectSummaryIntoPage(data.summary);
        
        // Return the summary for popup display
        resolve(data.summary);
      })
      .catch(error => {
        console.error("Error in summarizeContent:", error);
        reject(error);
      });
    });
  }

  // Function to inject and display the summary in the current page
  function injectSummaryIntoPage(summary) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0]) {
        console.error("No active tab found for displaying summary");
        return;
      }
      
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        args: [summary],
        function: (summaryText) => {
          try {
            // Check if summary container already exists
            let summaryContainer = document.getElementById('dei-summary-container');
            
            if (!summaryContainer) {
              // Create the summary container
              summaryContainer = document.createElement('div');
              summaryContainer.id = 'dei-summary-container';
              summaryContainer.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                width: 300px;
                max-height: 400px;
                background-color: #fff;
                border: 1px solid #ccc;
                border-radius: 8px;
                padding: 15px;
                box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                z-index: 10000;
                overflow-y: auto;
                font-family: Arial, sans-serif;
              `;
              
              // Create the summary header
              const header = document.createElement('div');
              header.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
                border-bottom: 1px solid #eee;
                padding-bottom: 10px;
              `;
              
              const title = document.createElement('h3');
              title.textContent = 'Page Summary';
              title.style.margin = '0';
              
              const closeButton = document.createElement('button');
              closeButton.innerHTML = '&times;';
              closeButton.style.cssText = `
                background: none;
                border: none;
                font-size: 20px;
                cursor: pointer;
              `;
              closeButton.onclick = () => {
                document.body.removeChild(summaryContainer);
              };
              
              header.appendChild(title);
              header.appendChild(closeButton);
              summaryContainer.appendChild(header);
              
              // Create the content area
              const content = document.createElement('div');
              content.id = 'dei-summary-content';
              summaryContainer.appendChild(content);
              
              // Add to the page
              document.body.appendChild(summaryContainer);
            }
            
            // Update the summary content
            const contentArea = document.getElementById('dei-summary-content');
            if (contentArea) {
              contentArea.textContent = summaryText;
            }
            
            return true;
          } catch (error) {
            console.error("Error displaying summary:", error);
            return false;
          }
        }
      });
    });
  }
});
