window.addEventListener("load", () => {
  const pageContent = document.documentElement.innerHTML;
  console.log("Page HTML:", pageContent);
});

const sendPageContent = async (content) => {
  try {
    const response = await fetch("http://localhost:5000/transcript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: content }),
    });
    const data = await response.json();
    console.log("Backend response:", data);

    chrome.runtime.sendMessage({
      message: "Transcript received successfully!",
      summary: data.summary,
    });
  } catch (error) {
    console.error("Error sending page content:", error);
  }
};

sendPageContent(pageContent);
