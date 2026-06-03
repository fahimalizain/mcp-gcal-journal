#!/usr/bin/env node
import { startServer } from "./server/index.js";

startServer().catch(console.error);
