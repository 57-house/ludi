try {
  require("./server.js");
} catch (err) {
  console.error("LUDI : échec au démarrage!", err);
  throw err;
}
