const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const { appRoutes } = require("./presentation/routes");
const { oaiRoutes } = require("./presentation/routes/oaiRoutes");

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", appRoutes);
app.use("/oai", oaiRoutes);

module.exports = app;
