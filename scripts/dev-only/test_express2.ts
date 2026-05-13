import express from "express";
const app = express();
try {
  app.get("(.*)", (req, res) => res.send("ok"));
  console.log("Success with (.*)");
} catch (e) {
  console.log("Error with (.*):", e.message);
}
try {
  app.get("/*", (req, res) => res.send("ok"));
  console.log("Success with /*");
} catch (e) {
  console.log("Error with /*:", e.message);
}
try {
  app.get("*", (req, res) => res.send("ok"));
  console.log("Success with *");
} catch (e) {
  console.log("Error with *:", e.message);
}
try {
  app.get("*all", (req, res) => res.send("ok"));
  console.log("Success with *all");
} catch (e) {
  console.log("Error with *all:", e.message);
}
try {
  app.get("/*all", (req, res) => res.send("ok"));
  console.log("Success with /*all");
} catch (e) {
  console.log("Error with /*all:", e.message);
}
