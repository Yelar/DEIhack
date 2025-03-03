// Global variables
let socketConnected = false;
let socket = null;

// Background script initialization
chrome.runtime.onInstalled.addListener(() => {
  console.log("DEI Voice Assistant Extension Installed");
});

// Message handler for communication with the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Background script received message:", request, "from:", sender);
  
  // Handle text-to-speech request from the page
  if (request.action === "readAloud" && request.data?.text) {
    console.log("Read Aloud requested for text:", request.data.text.substring(0, 50) + "...");
    
    // Forward to the popup if it's open
    chrome.runtime.sendMessage({
      action: "convertToSpeech",
      data: { text: request.data.text }
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.log("Popup not available, handling TTS directly");
        
        // Make the API call directly from background if popup is closed
        fetch("http://127.0.0.1:5001/text_to_speech", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            text: request.data.text,
            voice: "alloy" // OpenAI voice option
          })
        })
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.blob();
        })
        .then(audioBlob => {
          // Create a notification that TTS is ready
          chrome.notifications.create({
            type: "basic",
            iconUrl: "icon.png",
            title: "Text to Speech",
            message: "Audio is ready. Click the extension to listen."
          });
          
          // Store the audio for later playback
          chrome.storage.local.set({
            "pendingAudio": {
              timestamp: Date.now(),
              // We can't store the blob directly, so we'll need to open the popup
              pending: true
            }
          });
        })
        .catch(error => {
          console.error("Error in background TTS:", error);
        });
      } else {
        console.log("Popup handled TTS, response:", response);
      }
    });
    
    sendResponse({ status: "processing" });
    return true;
  }
  
  // Handle legacy messages (from earlier version)
  else if (request.message === "Transcript received successfully!" && request.summary) {
    try {
      const parsedSummary = JSON.parse(request.summary);

      if (parsedSummary.command === "open_url" && parsedSummary.parameters?.url) {
        chrome.tabs.create({ url: parsedSummary.parameters.url });
        sendResponse({
          status: "success",
          message: "URL opened successfully.",
        });
      } else {
        sendResponse({
          status: "error",
          message: "Invalid command or missing parameters.",
        });
      }
    } catch (error) {
      console.error("Error parsing summary JSON:", error);
      sendResponse({
        status: "error",
        message: "Failed to parse command JSON.",
      });
    }
  }
  
  // Handle ping from popup
  else if (request.action === "ping") {
    sendResponse({ status: "active" });
  }
  
  // Handle convertToSpeech response
  else if (request.action === "convertToSpeechResult") {
    console.log("TTS conversion result received");
    sendResponse({ status: "received" });
  }
  
  // Return true to indicate we might respond asynchronously
  return true;
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  console.log("Extension icon clicked", tab);
});
