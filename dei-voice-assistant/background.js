chrome.runtime.onInstalled.addListener(() => {
  console.log("Voice Recorder Extension Installed");
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (
    request.message === "Transcript received successfully!" &&
    request.summary
  ) {
    try {
      const parsedSummary = JSON.parse(request.summary);

      if (
        parsedSummary.command === "open_url" &&
        parsedSummary.parameters?.url
      ) {
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
      sendResponse({
        status: "error",
        message: "Failed to parse command JSON.",
      });
    }
  }
  return true;
});
