// Watch real-time notifications arrive, using only the browser.
//   1. Open http://localhost:8080/status
//   2. Open the console (Cmd+Option+J in Chrome)
//   3. Paste everything below and press Enter. (Chrome may ask you to type
//      "allow pasting" first.)
//   4. Run: npm run test:publish -w notification-service
// Change the email to log in as someone else from the demo data.

(async () => {
  const email = "grace@grace.test";

  const login = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123" }),
  });
  const { token } = await login.json();

  await new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://cdn.socket.io/4.8.1/socket.io.min.js";
    script.onload = resolve;
    document.head.append(script);
  });

  const socket = io("http://localhost:4004", { auth: { token }, transports: ["websocket"] });

  socket.on("connect", () => console.log(`Connected as ${email}. Waiting for events...`));
  socket.on("connect_error", (err) => console.log("Could not connect:", err.message));
  socket.on("notification:new", (item) => console.log("notification:new ->", item.message, item));
  socket.on("task:updated", (item) => console.log("task:updated ->", item));
  socket.on("wish:new", (item) => console.log("wish:new ->", item.fromName, item.text));

  window.socket = socket; // lets you try socket.emit(...) by hand
})();
