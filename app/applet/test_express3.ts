import express from "express";
const app = express();
app.get("*all", (req, res) => res.send("caught by *all"));
app.listen(3001, () => {
  console.log("Server running");
  fetch("http://localhost:3001/some/random/path")
    .then(res => res.text())
    .then(text => {
      console.log("Response:", text);
      process.exit(0);
    })
    .catch(e => {
      console.error(e);
      process.exit(1);
    });
});
