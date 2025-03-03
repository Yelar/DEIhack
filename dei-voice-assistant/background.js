// Global variables
let socketConnected = false;
let socket = null;
const DEBUG = true;  // Enable debugging

// Debug logging function
function debugLog(...args) {
  if (DEBUG) {
    console.log("[DEI Extension Background]", ...args);
  }
}

// Background script initialization
chrome.runtime.onInstalled.addListener(() => {
  debugLog("DEI Voice Assistant Extension Installed");
});

// Message handler for communication with the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  debugLog("Background script received message:", request.action || "unknown action", "from:", sender.tab ? "content script" : "popup");
  
  // Handle screenshot capture request
  if (request.action === "captureScreenshot" && request.selection) {
    debugLog("Screenshot capture requested with selection:", request.selection);
    
    try {
      // Capture the current tab
      chrome.tabs.captureVisibleTab(null, { format: 'png' }, function(dataUrl) {
        if (chrome.runtime.lastError) {
          const errorMsg = chrome.runtime.lastError.message;
          debugLog("Error capturing screenshot:", errorMsg);
          sendResponse({ error: errorMsg });
          return;
        }
        
        if (!dataUrl) {
          debugLog("No data URL returned from captureVisibleTab");
          sendResponse({ error: "No screenshot data received" });
          return;
        }
        
        debugLog("Screenshot captured successfully, sending to content script for processing");
        
        // Service workers can't use the Image constructor, so we'll send the full image back
        // and let the content script do the cropping
        sendResponse({ fullScreenshot: dataUrl });
      });
    } catch (error) {
      debugLog("Exception in captureScreenshot handler:", error);
      sendResponse({ error: "Exception: " + error.message });
    }
    
    // Return true to indicate we'll respond asynchronously
    return true;
  }
  
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
  
  // Handle openKnowledgeBase message
  else if (request.action === "openKnowledgeBase") {
    chrome.tabs.create({
      url: chrome.runtime.getURL("knowledge-base.html")
    });
  }
  
  // Handle knowledge base data sync request
  else if (request.action === "requestKnowledgeBaseData") {
    debugLog("Knowledge base data sync requested");
    
    // Query all tabs to find knowledge-base.html tabs
    chrome.tabs.query({}, (tabs) => {
      const knowledgeBaseTabs = tabs.filter(tab => 
        tab.url && tab.url.includes('knowledge-base.html')
      );
      
      if (knowledgeBaseTabs.length > 0) {
        debugLog(`Found ${knowledgeBaseTabs.length} knowledge base tabs`);
        
        // Use a timeout to handle cases where the tab doesn't respond
        let responseReceived = false;
        const timeoutId = setTimeout(() => {
          if (!responseReceived) {
            debugLog("Timeout waiting for knowledge base data");
            sendResponse({ success: false, error: "Timeout waiting for response" });
          }
        }, 2000);
        
        // Send a message to the first knowledge base tab to get the latest data
        chrome.tabs.sendMessage(knowledgeBaseTabs[0].id, {
          action: "getKnowledgeBaseData"
        }, (response) => {
          responseReceived = true;
          clearTimeout(timeoutId);
          
          if (chrome.runtime.lastError) {
            debugLog("Error getting knowledge base data:", chrome.runtime.lastError);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
            return;
          }
          
          if (response && response.knowledgeItems) {
            debugLog(`Received ${response.knowledgeItems.length} knowledge items`);
            
            // Send the data back to the requesting tab
            try {
              sendResponse({ 
                success: true, 
                knowledgeItems: response.knowledgeItems 
              });
            } catch (error) {
              debugLog("Error processing knowledge base data:", error);
              sendResponse({ success: false, error: error.message });
            }
          } else {
            debugLog("No knowledge items received");
            sendResponse({ success: false, error: "No knowledge items received" });
          }
        });
        
        // Return true to indicate we'll respond asynchronously
        return true;
      } else {
        debugLog("No knowledge base tabs found");
        sendResponse({ success: false, error: "No knowledge base tabs found" });
      }
    });
    
    // Return true to indicate we'll respond asynchronously
    return true;
  }
  
  // Handle knowledge base data update broadcast
  else if (request.action === "knowledgeBaseUpdated") {
    debugLog("Knowledge base data updated, broadcasting to all tabs");
    
    // Broadcast to all tabs except the sender
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        // Skip sender tab
        if (sender.tab && sender.tab.id === tab.id) {
          return;
        }
        
        // Send update to each tab
        try {
          chrome.tabs.sendMessage(tab.id, {
            action: "updateKnowledgeBase",
            knowledgeItems: request.knowledgeItems
          });
        } catch (error) {
          debugLog(`Error sending update to tab ${tab.id}:`, error);
        }
      });
    });
    
    // Acknowledge receipt
    sendResponse({ success: true });
    return true;
  }
  
  // Return true to indicate we might respond asynchronously
  return true;
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  debugLog("Extension icon clicked", tab.id);
});
