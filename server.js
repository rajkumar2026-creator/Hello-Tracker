const express = require("express");

const app = express();
const PORT = process.env.PORT || 10000; // important for Render

app.use(express.static("public"));

app.get("/track", (req, res) => {
  res.json({
    status: "ok",
    time: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
