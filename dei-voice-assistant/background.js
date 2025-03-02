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
  
  // Handle legacy messages (from earlier version)
  if (request.message === "Transcript received successfully!" && request.summary) {
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
  
  // Return true to indicate we might respond asynchronously
  return true;
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  console.log("Extension icon clicked", tab);
});
