require("dotenv").config();
const { createApp } = require("./app");

const PORT = process.env.PORT || 4000;
const app = createApp();

app.listen(PORT, () => {
  console.log(`Omni-AI server listening on port ${PORT}`);
});
